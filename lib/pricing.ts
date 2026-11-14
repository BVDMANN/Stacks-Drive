import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';
import { haversineKm } from './geo';

export type RideType = 'solo' | 'groupe';

/** Préférence de véhicule du passager : voiture, moto (rapide aux heures
 *  de pointe, 1 place) ou indifférent. La moto n'existe qu'en Solo :
 *  une moto ne peut pas prendre plusieurs passagers. */
export type VehiclePreference = 'voiture' | 'moto' | 'tous';

/** Estimation indicative d'un trajet — PAS un prix.
 *
 *  Modèle exact (décision de Randy, 14/11/2026) : le passager voit une
 *  estimation avant la course, puis le prix final se décide entre le
 *  passager et le chauffeur (le chauffeur propose, le passager peut
 *  aussi proposer son prix directement et contre-proposer) ; une fois
 *  accepté, le prix est figé, jamais de surge, jamais de changement à
 *  l'arrivée. La plateforme ne définit AUCUN prix fixe : il n'y a plus
 *  de tarifs de référence (supprimés, v2.11). */
export interface FareEstimate {
  /** Estimation indicative, en FCFA — jamais un prix à payer. */
  price: number;
  /** Distance à vol d'oiseau entre les deux quartiers, en km. */
  distanceKm: number;
  /** Durée estimée du trajet, en minutes (affichée, jamais facturée). */
  durationMin: number;
  rideType: RideType;
  vehiclePreference: VehiclePreference;
  /** Décomposition lisible affichée sous l'estimation
   *  (« 500 FCFA prise en charge + 4,8 km × 210 FCFA/km »). */
  breakdown: string;
  /** Supplément route non bitumée inclus dans l'estimation (0 sinon). */
  unpavedSupplement: number;
}

/** Supplément route non bitumée (v2.6) : forfait fixe ajouté au tarif
 *  quand le passager demande la continuité jusqu'à un quartier à accès
 *  difficile — et que le chauffeur l'accepte. Décision de Randy le
 *  14/11/2026 : 800 FCFA. Le supplément fait partie du tarif total :
 *  la commission (5 % puis 8 %) s'applique sur le total, supplément
 *  compris — voir splitFare (lib/commission.ts), qui découpe le prix
 *  figé de la course sans distinguer ses composantes. */
export const UNPAVED_ROAD_SUPPLEMENT = 800;

/** Estimation au km (v2.11, recalage décidé par Randy le 14/11/2026,
 *  ancré sur l'exemple Centre-ville → Nzeng-Ayong : Solo 1 500 FCFA,
 *  Groupe 950 FCFA) : comme Gozem et Yango — prise en charge + prix au
 *  kilomètre, estimation indicative affichée avant la course, pas de
 *  prix à la minute. Le prix final, lui, se décide entre le passager
 *  et le chauffeur (proposition / contre-proposition) et est figé à
 *  l'acceptation — jamais de surge.
 *  Estimation = max(plancher, arrondi50(prise en charge + taux/km ×
 *  distance + supplément aéroport)) — puis ×0,6 pour la moto, puis
 *  +800 FCFA de supplément piste (jamais remisé) s'il y a lieu. */
export const BASE_FARE_SOLO = 500;
export const PER_KM_SOLO = 210;
export const AIRPORT_SUPPLEMENT_SOLO = 800;
export const MIN_FARE_SOLO = 550;

export const BASE_FARE_GROUPE = 300;
export const PER_KM_GROUPE = 135;
export const AIRPORT_SUPPLEMENT_GROUPE = 300;
export const MIN_FARE_GROUPE = 400;

const AIRPORT = 'Aéroport Léon-Mba';

function round50(n: number): number {
  return Math.max(0, Math.round(n / 50) * 50);
}

/** Distance entre deux quartiers, en km. */
export function distanceBetween(a: Neighborhood, b: Neighborhood): number {
  const ca = NEIGHBORHOOD_COORDS[a];
  const cb = NEIGHBORHOOD_COORDS[b];
  if (!ca || !cb) return 0;
  return haversineKm(ca.lat, ca.lng, cb.lat, cb.lng);
}

/** Trajet estimé (distance / durée) — sans aucun prix. Utilisé partout
 *  où l'interface a besoin de la distance et de la durée sans parler
 *  d'argent (vue course, tableau de bord chauffeur, pop-up de
 *  proposition). */
export function estimateTrip(
  pickup: Neighborhood,
  destination: Neighborhood
): { distanceKm: number; durationMin: number } {
  const distanceKm = distanceBetween(pickup, destination);
  const durationMin = Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
  return { distanceKm, durationMin };
}

