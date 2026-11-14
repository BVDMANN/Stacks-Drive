/** RideCheck maison — logique serveur (v2.34).
 *
 *  Déclencheur : le chauffeur partage sa position pendant la course
 *  en cours (POST /api/rides/[id]/ridecheck, ~toutes les 30 s, via
 *  la navigation chauffeur). Chaque échantillon est évalué par
 *  `evaluateRideCheck` (`lib/ridecheck.ts`) ; les compteurs de
 *  confirmations vivent en base (`ridecheck_events`) — deux
 *  évaluations consécutives confirment un signal et ouvrent un
 *  check-in passager. L'alerte admin ne part que sur « Problème »
 *  ou après 3 min sans réponse (balayage au sondage passager GET).
 *  Jamais de blocage du chauffeur, jamais d'action automatique sur
 *  la course.
 *
 *  Résilience : sans la migration v2.34, les écritures en base
 *  échouent proprement et l'évaluation se limite à un log — la
 *  course n'est jamais bloquée par RideCheck. Le dernier échantillon
 *  est gardé en mémoire par instance (best-effort sur serverless) :
 *  sans échantillon précédent, aucun signal ne se confirme — un cas
 *  isolé ne suffit jamais, par construction.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';
import { fetchRoadRoute, type RoadRoute } from './routing';
import { haversineKm } from './geo';
import {
  RIDECHECK_CONFIRM_COUNT,
  RIDECHECK_NO_RESPONSE_MINUTES,
  RIDECHECK_SIGNAL_LABELS,
  evaluateRideCheck,
  isSignalConfirmed,
  type RideCheckSignal,
} from './ridecheck';
import { notifyAdminAlert } from './admin-alerts';
import { logAudit } from './audit';

type Db = SupabaseClient;

interface LastSample {
  lat: number;
  lng: number;
  atMs: number;
  distanceTravelledKm: number;
}

const lastSamples = new Map<string, LastSample>();
const routeCache = new Map<string, { route: RoadRoute; atMs: number }>();
const ROUTE_CACHE_MS = 10 * 60 * 1000;

export interface RideCheckPending {
  signal: RideCheckSignal;
  label: string;
  detail: string | null;
  askedAt: string;
}

export interface RideCheckState {
  pending: RideCheckPending[];
  answered: { signal: RideCheckSignal; status: string }[];
}

/** Lit l'état RideCheck d'une course (check-ins en attente + réponses). */
export async function getRideCheckState(supabase: Db, rideId: string): Promise<RideCheckState> {
  const state: RideCheckState = { pending: [], answered: [] };
  const { data, error } = await supabase
    .from('ridecheck_events')
    .select('signal, checkin_status, detail, created_at')
    .eq('ride_id', rideId)
    .order('created_at', { ascending: false });
  if (error) return state;
  for (const r of (data ?? []) as {
    signal: RideCheckSignal;
    checkin_status: string;
    detail: string | null;
    created_at: string;
  }[]) {
    if (r.checkin_status === 'pending') {
      state.pending.push({
        signal: r.signal,
        label: RIDECHECK_SIGNAL_LABELS[r.signal],
        detail: r.detail,
        askedAt: r.created_at,
      });
    } else if (r.checkin_status !== 'none') {
      state.answered.push({ signal: r.signal, status: r.checkin_status });
    }
  }
  return state;
}

/** Balayage « sans réponse » : un check-in en attente depuis plus de
 *  3 min → statut `no_response` + UNE alerte admin par course et
 *  par signal. Déclenché par le sondage passager (GET) — sans
 *  nouveau cron. */
