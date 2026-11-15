import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';
import { haversineKm } from './geo';

export type RideType = 'solo' | 'groupe';

/** Préférence de véhicule du passager : voiture, moto (rapide aux heures
 *  de pointe, 1 place) ou indifférent. La moto n'existe qu'en Solo :
 *  une moto ne peut pas prendre plusieurs passagers. */
export type VehiclePreference = 'voiture' | 'moto' | 'tous';

/** Estimation indicative d'un trajet — PAS un prix.
 *
 *  Modèle exact (décision du propriétaire, 14/11/2026) : le passager voit une
 *  estimation avant la course, puis le prix final se décide entre le
 *  passager et le chauffeur (le chauffeur propose, le passager peut
 *  aussi proposer son prix directement et contre-proposer) ; une fois
 *  accepté, le prix est figé, jamais de surge, jamais de changement à
 *  l'arrivée. La plateforme ne définit AUCUN prix fixe : il n'y a plus
 *  de tarifs de référence (supprimés, v2.11). */
export interface FareEstimate {
  /** Estimation indicative, en FCFA — jamais un prix à payer. */
  price: number;
  /** Distance ROUTIÈRE (OSRM) entre les deux points, en km — sauf
   *  repli (voir `approximate`) où c'est la distance à vol d'oiseau. */
  distanceKm: number;
  /** Durée estimée du trajet, en minutes (affichée, jamais facturée). */
  durationMin: number;
  rideType: RideType;
  vehiclePreference: VehiclePreference;
  /** Décomposition lisible affichée sous l'estimation
   *  (« 500 FCFA prise en charge + 6,6 km × 210 FCFA/km »). */
  breakdown: string;
  /** Supplément route non bitumée inclus dans l'estimation (0 sinon). */
  unpavedSupplement: number;
  /** Vrai si OSRM était indisponible et que l'estimation repose sur
   *  la distance à vol d'oiseau (repli) : l'interface l'affiche
   *  (« Estimation approximative »), le serveur le journalise. */
  approximate: boolean;
  /** Origine de la distance : 'osrm' (route réelle) ou 'haversine'
   *  (repli vol d'oiseau). */
  distanceSource: 'osrm' | 'haversine';
}

/** Ancre tarifaire (v2.16, FIGÉE — décision du propriétaire) :
 *  Centre-ville ↔ Nzeng-Ayong = Solo 1 500 FCFA / Groupe 950 FCFA,
 *  dans les deux sens. C'est une valeur FIXE, pas un calcul : la
 *  distance routière réelle (6,6 km, OSRM) donnerait 1 900 / 1 200
 *  avec le modèle au km — l'ancre ne bouge pas (v2.50, ADR 0025).
 *  Historique : l'ancre tenait par les coordonnées des deux
 *  quartiers (distance haversine 4,76 km) ; depuis la v2.50, c'est
 *  un dépassement explicite dans le calcul, pas une coïncidence de
 *  coordonnées — les deux centres restent figés (voir
 *  `lib/neighborhoods.ts`). */
export const ANCHOR_FROM = 'Centre-ville';
export const ANCHOR_TO = 'Nzeng-Ayong';
export const ANCHOR_SOLO = 1500;
export const ANCHOR_GROUPE = 950;

/** Le trajet est-il l'ancre tarifaire (dans un sens ou l'autre) ? */
export function isAnchorTrip(
  pickupNeighborhood: Neighborhood,
  destinationNeighborhood: Neighborhood
): boolean {
  return (
    (pickupNeighborhood === ANCHOR_FROM && destinationNeighborhood === ANCHOR_TO) ||
    (pickupNeighborhood === ANCHOR_TO && destinationNeighborhood === ANCHOR_FROM)
  );
}

/** Supplément route non bitumée (v2.6) : forfait fixe ajouté au tarif
 *  quand le passager demande la continuité jusqu'à un quartier à accès
 *  difficile — et que le chauffeur l'accepte. Décision du propriétaire
 *  le 14/11/2026 : 800 FCFA. Le supplément fait partie du tarif total :
 *  la commission (5 % puis 8 %) s'applique sur le total, supplément
 *  compris — voir splitFare (lib/commission.ts), qui découpe le prix
 *  figé de la course sans distinguer ses composantes. */
export const UNPAVED_ROAD_SUPPLEMENT = 800;