/** Estimation indicative du prix d'un trajet à partir d'une distance
 *  en km (v2.13) — même modèle que `estimateFare`, mais pour deux
 *  points GPS quelconques (pas forcément des quartiers) : c'est ce
 *  qu'utilise la mini-carte d'info d'un lieu (POI). Le prix final
 *  reste négocié entre le passager et le chauffeur et figé à
 *  l'acceptation — jamais de surge. */
export function estimateFareForDistance(
  distanceKm: number,
  rideType: RideType,
  vehiclePreference: VehiclePreference = 'tous',
  options: { isAirport?: boolean; unpavedRoad?: boolean } = {}
): FareEstimate {
  const durationMin = Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
  const pref: VehiclePreference =
    rideType === 'groupe' && vehiclePreference === 'moto' ? 'voiture' : vehiclePreference;
  const kmFr = distanceKm.toFixed(1).replace('.', ',');
  let price: number;
  let breakdown: string;
  if (rideType === 'solo') {
    price = round50(
      BASE_FARE_SOLO + PER_KM_SOLO * distanceKm + (options.isAirport ? AIRPORT_SUPPLEMENT_SOLO : 0)
    );
    if (pref === 'moto') price = round50(price * 0.6);
    const floored = price < MIN_FARE_SOLO;
    price = Math.max(price, MIN_FARE_SOLO);
    breakdown =
      `${BASE_FARE_SOLO} FCFA prise en charge + ${kmFr} km × ${PER_KM_SOLO} FCFA/km` +
      (options.isAirport ? ` + ${AIRPORT_SUPPLEMENT_SOLO} FCFA aéroport` : '') +
      (pref === 'moto' ? ' · Moto ×0,6' : '') +
      (floored ? ` · minimum ${MIN_FARE_SOLO} FCFA` : '');
  } else {
    price = round50(
      BASE_FARE_GROUPE + PER_KM_GROUPE * distanceKm + (options.isAirport ? AIRPORT_SUPPLEMENT_GROUPE : 0)
    );
    const floored = price < MIN_FARE_GROUPE;
    price = Math.max(price, MIN_FARE_GROUPE);
    breakdown =
      `${BASE_FARE_GROUPE} FCFA prise en charge + ${kmFr} km × ${PER_KM_GROUPE} FCFA/km` +
      (options.isAirport ? ` + ${AIRPORT_SUPPLEMENT_GROUPE} FCFA aéroport` : '') +
      (floored ? ` · minimum ${MIN_FARE_GROUPE} FCFA` : '');
  }

  // Supplément route non bitumée : forfait, ajouté tel quel à l'estimation.
  const unpavedSupplement = options.unpavedRoad ? UNPAVED_ROAD_SUPPLEMENT : 0;
  price += unpavedSupplement;

  breakdown += ` · ~${durationMin} min` + (pref === 'moto' ? ' · Moto' : '');
  if (unpavedSupplement > 0) breakdown += ` · +${unpavedSupplement} FCFA route non bitumée`;
  return { price, distanceKm, durationMin, rideType, vehiclePreference: pref, breakdown, unpavedSupplement };
}

/** Estimation indicative du prix d'un trajet. Calculée côté serveur à
 *  la création de la demande (jamais depuis le client) et affichée au
 *  passager comme un repère — ce n'est PAS le prix de la course. Le
 *  prix final est proposé par le chauffeur (le passager peut aussi
 *  proposer le sien) et figé à l'acceptation de la proposition.
 *  Modèle au km (v2.11) : prise en charge + taux/km × distance (+
 *  supplément aéroport), arrondi aux 50 FCFA, plancher 550 FCFA en
 *  Solo et 400 FCFA en Groupe. Moto = Solo × 0,6 (plancher 550
 *  appliqué après la remise). Route non bitumée (v2.6) : si
 *  `unpavedRoad` est vrai, le supplément forfaitaire
 *  UNPAVED_ROAD_SUPPLEMENT s'ajoute APRÈS tout le reste (remise moto
 *  comprise) : c'est un forfait par course, jamais remisé. */
export function estimateFare(
  pickup: Neighborhood,
  destination: Neighborhood,
  rideType: RideType,
  vehiclePreference: VehiclePreference = 'tous',
  options: { unpavedRoad?: boolean } = {}
): FareEstimate {
  const { distanceKm } = estimateTrip(pickup, destination);
  return estimateFareForDistance(distanceKm, rideType, vehiclePreference, {
    isAirport: pickup === AIRPORT || destination === AIRPORT,
    unpavedRoad: options.unpavedRoad,
  });
}

/** Temps d'arrivée estimé du chauffeur le plus proche, en minutes,
 *  à partir de sa distance au point de prise en charge. */
export function etaMinutes(distanceKm: number): number {
  return Math.max(2, Math.round(2 + (distanceKm / 28) * 60));
}

/** Durée affichée pour un trajet (« ~12 min »). */
export function formatDuration(minutes: number): string {
  return `~${minutes} min`;
}
