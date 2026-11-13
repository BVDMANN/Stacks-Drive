import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';

/** Distance orthodromique (haversine) entre deux points GPS, en kilomètres.
 *  Suffisant pour estimer les trajets à l'échelle de Libreville. */

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // rayon terrestre, km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Quartier le plus proche d'une position GPS (distance au centre du
 *  quartier). Sert à la géolocalisation du point de départ (« Me
 *  localiser ») : on renvoie le quartier + la distance, l'appelant décide
 *  si c'est assez proche pour être pertinent (seuil ~60 km : au-delà,
 *  la personne est hors de Libreville). */
export function nearestNeighborhood(
  lat: number,
  lng: number
): { neighborhood: Neighborhood; distanceKm: number } {
  let best: Neighborhood = 'Centre-ville';
  let bestDist = Number.POSITIVE_INFINITY;
  (Object.keys(NEIGHBORHOOD_COORDS) as Neighborhood[]).forEach((n) => {
    if (n === 'Autre') return;
    const c = NEIGHBORHOOD_COORDS[n];
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  });
  return { neighborhood: best, distanceKm: bestDist };
}
