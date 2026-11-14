/** RideCheck maison (v2.34, lot « Au-delà ») — sécurité pendant la course.
 *
 *  Pendant une course en cours, trois signaux sont surveillés à
 *  partir des positions partagées (`driver_locations`) et de
 *  l'itinéraire routier OSRM (`lib/routing.ts`) :
 *    (a) long arrêt — plus de 5 min immobile, hors pickup et hors
 *        destination ;
 *    (b) déviation importante — position à plus de 500 m de
 *        l'itinéraire routier, de façon soutenue ;
 *    (c) course anormalement longue — durée écoulée très au-delà de
 *        la durée routière estimée ET distance parcourue très
 *        au-delà de la distance routière estimée.
 *
 *  Seuils prudents : AUCUN signal ne part d'un cas isolé ambigu.
 *  Chaque signal doit être CONFIRMÉ par deux évaluations
 *  consécutives (deux sondages successifs, ~30 s d'intervalle)
 *  avant de déclencher le check-in. Le check-in est une question
 *  au passager (« Tout va bien ? » — « Oui » / « Problème »),
 *  jamais un blocage : le chauffeur n'est jamais bloqué
 *  automatiquement, la course continue dans tous les cas.
 *  L'alerte admin (`ridecheck_no_response` / `ridecheck_problem`,
 *  via `lib/admin-alerts.ts`) ne part que si le passager répond
 *  « Problème », ou s'il ne répond pas dans les 3 minutes qui
 *  suivent le check-in. Une seule alerte par course et par signal.
 *
 *  Aucun service payant, aucune donnée envoyée à un tiers : les
 *  positions utilisées sont celles déjà partagées en course.
 */

import { haversineKm } from './geo';
import type { RoutePoint } from './routing';

/** Long arrêt : immobilité au-delà de ce seuil (minutes). */
export const RIDECHECK_STOP_MINUTES = 5;
/** Immobilité : déplacement inférieur à ce seuil entre deux sondages. */
export const RIDECHECK_STILL_KM = 0.05;
/** Rayon autour du pickup / de la destination où un arrêt est normal (km). */
export const RIDECHECK_ENDPOINT_RADIUS_KM = 0.3;
/** Déviation : distance à l'itinéraire au-delà de ce seuil (km). */
export const RIDECHECK_DEVIATION_KM = 0.5;
/** Course longue : durée écoulée au-delà de ce multiple de la durée estimée. */
export const RIDECHECK_LONG_DURATION_FACTOR = 2;
/** Course longue : distance parcourue au-delà de ce multiple de la distance estimée. */
export const RIDECHECK_LONG_DISTANCE_FACTOR = 1.5;
/** Course longue : marge absolue minimale au-delà de l'estimation (minutes). */
export const RIDECHECK_LONG_MIN_EXTRA_MIN = 15;
/** Évaluations consécutives requises pour confirmer un signal. */
export const RIDECHECK_CONFIRM_COUNT = 2;
/** Délai de réponse du passager au check-in avant alerte admin (minutes). */
export const RIDECHECK_NO_RESPONSE_MINUTES = 3;

export type RideCheckSignal = 'long_stop' | 'deviation' | 'long_ride';

export const RIDECHECK_SIGNAL_LABELS: Record<RideCheckSignal, string> = {
  long_stop: 'Long arrêt pendant la course',
  deviation: 'Déviation importante de l’itinéraire',
  long_ride: 'Course anormalement longue',
};

export interface RideCheckSample {
  lat: number;
  lng: number;
  /** Horodatage du sondage (ms). */
  atMs: number;
}

export interface RideCheckContext {
  pickup: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  /** Itinéraire routier OSRM (géométrie) — vide = repli ligne droite. */
  routeGeometry: RoutePoint[];
  /** Durée routière estimée (minutes) ; 0 = inconnue. */
  estimatedDurationMin: number;
  /** Distance routière estimée (km) ; 0 = inconnue. */
  estimatedDistanceKm: number;
  /** Début réel de la course (ms). */
  startedAtMs: number;
  /** Distance parcourue depuis le début (km, cumul des sondages). */
  distanceTravelledKm: number;
}

export interface RideCheckResult {
  signal: RideCheckSignal;
  /** Vrai seulement après RIDECHECK_CONFIRM_COUNT évaluations consécutives. */
  confirmed: boolean;
  detail: string;
}

