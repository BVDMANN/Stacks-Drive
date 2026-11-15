/** Vue admin en direct (v2.40) — helpers serveur partagés.
 *
 *  Lecture seule, garde admin (même motif que les autres routes
 *  admin) : l'appelant doit être connecté et `profiles.is_admin`.
 *  Client anon key + RLS uniquement (pas de service-role).
 *
 *  Résilience : chaque table lue tolère son absence (migration non
 *  appliquée) — liste vide / zéro, jamais de crash.
 *
 *  Fuseau : Europe/Paris pour « aujourd'hui » et le début de semaine
 *  (lundi). Nuance commission : les périodes stockées dans
 *  `driver_earnings` (`period_day` / `period_week`) sont calculées
 *  par `finalize_ride_earnings()` en heure de Libreville
 *  (`date_trunc('week', …)` = lundi) ; Libreville (UTC+1 fixe) et
 *  Paris ne diffèrent que d'1 h en heure d'été, donc les clés jour /
 *  semaine dérivées ici en Europe/Paris coïncident avec les clés
 *  stockées sauf sur la tranche 00h00–01h00 les nuits de bascule.
 *
 *  Honnêteté « qui est là » : aucun faux « en ligne ». Les passagers
 *  « en ce moment » sont ceux avec une course active. Il n'y a pas de
 *  « dernière connexion » (auth.users illisible sans service-role) :
 *  la fiche personne expose `lastActivityAt` = dernière activité
 *  visible (course créée / mise à jour, événement d'audit).
 */

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { deriveDriverStatus, normalizeFreeSeats } from '@/lib/seats';
import { AUDIT_LABELS } from '@/lib/audit';
import type { DriverStatus, RideType } from '@/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;

/* ------------------------------------------------------------------ */
/* Garde admin                                                         */
/* ------------------------------------------------------------------ */

export async function requireLiveAdmin(): Promise<
  | { supabase: Supabase; user: { id: string } }
  | { error: string; status: 401 | 403 }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté.', status: 401 };
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) {
    return { error: 'Réservé à l’administrateur.', status: 403 };
  }
  return { supabase, user };
}

/* ------------------------------------------------------------------ */
/* Bornes Europe/Paris                                                 */
/* ------------------------------------------------------------------ */

export interface ParisPeriods {
  /** Jour local (Europe/Paris), format AAAA-MM-JJ. */
  day: string;
  /** Lundi de la semaine locale (Europe/Paris), format AAAA-MM-JJ. */
  week: string;
  /** Début de journée locale, en ISO UTC. */
  dayStartISO: string;
  /** Début de semaine locale (lundi 00h00), en ISO UTC. */
  weekStartISO: string;
}

function parisParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day') };
}

/** Décalage (ms) entre l'heure locale Europe/Paris et UTC à l'instant donné. */
function parisOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUTC - at.getTime();
}

/** Minuit local Europe/Paris du jour donné (AAAA-MM-JJ), en Date UTC. */
function parisMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  // Une itération suffit : le décalage ne change pas autour de minuit
  // (les bascules d'heure d'été ont lieu à 2h/3h locales).
  return new Date(guess.getTime() - parisOffsetMs(guess));
}