/** Estimation au km (v2.11, recalage décidé par le propriétaire le 14/11/2026,
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
  // Arrondi aux 50 FCFA : les espèces n'ont pas de monnaie fine à
  // Libreville — un prix rond est payable tel quel, sans rendu de
  // monnaie compliqué, et l'estimation reste lisible. Le plancher
  // (550 / 400) est appliqué APRÈS l'arrondi, jamais avant.
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
 *  proposition).
 *  Distance = vol d'oiseau (haversine) entre les centres des quartiers
 *  — AFFICHAGE UNIQUEMENT depuis la v2.50 (ADR 0025) : le prix, lui,
 *  est calculé sur la distance routière OSRM (voir
 *  `lib/estimate-server.ts`). L'ADR 0010 est remplacée : la distance
 *  à vol d'oiseau ne sert plus que de repli (OSRM indisponible) et
 *  d'affichage quand aucune route n'a encore été calculée. */
export function estimateTrip(
  pickup: Neighborhood,
  destination: Neighborhood
): { distanceKm: number; durationMin: number } {
  const distanceKm = distanceBetween(pickup, destination);
  const durationMin = Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
  return { distanceKm, durationMin };
}

/** Trajet estimé entre deux points GPS quelconques (v2.47 — pickup
 *  précis) : même formule que `estimateTrip`, mais sur les coordonnées
 *  exactes du départ et de la destination (épingle déplacée, lieu
 *  choisi) au lieu des centres de quartiers. AFFICHAGE UNIQUEMENT
 *  depuis la v2.50 (ADR 0025) : le prix est calculé sur la distance
 *  routière OSRM (voir `lib/estimate-server.ts`) ; la distance à vol
 *  d'oiseau ne sert plus que de repli (OSRM indisponible). */
export function estimateTripFromCoords(
  pickup: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): { distanceKm: number; durationMin: number } {
  const distanceKm = haversineKm(pickup.lat, pickup.lng, destination.lat, destination.lng);
  const durationMin = Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
  return { distanceKm, durationMin };
}

/** Estimation indicative du prix d'un trajet à partir d'une distance
 *  ROUTIÈRE en km (v2.50, ADR 0025) — pour deux points GPS quelconques
 *  (pas forcément des quartiers) : c'est ce qu'utilise la mini-carte
 *  d'info d'un lieu (POI). Le prix final reste négocié entre le
 *  passager et le chauffeur et figé à l'acceptation — jamais de surge.
 *  `distanceKm` DOIT être la distance routière OSRM ; quand OSRM est
 *  indisponible, l'appelant passe la distance à vol d'oiseau avec
 *  `approximate: true` (repli, voir `lib/estimate-server.ts`).
 *  `anchor: true` force le prix figé Centre-ville ↔ Nzeng-Ayong
 *  (Solo 1 500 / Groupe 950), dans les deux sens. */
export function estimateFareForDistance(
  distanceKm: number,
  rideType: RideType,
  vehiclePreference: VehiclePreference = 'tous',
  options: {
    isAirport?: boolean;
    unpavedRoad?: boolean;
    /** Durée routière OSRM en minutes (sinon estimée à 25 km/h). */
    durationMin?: number;
    /** Vrai si la distance est le repli vol d'oiseau (OSRM
     *  indisponible) — l'estimation est marquée approximative. */
    approximate?: boolean;
    /** Vrai pour l'ancre Centre-ville ↔ Nzeng-Ayong : prix figé. */
    anchor?: boolean;
  } = {}
): FareEstimate {
  const durationMin =
    options.durationMin ?? Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
  const pref: VehiclePreference =
    rideType === 'groupe' && vehiclePreference === 'moto' ? 'voiture' : vehiclePreference;
  const kmFr = distanceKm.toFixed(1).replace('.', ',');
  let price: number;
  let breakdown: string;
  if (options.anchor) {
    // Ancre FIGÉE (v2.16, ADR 0025) : Centre-ville ↔ Nzeng-Ayong,
    // Solo 1 500 / Groupe 950 — valeur fixe, pas un calcul. La
    // distance routière réelle (6,6 km) donnerait 1 900 / 1 200
    // avec le modèle au km : l'ancre prime, dans les deux sens.
    // La moto (Solo uniquement) garde sa remise ×0,6.
    const base = rideType === 'solo' ? ANCHOR_SOLO : ANCHOR_GROUPE;
    price = rideType === 'solo' && pref === 'moto' ? round50(base * 0.6) : base;
    price = Math.max(price, rideType === 'solo' ? MIN_FARE_SOLO : MIN_FARE_GROUPE);
    breakdown =
      `Trajet de référence · ${kmFr} km par la route · prix figé ${price.toLocaleString('fr-FR')} FCFA` +
      (pref === 'moto' ? ' · Moto ×0,6' : '');
  } else if (rideType === 'solo') {
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
  const approximate = options.approximate ?? false;
  return {
    price,
    distanceKm,
    durationMin,
    rideType,
    vehiclePreference: pref,
    breakdown,
    unpavedSupplement,
    approximate,
    distanceSource: approximate ? 'haversine' : 'osrm',
  };
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
