/** Estimation serveur — source unique de vérité du prix (v2.50,
 *  ADR 0025).
 *
 *  Le prix est calculé et revalidé CÔTÉ SERVEUR uniquement. Le
 *  client ne calcule jamais un prix seul : il appelle
 *  `POST /api/estimate` et affiche ce que le serveur renvoie. La
 *  création d'une demande (`POST /api/rides`) et l'acceptation
 *  d'une proposition (`POST /api/proposals/[id]`) passent par le
 *  même estimateur — client et serveur donnent donc toujours le
 *  même résultat pour le même trajet.
 *
 *  Règles (v2.50) :
 *  - Distance = DISTANCE ROUTIÈRE OSRM entre les points exacts
 *    (départ et destination, épingle déplacée comprise). Le modèle
 *    au km est inchangé (Solo 500 + 210/km, Groupe 300 + 135/km,
 *    planchers 550/400, suppléments aéroport 800/300 et piste 800).
 *  - Ancre Centre-ville ↔ Nzeng-Ayong (Solo 1 500 / Groupe 950) :
 *    valeur FIXE, pas un calcul — elle prime sur le modèle au km,
 *    dans les deux sens, quelle que soit la distance routière.
 *  - REPLI (OSRM indisponible) : distance à vol d'oiseau entre les
 *    points exacts, et l'estimation est marquée `approximate: true`
 *    (`distanceSource: 'haversine'`). L'interface l'affiche
 *    (« Estimation approximative ») ; le serveur journalise le
 *    repli. Jamais de prix inventé, jamais de plantage silencieux.
 *  - Le supplément aéroport est déterminé par le QUARTIER (départ
 *    ou destination = Aéroport Léon-Mba), comme avant : l'épingle
 *    ne change que la distance, pas les règles.
 */

import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';
import {
  estimateFareForDistance,
  isAnchorTrip,
  type FareEstimate,
  type VehiclePreference,
} from './pricing';
import { fetchRoadRoute, straightLineRoute, type RoadRoute, type RoutePoint } from './routing';

export interface EstimateInput {
  /** Point de départ exact (épingle). */
  from: RoutePoint;
  /** Point de destination exact (épingle ou lieu). */
  to: RoutePoint;
  /** Quartier de départ (supplément aéroport + ancre). */
  fromNeighborhood: Neighborhood;
  /** Quartier de destination (supplément aéroport + ancre). */
  toNeighborhood: Neighborhood;
  /** Le passager a coché « route non bitumée » (v2.6). */
  unpavedRoad?: boolean;
  /** Préférence de véhicule du passager (pour la remise moto). */
  vehiclePreference?: VehiclePreference;
}

export interface ServerEstimate {
  solo: FareEstimate;
  groupe: FareEstimate;
  /** Route utilisée : OSRM (route réelle) ou repli ligne droite. */
  route: RoadRoute;
  /** Vrai si OSRM était indisponible (repli vol d'oiseau). */
  approximate: boolean;
}

/** Estime un trajet côté serveur. Jamais d'exception : en cas de
 *  problème, le repli vol d'oiseau s'applique (estimation marquée
 *  approximative). */
export async function estimateTripServer(input: EstimateInput): Promise<ServerEstimate> {
  const route = await fetchRoadRoute(input.from, input.to);
  return estimateFromRoute(route, input);
}

/** Même chose à partir d'une route déjà calculée (évite un second
 *  appel OSRM quand la route est connue — ex. acceptation d'une
 *  proposition qui a déjà récupéré l'itinéraire). */
export function estimateFromRoute(route: RoadRoute, input: EstimateInput): ServerEstimate {
  const approximate = route.source === 'fallback';
  const anchor = isAnchorTrip(input.fromNeighborhood, input.toNeighborhood);
  const airport =
    input.fromNeighborhood === 'Aéroport Léon-Mba' ||
    input.toNeighborhood === 'Aéroport Léon-Mba';
  const vehiclePreference = input.vehiclePreference ?? 'tous';
  const solo = estimateFareForDistance(route.distanceKm, 'solo', vehiclePreference, {
    isAirport: airport,
    unpavedRoad: input.unpavedRoad,
    durationMin: route.durationMin,
    approximate,
    anchor,
  });
  const groupe = estimateFareForDistance(route.distanceKm, 'groupe', 'voiture', {
    isAirport: airport,
    unpavedRoad: input.unpavedRoad,
    durationMin: route.durationMin,
    approximate,
    anchor,
  });
  return { solo, groupe, route, approximate };
}

/** Distance et durée d'un trajet entre deux points exacts, sans
 *  prix (affichage, guidage, vue course). Préfère la route OSRM ;
 *  repli ligne droite si OSRM est indisponible. */
export async function roadTripBetween(from: RoutePoint, to: RoutePoint): Promise<RoadRoute> {
  return fetchRoadRoute(from, to);
}

/** Points exacts d'un quartier (son centre figé), pour les trajets
 *  sans épingle déplacée (quartiers choisis dans les listes). */
export function neighborhoodPoint(neighborhood: Neighborhood): RoutePoint {
  const coords = NEIGHBORHOOD_COORDS[neighborhood];
  return { lat: coords.lat, lng: coords.lng };
}

/** Repli explicite sans appel OSRM (ex. quand la route vient
 *  d'être calculée ailleurs et qu'on sait déjà qu'OSRM est hors
 *  service) : ligne droite + estimation marquée approximative. */
export function fallbackEstimate(input: EstimateInput): ServerEstimate {
  const route = straightLineRoute(input.from, input.to);
  return estimateFromRoute(route, input);
}