/** Distance d'un point à un segment (km, approximation plane locale). */
export function distanceToSegmentKm(
  p: { lat: number; lng: number },
  a: RoutePoint,
  b: RoutePoint
): number {
  const kx = 111.32 * Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  const ky = 110.57;
  const px = p.lng * kx;
  const py = p.lat * ky;
  const ax = a.lng * kx;
  const ay = a.lat * ky;
  const bx = b.lng * kx;
  const by = b.lat * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** Distance d'un point à une polyligne (km) — 0 si la géométrie est vide. */
export function distanceToRouteKm(
  p: { lat: number; lng: number },
  geometry: RoutePoint[]
): number {
  if (geometry.length === 0) return 0;
  if (geometry.length === 1) return haversineKm(p.lat, p.lng, geometry[0].lat, geometry[0].lng);
  let best = Infinity;
  for (let i = 0; i < geometry.length - 1; i += 1) {
    best = Math.min(best, distanceToSegmentKm(p, geometry[i], geometry[i + 1]));
  }
  return best;
}

/** Évalue UN sondage. `previous` = échantillon du sondage précédent
 *  (null au premier sondage — aucun signal ne peut alors se
 *  confirmer, un cas isolé ne suffit jamais). Les signaux bruts
 *  (confirmed: false) servent au compteur de confirmations côté
 *  serveur (`ridecheck_events`) ; seuls les signaux confirmés
 *  déclenchent le check-in. */
export function evaluateRideCheck(
  sample: RideCheckSample,
  previous: RideCheckSample | null,
  ctx: RideCheckContext
): RideCheckResult[] {
  const out: RideCheckResult[] = [];
  const nowMin = (sample.atMs - ctx.startedAtMs) / 60000;
  const nearPickup =
    haversineKm(sample.lat, sample.lng, ctx.pickup.lat, ctx.pickup.lng) <=
    RIDECHECK_ENDPOINT_RADIUS_KM;
  const nearDestination =
    haversineKm(sample.lat, sample.lng, ctx.destination.lat, ctx.destination.lng) <=
    RIDECHECK_ENDPOINT_RADIUS_KM;

  // (a) Long arrêt : immobile depuis plus de 5 min, hors extrémités.
  if (previous && !nearPickup && !nearDestination) {
    const movedKm = haversineKm(previous.lat, previous.lng, sample.lat, sample.lng);
    const stillMin = (sample.atMs - previous.atMs) / 60000;
    if (movedKm <= RIDECHECK_STILL_KM && stillMin >= RIDECHECK_STOP_MINUTES) {
      out.push({
        signal: 'long_stop',
        confirmed: false,
        detail: `Véhicule immobile depuis plus de ${RIDECHECK_STOP_MINUTES} min, loin du départ et de la destination.`,
      });
    }
  }

  // (b) Déviation : loin de l'itinéraire routier (géométrie OSRM).
  // Sans géométrie (repli ligne droite), on ne signale rien : un
  // trajet réel s'écarte toujours d'une ligne droite.
  if (ctx.routeGeometry.length >= 2) {
    const offRouteKm = distanceToRouteKm(sample, ctx.routeGeometry);
    if (offRouteKm > RIDECHECK_DEVIATION_KM) {
      out.push({
        signal: 'deviation',
        confirmed: false,
        detail: `Position à ${(offRouteKm * 1000).toFixed(0)} m de l’itinéraire prévu.`,
      });
    }
  }

  // (c) Course anormalement longue : durée ET distance très au-delà
  // de l'estimation routière (les deux à la fois — un bouchon seul
  // allonge la durée sans allonger la distance).
  if (ctx.estimatedDurationMin > 0 && ctx.estimatedDistanceKm > 0 && nowMin > 0) {
    const longDuration =
      nowMin >= ctx.estimatedDurationMin * RIDECHECK_LONG_DURATION_FACTOR &&
      nowMin - ctx.estimatedDurationMin >= RIDECHECK_LONG_MIN_EXTRA_MIN;
    const longDistance =
      ctx.distanceTravelledKm >= ctx.estimatedDistanceKm * RIDECHECK_LONG_DISTANCE_FACTOR;
    if (longDuration && longDistance) {
      out.push({
        signal: 'long_ride',
        confirmed: false,
        detail: `Course en cours depuis ${Math.round(nowMin)} min pour ~${ctx.estimatedDurationMin} min estimées, ${ctx.distanceTravelledKm.toFixed(1)} km parcourus pour ${ctx.estimatedDistanceKm.toFixed(1)} km estimés.`,
      });
    }
  }
  return out;
}

/** Le compteur de confirmations (côté serveur) atteint-il le seuil ?
 *  `consecutive` = nombre d'évaluations consécutives ayant vu le signal. */
export function isSignalConfirmed(consecutive: number): boolean {
  return consecutive >= RIDECHECK_CONFIRM_COUNT;
}