function toDayStr(year: number, month: number, day: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${year}-${p(month)}-${p(day)}`;
}

export function getParisPeriods(now = new Date()): ParisPeriods {
  const { year, month, day } = parisParts(now);
  const dayStr = toDayStr(year, month, day);
  const noon = new Date(`${dayStr}T12:00:00Z`);
  const dow = (noon.getUTCDay() + 6) % 7; // lundi = 0
  const monday = new Date(noon);
  monday.setUTCDate(noon.getUTCDate() - dow);
  const weekStr = monday.toISOString().slice(0, 10);
  return {
    day: dayStr,
    week: weekStr,
    dayStartISO: parisMidnight(dayStr).toISOString(),
    weekStartISO: parisMidnight(weekStr).toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Types partagés                                                      */
/* ------------------------------------------------------------------ */

export type LiveEventKind =
  | 'inscription'
  | 'demande'
  | 'proposition'
  | 'acceptation'
  | 'annulation'
  | 'course_terminee'
  | 'litige'
  | 'ticket'
  | 'fraude'
  | 'sos'
  | 'reglement'
  | 'verification';

export interface LiveEvent {
  id: string;
  kind: LiveEventKind;
  label: string;
  detail: string;
  at: string;
  rideId: string | null;
  personId: string | null;
}

export interface LiveDriverOnline {
  id: string;
  fullName: string;
  phone: string | null;
  vehicleLabel: string;
  plate: string | null;
  driverStatus: DriverStatus;
  freeSeats: number | null;
  currentArea: string | null;
  lastOnlineAt: string | null;
}

export interface LiveActiveRide {
  id: string;
  pickup: string;
  destination: string;
  rideType: RideType;
  status: 'recherche' | 'propositions' | 'acceptee' | 'en_cours';
  passengerName: string;
  driverName: string | null;
  price: number | null;
  createdAt: string;
}

export interface LivePassengerNow {
  id: string;
  fullName: string;
  rideId: string;
  pickup: string;
  destination: string;
  status: string;
}

export interface LiveCounters {
  usersTotal: number;
  passengersTotal: number;
  driversTotal: number;
  driversVerified: number;
  driversPending: number;
  driversOnline: number;
  activeRides: number;
  ridesToday: number;
  commissionToday: number;
  commissionWeek: number;
  openDisputes: number;
  openTickets: number;
  openFraudCases: number;
}

export interface LiveSnapshot {
  ok: true;
  generatedAt: string;
  counters: LiveCounters;
  driversOnline: LiveDriverOnline[];
  activeRides: LiveActiveRide[];
  passengersNow: LivePassengerNow[];
  events: LiveEvent[];
}

export interface LivePersonRow {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: string;
  verificationStatus: string | null;
  isOnline: boolean;
  isVerified: boolean;
  isDemo: boolean;
  createdAt: string;
  currentArea: string | null;
  vehicleLabel: string;
  freeSeats: number | null;
  driverStatus: DriverStatus | null;
  ridesCompleted: number;
  ridesCancelled: number;
  lastActivityAt: string | null;
}

/* ------------------------------------------------------------------ */
/* Lignes brutes (colonnes réelles)                                    */
/* ------------------------------------------------------------------ */

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  vehicle_type: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  plate: string | null;
  seats: number | null;
  free_seats: number | null;
  is_online: boolean | null;
  is_verified: boolean | null;
  is_admin: boolean | null;
  is_demo: boolean | null;
  verification_status: string | null;
  verification_note: string | null;
  current_area: string | null;
  last_lat: number | null;
  last_lng: number | null;
  last_online_at: string | null;
  deposit_paid: boolean | null;
  deposit_amount: number | null;
  tier: string | null;
  created_at: string;
}

interface RideRow {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  pickup: string | null;
  destination: string | null;
  ride_type: string | null;
  vehicle_preference: string | null;
  seats: number | null;
  estimated_price: number | null;
  passenger_offered_price: number | null;
  proposed_price: number | null;
  first_stop: string | null;
  payment_method: string | null;
  message: string | null;
  status: string | null;
  platform_fee: number | null;
  driver_share: number | null;
  rating_driver: number | null;
  rating_passenger: number | null;
  loyalty_free: boolean | null;
  share_token: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  pin_code?: string | null; // jamais sélectionné ici (sensible)
  started_at: string | null;
  completed_at: string | null;
  distance_km: number | null;
  duration_min: number | null;
  commission_rate: number | null;
  is_double_ride: boolean | null;
  platform_cost: number | null;
  scheduled_at: string | null;
  dispatched_at: string | null;
  comfort: string | null;
  preferred_driver_id: string | null;
  preferred_until: string | null;
  created_at: string;
  updated_at: string | null;
}

const PROFILE_SELECT =
  'id, email, full_name, phone, role, vehicle_type, vehicle_brand, vehicle_model, vehicle_color, plate, seats, free_seats, is_online, is_verified, is_admin, is_demo, verification_status, verification_note, current_area, last_lat, last_lng, last_online_at, deposit_paid, deposit_amount, tier, created_at';

const RIDE_SELECT =
  'id, passenger_id, driver_id, pickup, destination, ride_type, vehicle_preference, seats, estimated_price, passenger_offered_price, proposed_price, first_stop, payment_method, message, status, platform_fee, driver_share, rating_driver, rating_passenger, loyalty_free, share_token, cancelled_by, cancel_reason, started_at, completed_at, distance_km, duration_min, commission_rate, is_double_ride, platform_cost, scheduled_at, dispatched_at, comfort, preferred_driver_id, preferred_until, created_at, updated_at';

const ACTIVE_RIDE_STATUSES = ['acceptee', 'en_cours'];
const WAITING_RIDE_STATUSES = ['recherche', 'propositions'];
const LIVE_RIDE_STATUSES = ['recherche', 'propositions', 'acceptee', 'en_cours'];

/* ------------------------------------------------------------------ */
/* Petits utilitaires                                                  */
/* ------------------------------------------------------------------ */

export function vehicleLabelOf(p: {
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  vehicle_color?: string | null;
}): string {
  return [p.vehicle_brand, p.vehicle_model, p.vehicle_color].filter(Boolean).join(' ');
}

function displayName(p: { full_name?: string | null; email?: string | null } | undefined | null): string {
  return p?.full_name ?? p?.email ?? 'Compte sans nom';
}

/** Lecture défensive : table absente ou erreur RLS → liste vide. */
async function safeRows<T>(
  query: PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error || !data) return [];
    return data as T[];
  } catch {
    return [];
  }
}

async function safeCount(
  query: PromiseLike<{ count: number | null; error: unknown }>
): Promise<number> {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

async function getNameMap(supabase: Supabase): Promise<Map<string, string>> {
  const rows = await safeRows<{ id: string; full_name: string | null; email: string | null }>(
    supabase.from('profiles').select('id, full_name, email').limit(5000)
  );
  const map = new Map<string, string>();
  rows.forEach((r) => map.set(r.id, displayName(r)));
  return map;
}

/** Types des courses en cours par chauffeur (pour le statut dérivé). */
function activeRideTypesByDriver(rides: RideRow[]): Map<string, RideType[]> {
  const map = new Map<string, RideType[]>();
  rides.forEach((r) => {
    if (!r.driver_id || !ACTIVE_RIDE_STATUSES.includes(r.status ?? '')) return;
    if (r.ride_type !== 'solo' && r.ride_type !== 'groupe') return;
    const list = map.get(r.driver_id) ?? [];
    list.push(r.ride_type);
    map.set(r.driver_id, list);
  });
  return map;
}

function driverStatusOf(
  p: ProfileRow,
  activeRideTypes: RideType[]
): { status: DriverStatus; freeSeats: number | null } {
  const freeSeats = p.free_seats ?? p.seats ?? null;
  return {
    status: deriveDriverStatus({
      capacity: p.seats,
      freeSeats: p.free_seats ?? undefined,
      activeRideTypes,
    }),
    freeSeats: freeSeats === null ? null : normalizeFreeSeats(p.seats, p.free_seats ?? undefined),
  };
}

/** Dernière activité visible d'une personne : max (courses créées /
 *  mises à jour la concernant, événements d'audit dont elle est
 *  l'actrice). Ce n'est PAS une « dernière connexion ». */
export async function getLastActivityAt(
  supabase: Supabase,
  personId: string,
  rideRows?: RideRow[]
): Promise<string | null> {
  let latest: string | null = null;
  const consider = (d: string | null | undefined) => {
    if (d && (!latest || d > latest)) latest = d;
  };
  let rides = rideRows;
  if (!rides) {
    rides = await safeRows<RideRow>(
      supabase
        .from('rides')
        .select('id, passenger_id, driver_id, created_at, updated_at')
        .or(`passenger_id.eq.${personId},driver_id.eq.${personId}`)
        .order('updated_at', { ascending: false })
        .limit(30)
    );
  }
  rides.forEach((r) => {
    consider(r.created_at);
    consider(r.updated_at);
  });
  const audit = await safeRows<{ created_at: string }>(
    supabase
      .from('audit_log')
      .select('created_at')
      .eq('actor_id', personId)
      .order('created_at', { ascending: false })
      .limit(1)
  );
  audit.forEach((a) => consider(a.created_at));
  return latest;
}

/* ------------------------------------------------------------------ */
/* Événements (flux)                                                   */
/* ------------------------------------------------------------------ */

const EVENT_LABELS: Record<LiveEventKind, string> = {
  inscription: 'Nouvelle inscription',
  demande: 'Nouvelle demande',
  proposition: 'Proposition envoyée',
  acceptation: 'Proposition acceptée',
  annulation: 'Course annulée',
  course_terminee: 'Course terminée',
  litige: 'Litige ouvert',
  ticket: 'Ticket de vérification',
  fraude: 'Signalement fraude',
  sos: 'SOS déclenché',
  reglement: 'Règlement reçu',
  verification: 'Vérification',
};

/** Agrège les 30 derniers événements (ou moins, selon `limit`) depuis
 *  toutes les sources. Chaque source tolère l'absence de sa table.
 *  `before` (ISO) : pagination — ne garder que les événements
 *  strictement antérieurs à cette date. */
export async function getLiveEvents(
  supabase: Supabase,
  before?: string,
  limit = 30
): Promise<LiveEvent[]> {
  const perSource = Math.max(limit, 30);
  const isBefore = (at: string | null | undefined): boolean =>
    !!at && (!before || at < before);
  const events: LiveEvent[] = [];
  const names = await getNameMap(supabase);

  // Inscriptions.
  const profiles = await safeRows<ProfileRow>(
    supabase
      .from('profiles')
      .select('id, full_name, email, role, is_admin, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  profiles.forEach((p) => {
    if (!isBefore(p.created_at)) return;
    // v2.45 — l'inscription du compte admin n'apparaît pas dans le
    // flux comme celle d'un passager : l'admin n'est pas un passager.
    if (p.is_admin === true) return;
    events.push({
      id: `inscription-${p.id}`,
      kind: 'inscription',
      label: EVENT_LABELS.inscription,
      detail: `${displayName(p)} (${p.role === 'chauffeur' ? 'chauffeur' : 'passager'})`,
      at: p.created_at,
      rideId: null,
      personId: p.id,
    });
  });

  // Demandes + courses terminées.
  const rides = await safeRows<RideRow>(
    supabase
      .from('rides')
      .select('id, passenger_id, driver_id, pickup, destination, status, completed_at, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  rides.forEach((r) => {
    if (isBefore(r.created_at)) {
      events.push({
        id: `demande-${r.id}`,
        kind: 'demande',
        label: EVENT_LABELS.demande,
        detail: `${r.pickup ?? '—'} → ${r.destination ?? '—'}`,
        at: r.created_at,
        rideId: r.id,
        personId: r.passenger_id,
      });
    }
    if (r.status === 'terminee' && r.completed_at && isBefore(r.completed_at)) {
      events.push({
        id: `terminee-${r.id}`,
        kind: 'course_terminee',
        label: EVENT_LABELS.course_terminee,
        detail: `${r.pickup ?? '—'} → ${r.destination ?? '—'}`,
        at: r.completed_at,
        rideId: r.id,
        personId: r.passenger_id,
      });
    }
  });

  // Propositions (envoyées + acceptées — l'acceptation n'a pas
  // d'horodatage propre en base : on reprend created_at de la
  // proposition acceptée).
  const proposals = await safeRows<{
    id: string;
    ride_id: string;
    driver_id: string | null;
    proposed_price: number | null;
    status: string | null;
    created_at: string;
  }>(
    supabase
      .from('ride_proposals')
      .select('id, ride_id, driver_id, proposed_price, status, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  proposals.forEach((pr) => {
    if (!isBefore(pr.created_at)) return;
    const driverName = pr.driver_id ? (names.get(pr.driver_id) ?? 'Chauffeur') : 'Chauffeur';
    const price = pr.proposed_price !== null && pr.proposed_price !== undefined ? `${pr.proposed_price} FCFA` : 'prix non indiqué';
    if (pr.status === 'accepted') {
      events.push({
        id: `acceptation-${pr.id}`,
        kind: 'acceptation',
        label: EVENT_LABELS.acceptation,
        detail: `Proposition de ${driverName} acceptée (${price})`,
        at: pr.created_at,
        rideId: pr.ride_id,
        personId: pr.driver_id,
      });
    } else {
      events.push({
        id: `proposition-${pr.id}`,
        kind: 'proposition',
        label: EVENT_LABELS.proposition,
        detail: `${driverName} propose ${price}`,
        at: pr.created_at,
        rideId: pr.ride_id,
        personId: pr.driver_id,
      });
    }
  });

  // Annulations.
  const cancellations = await safeRows<{
    id: string;
    ride_id: string | null;
    cancelled_by_user_id: string | null;
    reason_code: string | null;
    reason_detail: string | null;
    created_at: string;
  }>(
    supabase
      .from('ride_cancellations')
      .select('id, ride_id, cancelled_by_user_id, reason_code, reason_detail, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  cancellations.forEach((c) => {
    if (!isBefore(c.created_at)) return;
    events.push({
      id: `annulation-${c.id}`,
      kind: 'annulation',
      label: EVENT_LABELS.annulation,
      detail: c.reason_detail ?? c.reason_code ?? 'Sans motif',
      at: c.created_at,
      rideId: c.ride_id,
      personId: c.cancelled_by_user_id,
    });
  });

  // Litiges.
  const disputes = await safeRows<{
    id: string;
    ride_id: string;
    opened_by_id: string | null;
    reason: string | null;
    created_at: string;
  }>(
    supabase
      .from('disputes')
      .select('id, ride_id, opened_by_id, reason, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  disputes.forEach((d) => {
    if (!isBefore(d.created_at)) return;
    events.push({
      id: `litige-${d.id}`,
      kind: 'litige',
      label: EVENT_LABELS.litige,
      detail: `Litige : ${d.reason ?? 'autre'}`,
      at: d.created_at,
      rideId: d.ride_id,
      personId: d.opened_by_id,
    });
  });

  // Tickets de vérification.
  const tickets = await safeRows<{
    id: string;
    driver_id: string | null;
    summary: string | null;
    created_at: string;
  }>(
    supabase
      .from('verification_tickets')
      .select('id, driver_id, summary, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  tickets.forEach((t) => {
    if (!isBefore(t.created_at)) return;
    events.push({
      id: `ticket-${t.id}`,
      kind: 'ticket',
      label: EVENT_LABELS.ticket,
      detail: t.summary ?? 'Ticket de vérification',
      at: t.created_at,
      rideId: null,
      personId: t.driver_id,
    });
  });

  // Fraude.
  const fraudCases = await safeRows<{
    id: string;
    user_id: string | null;
    signal: string | null;
    created_at: string;
  }>(
    supabase
      .from('fraud_cases')
      .select('id, user_id, signal, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  fraudCases.forEach((f) => {
    if (!isBefore(f.created_at)) return;
    events.push({
      id: `fraude-${f.id}`,
      kind: 'fraude',
      label: EVENT_LABELS.fraude,
      detail: f.signal ?? 'Signalement',
      at: f.created_at,
      rideId: null,
      personId: f.user_id,
    });
  });

  // Règlements.
  const settlements = await safeRows<{
    id: string;
    driver_id: string | null;
    amount: number | null;
    created_at: string;
  }>(
    supabase
      .from('driver_settlements')
      .select('id, driver_id, amount, created_at')
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  settlements.forEach((s) => {
    if (!isBefore(s.created_at)) return;
    const name = s.driver_id ? (names.get(s.driver_id) ?? 'Chauffeur') : 'Chauffeur';
    events.push({
      id: `reglement-${s.id}`,
      kind: 'reglement',
      label: EVENT_LABELS.reglement,
      detail: `${name} : ${s.amount ?? 0} FCFA`,
      at: s.created_at,
      rideId: null,
      personId: s.driver_id,
    });
  });

  // Journal d'audit : SOS + vérifications automatiques.
  const audit = await safeRows<{
    id: string;
    actor_id: string | null;
    event: string;
    ride_id: string | null;
    created_at: string;
  }>(
    supabase
      .from('audit_log')
      .select('id, actor_id, event, ride_id, created_at')
      .in('event', ['sos_triggered', 'verification_auto_verified', 'verification_auto_refused'])
      .order('created_at', { ascending: false })
      .limit(perSource)
  );
  audit.forEach((a) => {
    if (!isBefore(a.created_at)) return;
    if (a.event === 'sos_triggered') {
      events.push({
        id: `sos-${a.id}`,
        kind: 'sos',
        label: EVENT_LABELS.sos,
        detail: 'SOS déclenché pendant une course',
        at: a.created_at,
        rideId: a.ride_id,
        personId: a.actor_id,
      });
    } else {
      const verified = a.event === 'verification_auto_verified';
      events.push({
        id: `verification-${a.id}`,
        kind: 'verification',
        label: verified ? 'Vérification auto : vérifié' : 'Vérification auto : refusé',
        detail: verified ? 'Dossier vérifié automatiquement' : 'Dossier refusé automatiquement',
        at: a.created_at,
        rideId: a.ride_id,
        personId: a.actor_id,
      });
    }
  });

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Snapshot                                                            */
/* ------------------------------------------------------------------ */

export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const supabase = await createClient();
  const periods = getParisPeriods();
  const emptyCounters: LiveCounters = {
    usersTotal: 0,
    passengersTotal: 0,
    driversTotal: 0,
    driversVerified: 0,
    driversPending: 0,
    driversOnline: 0,
    activeRides: 0,
    ridesToday: 0,
    commissionToday: 0,
    commissionWeek: 0,
    openDisputes: 0,
    openTickets: 0,
    openFraudCases: 0,
  };
  const empty: LiveSnapshot = {
    ok: true,
    generatedAt: new Date().toISOString(),
    counters: emptyCounters,
    driversOnline: [],
    activeRides: [],
    passengersNow: [],
    events: [],
  };
  if (!isSupabaseConfigured()) return empty;

  const profiles = await safeRows<ProfileRow>(
    supabase.from('profiles').select(PROFILE_SELECT).order('created_at', { ascending: false }).limit(5000)
  );
  const rides = await safeRows<RideRow>(
    supabase.from('rides').select(RIDE_SELECT).order('created_at', { ascending: false }).limit(5000)
  );
  const nameById = new Map<string, string>();
  profiles.forEach((p) => nameById.set(p.id, displayName(p)));

  const drivers = profiles.filter((p) => p.role === 'chauffeur' && p.is_admin !== true);
  // v2.45 — compte admin = admin uniquement : l'admin n'est compté
  // ni comme chauffeur, ni comme passager (son rôle en base est
  // « passager » — ce filtre explicite l'exclut des deux listes).
  const passengers = profiles.filter((p) => p.role === 'passager' && p.is_admin !== true);
  const activeTypes = activeRideTypesByDriver(rides);
  const onlineDrivers = drivers.filter(
    (p) => p.is_online === true && p.is_verified === true && p.is_demo !== true
  );
  const activeRides = rides.filter((r) => ACTIVE_RIDE_STATUSES.includes(r.status ?? ''));
  const liveRides = rides.filter((r) => LIVE_RIDE_STATUSES.includes(r.status ?? ''));

  // Commission jour / semaine depuis driver_earnings (clés period_day /
  // period_week — même définition que finalize : jour local, semaine
  // = lundi ; voir l'en-tête du fichier pour la nuance Paris/Libreville).
  let commissionToday = 0;
  let commissionWeek = 0;
  const earnings = await safeRows<{ commission_amount: number | null; period_day: string | null; period_week: string | null }>(
    supabase.from('driver_earnings').select('commission_amount, period_day, period_week').limit(5000)
  );
  earnings.forEach((e) => {
    const amount = e.commission_amount ?? 0;
    if (e.period_day === periods.day) commissionToday += amount;
    if (e.period_week === periods.week) commissionWeek += amount;
  });

  const [openDisputes, openTickets, openFraudCases] = await Promise.all([
    safeCount(
      supabase.from('disputes').select('id', { count: 'exact', head: true }).in('status', ['ouvert', 'en_cours'])
    ),
    safeCount(
      supabase.from('verification_tickets').select('id', { count: 'exact', head: true }).in('status', ['ouvert', 'en_cours'])
    ),
    safeCount(
      supabase.from('fraud_cases').select('id', { count: 'exact', head: true }).eq('status', 'ouvert')
    ),
  ]);

  const counters: LiveCounters = {
    usersTotal: profiles.length,
    passengersTotal: passengers.length,
    driversTotal: drivers.length,
    driversVerified: drivers.filter((p) => p.is_verified === true).length,
    driversPending: drivers.filter((p) => p.verification_status === 'en_attente').length,
    driversOnline: onlineDrivers.length,
    activeRides: activeRides.length,
    ridesToday: rides.filter((r) => r.created_at >= periods.dayStartISO).length,
    commissionToday,
    commissionWeek,
    openDisputes,
    openTickets,
    openFraudCases,
  };

  const driversOnline: LiveDriverOnline[] = onlineDrivers.map((p) => {
    const { status, freeSeats } = driverStatusOf(p, activeTypes.get(p.id) ?? []);
    return {
      id: p.id,
      fullName: displayName(p),
      phone: p.phone,
      vehicleLabel: vehicleLabelOf(p),
      plate: p.plate,
      driverStatus: status,
      freeSeats,
      currentArea: p.current_area,
      lastOnlineAt: p.last_online_at,
    };
  });

  const activeRidesOut: LiveActiveRide[] = activeRides.map((r) => ({
    id: r.id,
    pickup: r.pickup ?? '—',
    destination: r.destination ?? '—',
    rideType: r.ride_type === 'groupe' ? 'groupe' : 'solo',
    status: r.status as LiveActiveRide['status'],
    passengerName: r.passenger_id ? (nameById.get(r.passenger_id) ?? 'Passager') : 'Passager',
    driverName: r.driver_id ? (nameById.get(r.driver_id) ?? null) : null,
    price: r.proposed_price ?? r.estimated_price ?? null,
    createdAt: r.created_at,
  }));

  const passengersNow: LivePassengerNow[] = liveRides
    .filter((r) => r.passenger_id)
    .map((r) => ({
      id: r.passenger_id as string,
      fullName: nameById.get(r.passenger_id as string) ?? 'Passager',
      rideId: r.id,
      pickup: r.pickup ?? '—',
      destination: r.destination ?? '—',
      status: r.status ?? '',
    }));

  const events = await getLiveEvents(supabase, undefined, 30);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    counters,
    driversOnline,
    activeRides: activeRidesOut,
    passengersNow,
    events,
  };
}

/* ------------------------------------------------------------------ */
/* Recherche de personnes                                             */
/* ------------------------------------------------------------------ */

export interface LivePeopleSearch {
  q?: string;
  role?: string;
  status?: string;
  online?: boolean | null;
  limit?: number;
  offset?: number;
}

export async function searchLivePeople(
  args: LivePeopleSearch
): Promise<{ total: number; people: LivePersonRow[] }> {
  const supabase = await createClient();
  if (!isSupabaseConfigured()) return { total: 0, people: [] };
  const limit = Math.min(100, Math.max(1, args.limit ?? 50));
  const offset = Math.max(0, args.offset ?? 0);

  let query = supabase
    .from('profiles')
    .select(PROFILE_SELECT, { count: 'exact' })
    // v2.45 — compte admin = admin uniquement : l'admin n'apparaît
    // pas dans « Les gens » comme passager ou chauffeur.
    .neq('is_admin', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  const q = (args.q ?? '').trim().replace(/[%_,]/g, '');
  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  if (args.role && ['passager', 'chauffeur'].includes(args.role)) {
    query = query.eq('role', args.role);
  }
  if (args.status) {
    query = query.eq('verification_status', args.status);
  }
  if (args.online !== null && args.online !== undefined) {
    query = query.eq('is_online', args.online);
  }
  const { data, count, error } = await query;
  if (error || !data) return { total: 0, people: [] };
  const profiles = data as ProfileRow[];
  const ids = profiles.map((p) => p.id);
  if (ids.length === 0) return { total: count ?? 0, people: [] };

  // Courses terminées / annulées par personne (passager ou chauffeur).
  const rides = await safeRows<{ passenger_id: string | null; driver_id: string | null; status: string | null }>(
    supabase
      .from('rides')
      .select('passenger_id, driver_id, status')
      .or(`passenger_id.in.(${ids.join(',')}),driver_id.in.(${ids.join(',')})`)
      .in('status', ['terminee', 'annulee'])
      .limit(5000)
  );
  const completedBy = new Map<string, number>();
  const cancelledBy = new Map<string, number>();
  rides.forEach((r) => {
    [r.passenger_id, r.driver_id].forEach((personId) => {
      if (!personId) return;
      if (r.status === 'terminee') completedBy.set(personId, (completedBy.get(personId) ?? 0) + 1);
      if (r.status === 'annulee') cancelledBy.set(personId, (cancelledBy.get(personId) ?? 0) + 1);
    });
  });

  // Courses en cours (statut dérivé chauffeur) + dernière activité.
  const activeRides = await safeRows<{ driver_id: string | null; ride_type: string | null; status: string | null; passenger_id: string | null; created_at: string; updated_at: string | null }>(
    supabase
      .from('rides')
      .select('driver_id, ride_type, status, passenger_id, created_at, updated_at')
      .or(`passenger_id.in.(${ids.join(',')}),driver_id.in.(${ids.join(',')})`)
      .order('updated_at', { ascending: false })
      .limit(5000)
  );
  const activeTypes = activeRideTypesByDriver(
    activeRides as RideRow[]
  );
  const lastRideActivity = new Map<string, string>();
  activeRides.forEach((r) => {
    [r.passenger_id, r.driver_id].forEach((personId) => {
      if (!personId) return;
      const at = r.updated_at ?? r.created_at;
      const prev = lastRideActivity.get(personId);
      if (!prev || at > prev) lastRideActivity.set(personId, at);
    });
  });
  const auditRows = await safeRows<{ actor_id: string | null; created_at: string }>(
    supabase
      .from('audit_log')
      .select('actor_id, created_at')
      .in('actor_id', ids)
      .order('created_at', { ascending: false })
      .limit(500)
  );
  auditRows.forEach((a) => {
    if (!a.actor_id) return;
    const prev = lastRideActivity.get(a.actor_id);
    if (!prev || a.created_at > prev) lastRideActivity.set(a.actor_id, a.created_at);
  });

  const people: LivePersonRow[] = profiles.map((p) => {
    const isDriver = p.role === 'chauffeur';
    const derived = isDriver ? driverStatusOf(p, activeTypes.get(p.id) ?? []) : null;
    return {
      id: p.id,
      fullName: displayName(p),
      email: p.email,
      phone: p.phone,
      role: p.role ?? '',
      verificationStatus: p.verification_status,
      isOnline: p.is_online === true,
      isVerified: p.is_verified === true,
      isDemo: p.is_demo === true,
      createdAt: p.created_at,
      currentArea: p.current_area,
      vehicleLabel: vehicleLabelOf(p),
      freeSeats: isDriver ? (derived?.freeSeats ?? null) : null,
      driverStatus: derived?.status ?? null,
      ridesCompleted: completedBy.get(p.id) ?? 0,
      ridesCancelled: cancelledBy.get(p.id) ?? 0,
      lastActivityAt: lastRideActivity.get(p.id) ?? null,
    };
  });
  return { total: count ?? profiles.length, people };
}

/* ------------------------------------------------------------------ */
/* Fiche personne                                                      */
/* ------------------------------------------------------------------ */

export interface LivePersonDetail {
  person: ProfileRow & {
    fullName: string;
    vehicleLabel: string;
    driverStatus: DriverStatus | null;
    freeSeats: number | null;
    lastActivityAt: string | null;
  };
  rides: {
    id: string;
    pickup: string;
    destination: string;
    rideType: string;
    status: string;
    price: number | null;
    otherPartyName: string | null;
    createdAt: string;
    completedAt: string | null;
  }[];
  money: {
    totalCommission: number;
    totalSettled: number;
    owed: number;
    depositPaid: boolean;
    depositAmount: number;
    pointsBalance: number | null;
    completedRides: number;
  };
  loyalty: { completedRides: number; freeRides: number };
  disputes: Record<string, unknown>[];
  cancellations: Record<string, unknown>[];
}

export async function getLivePersonDetail(id: string): Promise<LivePersonDetail | null> {
  const supabase = await createClient();
  if (!isSupabaseConfigured()) return null;
  const { data: profileData, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', id)
    .single();
  if (error || !profileData) return null;
  const p = profileData as ProfileRow;
  const names = await getNameMap(supabase);

  const rideRows = await safeRows<RideRow>(
    supabase
      .from('rides')
      .select(RIDE_SELECT)
      .or(`passenger_id.eq.${id},driver_id.eq.${id}`)
      .order('created_at', { ascending: false })
      .limit(30)
  );
  const activeTypes = activeRideTypesByDriver(rideRows);
  const derived =
    p.role === 'chauffeur' ? driverStatusOf(p, activeTypes.get(id) ?? []) : null;

  const rides = rideRows.map((r) => {
    const otherId = r.passenger_id === id ? r.driver_id : r.passenger_id;
    return {
      id: r.id,
      pickup: r.pickup ?? '—',
      destination: r.destination ?? '—',
      rideType: r.ride_type ?? '',
      status: r.status ?? '',
      price: r.proposed_price ?? r.estimated_price ?? null,
      otherPartyName: otherId ? (names.get(otherId) ?? null) : null,
      createdAt: r.created_at,
      completedAt: r.completed_at,
    };
  });

  // Argent : chauffeur uniquement (formule dette = commissions −
  // règlements + ajustements, voir lib/earnings.ts getAdminDriverMoney).
  // Passager : zéros, pointsBalance null.
  const completedRidesAsDriver = rideRows.filter(
    (r) => r.driver_id === id && r.status === 'terminee'
  ).length;
  const money: LivePersonDetail['money'] = {
    totalCommission: 0,
    totalSettled: 0,
    owed: 0,
    depositPaid: p.deposit_paid === true,
    depositAmount: p.deposit_amount ?? 0,
    pointsBalance: null,
    completedRides: p.role === 'chauffeur' ? completedRidesAsDriver : 0,
  };
  if (p.role === 'chauffeur') {
    const earnings = await safeRows<{ commission_amount: number | null }>(
      supabase.from('driver_earnings').select('commission_amount').eq('driver_id', id)
    );
    money.totalCommission = earnings.reduce((s, e) => s + (e.commission_amount ?? 0), 0);
    const settlements = await safeRows<{ amount: number | null }>(
      supabase.from('driver_settlements').select('amount').eq('driver_id', id)
    );
    money.totalSettled = settlements.reduce((s, r) => s + (r.amount ?? 0), 0);
    const adjustments = await safeRows<{ amount_fcfa: number | null }>(
      supabase.from('driver_debt_adjustments').select('amount_fcfa').eq('driver_id', id)
    );
    const totalAdjustments = adjustments.reduce((s, a) => s + (a.amount_fcfa ?? 0), 0);
    money.owed = Math.max(0, money.totalCommission - money.totalSettled + totalAdjustments);
    const points = await safeRows<{ points: number | null }>(
      supabase.from('driver_points').select('points').eq('driver_id', id)
    );
    money.pointsBalance = Math.max(
      0,
      points.reduce((s, r) => s + (r.points ?? 0), 0)
    );
    const { count } = await supabase
      .from('rides')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', id)
      .eq('status', 'terminee');
    money.completedRides = count ?? completedRidesAsDriver;
  }

  // Fidélité passager : 1 course offerte toutes les 10 terminées
  // (GET /api/loyalty). On renvoie les deux compteurs, sans promettre
  // le prochain palier ici.
  const { count: completedAsPassenger } = await supabase
    .from('rides')
    .select('id', { count: 'exact', head: true })
    .eq('passenger_id', id)
    .eq('status', 'terminee');
  const { count: freeAsPassenger } = await supabase
    .from('rides')
    .select('id', { count: 'exact', head: true })
    .eq('passenger_id', id)
    .eq('status', 'terminee')
    .eq('loyalty_free', true);
  const loyalty = {
    completedRides: completedAsPassenger ?? 0,
    freeRides: freeAsPassenger ?? 0,
  };
  // Passager : money = zéros + ses courses terminées.
  if (p.role !== 'chauffeur') money.completedRides = loyalty.completedRides;

  const rideIds = rideRows.map((r) => r.id);
  const disputesByMe = await safeRows<Record<string, unknown>>(
    supabase
      .from('disputes')
      .select('id, ride_id, opened_by_id, opened_by_role, reason, amount_concerned, message, status, created_at, resolved_at')
      .eq('opened_by_id', id)
      .order('created_at', { ascending: false })
      .limit(30)
  );
  let disputesOnRides: Record<string, unknown>[] = [];
  if (rideIds.length > 0) {
    disputesOnRides = await safeRows<Record<string, unknown>>(
      supabase
        .from('disputes')
        .select('id, ride_id, opened_by_id, opened_by_role, reason, amount_concerned, message, status, created_at, resolved_at')
        .in('ride_id', rideIds)
        .order('created_at', { ascending: false })
        .limit(30)
    );
  }
  const seenDispute = new Set<string>();
  const disputes = [...disputesByMe, ...disputesOnRides].filter((d) => {
    const key = String(d.id);
    if (seenDispute.has(key)) return false;
    seenDispute.add(key);
    return true;
  });

  const cancellationsByMe = await safeRows<Record<string, unknown>>(
    supabase
      .from('ride_cancellations')
      .select('id, ride_id, cancelled_by_user_id, cancelled_by_role, reason_code, reason_detail, created_at')
      .eq('cancelled_by_user_id', id)
      .order('created_at', { ascending: false })
      .limit(30)
  );
  let cancellationsOnRides: Record<string, unknown>[] = [];
  if (rideIds.length > 0) {
    cancellationsOnRides = await safeRows<Record<string, unknown>>(
      supabase
        .from('ride_cancellations')
        .select('id, ride_id, cancelled_by_user_id, cancelled_by_role, reason_code, reason_detail, created_at')
        .in('ride_id', rideIds)
        .order('created_at', { ascending: false })
        .limit(30)
    );
  }
  const seenCancel = new Set<string>();
  const cancellations = [...cancellationsByMe, ...cancellationsOnRides].filter((c) => {
    const key = String(c.id);
    if (seenCancel.has(key)) return false;
    seenCancel.add(key);
    return true;
  });

  const lastActivityAt = await getLastActivityAt(supabase, id, rideRows);

  return {
    person: {
      ...p,
      fullName: displayName(p),
      vehicleLabel: vehicleLabelOf(p),
      driverStatus: derived?.status ?? null,
      freeSeats: derived?.freeSeats ?? null,
      lastActivityAt,
    },
    rides,
    money,
    loyalty,
    disputes,
    cancellations,
  };
}

/* ------------------------------------------------------------------ */
/* Trace d'une course                                                  */
/* ------------------------------------------------------------------ */

export interface LiveRideTrace {
  ride: RideRow & { passengerName: string; driverName: string | null };
  proposals: {
    id: string;
    driverName: string;
    proposedPrice: number | null;
    counterPrice: number | null;
    status: string;
    createdAt: string;
    expiresAt: string | null;
  }[];
  messagesCount: number;
  cancellations: Record<string, unknown>[];
  feedback: Record<string, unknown>[];
  audit: { event: string; label: string; at: string }[];
  timeline: { at: string; label: string; detail: string }[];
}

export async function getLiveRideTrace(id: string): Promise<LiveRideTrace | null> {
  const supabase = await createClient();
  if (!isSupabaseConfigured()) return null;
  const { data: rideData, error } = await supabase
    .from('rides')
    .select(RIDE_SELECT)
    .eq('id', id)
    .single();
  if (error || !rideData) return null;
  const ride = rideData as RideRow;
  const names = await getNameMap(supabase);

  const proposalRows = await safeRows<{
    id: string;
    driver_id: string | null;
    proposed_price: number | null;
    counter_price: number | null;
    status: string | null;
    created_at: string;
    expires_at: string | null;
  }>(
    supabase
      .from('ride_proposals')
      .select('id, driver_id, proposed_price, counter_price, status, created_at, expires_at')
      .eq('ride_id', id)
      .order('created_at', { ascending: true })
  );
  const proposals = proposalRows.map((pr) => ({
    id: pr.id,
    driverName: pr.driver_id ? (names.get(pr.driver_id) ?? 'Chauffeur') : 'Chauffeur',
    proposedPrice: pr.proposed_price,
    counterPrice: pr.counter_price,
    status: pr.status ?? '',
    createdAt: pr.created_at,
    expiresAt: pr.expires_at,
  }));

  const messagesCount = await safeCount(
    supabase.from('ride_messages').select('id', { count: 'exact', head: true }).eq('ride_id', id)
  );

  const cancellations = await safeRows<Record<string, unknown>>(
    supabase
      .from('ride_cancellations')
      .select('id, ride_id, cancelled_by_user_id, cancelled_by_role, reason_code, reason_detail, created_at')
      .eq('ride_id', id)
      .order('created_at', { ascending: false })
  );

  const feedback = await safeRows<Record<string, unknown>>(
    supabase
      .from('ride_feedback')
      .select('id, ride_id, from_user_id, from_role, to_user_id, rating, comment, category, kind, created_at')
      .eq('ride_id', id)
      .order('created_at', { ascending: false })
  );

  const auditRows = await safeRows<{ event: string; created_at: string }>(
    supabase
      .from('audit_log')
      .select('event, created_at')
      .eq('ride_id', id)
      .order('created_at', { ascending: true })
  );
  const audit = auditRows.map((a) => ({
    event: a.event,
    label: AUDIT_LABELS[a.event] ?? a.event,
    at: a.created_at,
  }));

  // Chronologie — chaque étape utilise son vrai horodatage, aucune
  // heure inventée. L'acceptation est représentée par la proposition
  // acceptée (sans heure propre si elle n'existe pas en base : on
  // reprend created_at de cette proposition).
  const timeline: { at: string; label: string; detail: string }[] = [];
  timeline.push({
    at: ride.created_at,
    label: 'Demande créée',
    detail: `${ride.pickup ?? '—'} → ${ride.destination ?? '—'}`,
  });
  proposalRows.forEach((pr) => {
    const driverName = pr.driver_id ? (names.get(pr.driver_id) ?? 'Chauffeur') : 'Chauffeur';
    const price = pr.proposed_price !== null && pr.proposed_price !== undefined ? `${pr.proposed_price} FCFA` : 'prix non indiqué';
    if (pr.status === 'accepted') {
      timeline.push({
        at: pr.created_at,
        label: 'Proposition acceptée',
        detail: `${driverName} — ${price}`,
      });
    } else {
      timeline.push({
        at: pr.created_at,
        label: 'Proposition reçue',
        detail: `${driverName} propose ${price}`,
      });
    }
  });
  if (ride.started_at) {
    timeline.push({ at: ride.started_at, label: 'Départ', detail: ride.pickup ?? '—' });
  }
  if (ride.completed_at) {
    timeline.push({ at: ride.completed_at, label: 'Arrivée', detail: ride.destination ?? '—' });
  }
  cancellations.forEach((c) => {
    const at = c.created_at as string | undefined;
    if (!at) return;
    timeline.push({
      at,
      label: 'Course annulée',
      detail: (c.reason_detail as string | undefined) ?? (c.reason_code as string | undefined) ?? 'Sans motif',
    });
  });
  feedback.forEach((f) => {
    const at = f.created_at as string | undefined;
    if (!at) return;
    timeline.push({
      at,
      label: f.kind === 'plainte' ? 'Plainte déposée' : f.kind === 'recommandation' ? 'Recommandation déposée' : 'Note déposée',
      detail: (f.comment as string | undefined) ?? '',
    });
  });
  audit.forEach((a) => {
    timeline.push({ at: a.at, label: a.label, detail: '' });
  });
  timeline.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return {
    ride: {
      ...ride,
      passengerName: ride.passenger_id ? (names.get(ride.passenger_id) ?? 'Passager') : 'Passager',
      driverName: ride.driver_id ? (names.get(ride.driver_id) ?? null) : null,
    },
    proposals,
    messagesCount,
    cancellations,
    feedback,
    audit,
    timeline,
  };
}