export async function sweepRideCheckNoResponse(
  supabase: Db,
  ride: { id: string; pickup: string; destination: string }
): Promise<void> {
  const cutoff = new Date(Date.now() - RIDECHECK_NO_RESPONSE_MINUTES * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('ridecheck_events')
    .select('id, signal, detail, created_at')
    .eq('ride_id', ride.id)
    .eq('checkin_status', 'pending')
    .lt('created_at', cutoff);
  for (const r of (data ?? []) as {
    id: string;
    signal: RideCheckSignal;
    detail: string | null;
    created_at: string;
  }[]) {
    const { error } = await supabase
      .from('ridecheck_events')
      .update({ checkin_status: 'no_response', responded_at: new Date().toISOString(), alerted_at: new Date().toISOString() })
      .eq('id', r.id)
      .eq('checkin_status', 'pending');
    if (error) continue;
    await notifyAdminAlert({
      kind: 'ridecheck_no_response',
      key: `ridecheck:${r.signal}:${ride.id}`,
      detail: `RideCheck — le passager n’a pas répondu au check-in « ${RIDECHECK_SIGNAL_LABELS[r.signal]} » sur la course ${ride.pickup} → ${ride.destination} (demandé à ${r.created_at}, sans réponse depuis plus de ${RIDECHECK_NO_RESPONSE_MINUTES} min).${r.detail ? `\nDétail : ${r.detail}` : ''}`,
      adminUrl: `/admin`,
    });
    await logAudit(supabase, 'ridecheck_no_response', { rideId: ride.id, signal: r.signal });
  }
}

/** Évalue un échantillon de position pendant une course en cours.
 *  Retourne les signaux nouvellement confirmés (check-in à afficher). */
export async function evaluateRideCheckSample(
  supabase: Db,
  ride: {
    id: string;
    pickup: string;
    destination: string;
    started_at: string | null;
    distance_km: number | null;
    duration_min: number | null;
  },
  sample: { lat: number; lng: number }
): Promise<{ confirmedSignals: RideCheckSignal[] }> {
  const nowMs = Date.now();
  const pickupCoords = NEIGHBORHOOD_COORDS[ride.pickup as Neighborhood];
  const destCoords = NEIGHBORHOOD_COORDS[ride.destination as Neighborhood];
  if (!pickupCoords || !destCoords || !ride.started_at) return { confirmedSignals: [] };
  const prev = lastSamples.get(ride.id) ?? null;
  const movedKm = prev ? haversineKm(prev.lat, prev.lng, sample.lat, sample.lng) : 0;
  const distanceTravelledKm = (prev?.distanceTravelledKm ?? 0) + movedKm;
  lastSamples.set(ride.id, { lat: sample.lat, lng: sample.lng, atMs: nowMs, distanceTravelledKm });

  // Itinéraire routier OSRM (cache 10 min par course ; repli ligne droite).
  const cached = routeCache.get(ride.id);
  let route: RoadRoute;
  if (cached && nowMs - cached.atMs < ROUTE_CACHE_MS) {
    route = cached.route;
  } else {
    route = await fetchRoadRoute(
      { lat: pickupCoords.lat, lng: pickupCoords.lng },
      { lat: destCoords.lat, lng: destCoords.lng }
    );
    routeCache.set(ride.id, { route, atMs: nowMs });
  }

  const results = evaluateRideCheck(
    { lat: sample.lat, lng: sample.lng, atMs: nowMs },
    prev ? { lat: prev.lat, lng: prev.lng, atMs: prev.atMs } : null,
    {
      pickup: pickupCoords,
      destination: destCoords,
      routeGeometry: route.geometry,
      estimatedDurationMin: route.durationMin,
      estimatedDistanceKm: route.distanceKm,
      startedAtMs: new Date(ride.started_at).getTime(),
      distanceTravelledKm,
    }
  );
  if (results.length === 0) return { confirmedSignals: [] };

  const confirmed: RideCheckSignal[] = [];
  for (const result of results) {
    // Compteur de confirmations en base (upsert par course + signal).
    const { data: existing } = await supabase
      .from('ridecheck_events')
      .select('id, consecutive_count, checkin_status')
      .eq('ride_id', ride.id)
      .eq('signal', result.signal)
      .single();
    if (!existing) {
      const { error } = await supabase.from('ridecheck_events').insert({
        ride_id: ride.id,
        signal: result.signal,
        consecutive_count: 1,
        checkin_status: 'none',
        detail: result.detail,
      });
      if (error) return { confirmedSignals: confirmed }; // migration v2.34 non appliquée
      continue;
    }
    const row = existing as { id: string; consecutive_count: number; checkin_status: string };
    // Check-in déjà ouvert ou déjà répondu : on ne rouvre pas.
    if (row.checkin_status !== 'none') continue;
    const nextCount = row.consecutive_count + 1;
    const confirmedNow = isSignalConfirmed(nextCount);
    const { error } = await supabase
      .from('ridecheck_events')
      .update({
        consecutive_count: nextCount,
        checkin_status: confirmedNow ? 'pending' : 'none',
        detail: result.detail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) continue;
    if (confirmedNow) {
      confirmed.push(result.signal);
      await logAudit(supabase, 'ridecheck_checkin', {
        rideId: ride.id,
        signal: result.signal,
        detail: result.detail,
      });
    }
  }
  return { confirmedSignals: confirmed };
}

/** Réponse du passager au check-in. « problem » → alerte admin immédiate. */
export async function answerRideCheck(
  supabase: Db,
  ride: { id: string; pickup: string; destination: string },
  signal: RideCheckSignal,
  answer: 'ok' | 'problem'
): Promise<{ ok: boolean; error?: string }> {
  const { data: existing } = await supabase
    .from('ridecheck_events')
    .select('id, checkin_status')
    .eq('ride_id', ride.id)
    .eq('signal', signal)
    .single();
  if (!existing || (existing as { checkin_status: string }).checkin_status !== 'pending') {
    return { ok: false, error: 'Aucun check-in en attente pour ce signal.' };
  }
  const { error } = await supabase
    .from('ridecheck_events')
    .update({
      checkin_status: answer,
      responded_at: new Date().toISOString(),
      alerted_at: answer === 'problem' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', (existing as { id: string }).id)
    .eq('checkin_status', 'pending');
  if (error) return { ok: false, error: 'Réponse impossible pour le moment.' };
  if (answer === 'problem') {
    await notifyAdminAlert({
      kind: 'ridecheck_problem',
      key: `ridecheck:${signal}:${ride.id}`,
      detail: `RideCheck — le passager a signalé un problème pendant la course ${ride.pickup} → ${ride.destination} (signal : ${RIDECHECK_SIGNAL_LABELS[signal]}).`,
      adminUrl: `/admin`,
    });
  }
  await logAudit(supabase, 'ridecheck_answer', { rideId: ride.id, signal, answer });
  return { ok: true };
}

export { RIDECHECK_CONFIRM_COUNT };
