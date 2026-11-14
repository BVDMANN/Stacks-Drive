/** Courses sur le chemin du retour + filtre destination (v2.34).
 *
 *  Le chauffeur définit une destination de retour (un quartier,
 *  `profiles.return_destination`) et active le filtre
 *  (`profiles.return_filter_enabled`) : il ne reçoit alors que les
 *  demandes qui vont dans cette direction — trajet dont la
 *  destination est proche de son cap de retour, avec une tolérance
 *  de détour raisonnable. Le filtre est visible et désactivable à
 *  tout moment par le chauffeur (tableau de bord) ; désactivé, le
 *  dispatch redevient celui d'avant.
 *
 *  Règle géométrique (sans service externe, haversine uniquement) :
 *  la demande est « sur le chemin » si sa destination est à moins de
 *  RETURN_DETOUR_KM de la ligne droite [position du chauffeur →
 *  destination de retour] OU à moins de RETURN_NEAR_DESTINATION_KM
 *  de la destination de retour elle-même. Une demande dont le départ
 *  est très loin du chauffeur reste filtrée par le rayon de dispatch
 *  existant (5 km puis élargi) — ce filtre ne fait que resserrer.
 */

import { haversineKm } from './geo';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';
import { distanceToSegmentKm } from './ridecheck';

/** Tolérance de détour : distance max à la ligne de retour (km). */
export const RETURN_DETOUR_KM = 3;
/** Destination proche du point de retour (km). */
export const RETURN_NEAR_DESTINATION_KM = 5;

export interface ReturnFilterInput {
  /** Position actuelle du chauffeur (GPS si connue, sinon centre de son quartier). */
  driverLat: number;
  driverLng: number;
  /** Quartier de retour déclaré par le chauffeur. */
  returnDestination: Neighborhood;
  /** Quartier de départ de la demande. */
  ridePickup: Neighborhood;
  /** Quartier de destination de la demande. */
  rideDestination: Neighborhood;
}

/** La demande va-t-elle dans la direction du retour du chauffeur ? */
export function isOnWayToReturn(input: ReturnFilterInput): boolean {
  const ret = NEIGHBORHOOD_COORDS[input.returnDestination];
  const dest = NEIGHBORHOOD_COORDS[input.rideDestination];
  if (!ret || !dest) return false;
  // Destination proche du point de retour : sur le chemin, quoi qu'il arrive.
  if (haversineKm(dest.lat, dest.lng, ret.lat, ret.lng) <= RETURN_NEAR_DESTINATION_KM) {
    return true;
  }
  // Destination proche de la ligne [chauffeur → retour] : détour raisonnable.
  const offLineKm = distanceToSegmentKm(
    { lat: dest.lat, lng: dest.lng },
    { lat: input.driverLat, lng: input.driverLng },
    { lat: ret.lat, lng: ret.lng }
  );
  return offLineKm <= RETURN_DETOUR_KM;
}
