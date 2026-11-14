import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';

/** Distance orthodromique (haversine) entre deux points GPS, en kilomètres.
 *  Suffisant pour estimer les trajets à l'échelle de Libreville.
 *
 *  Pourquoi haversine et pas la distance routière : à l'échelle d'une
 *  ville, l'erreur reste petite devant le pas d'arrondi (50 FCFA) et
 *  la distance ne dépend d'aucun service externe — c'est elle qui
 *  porte le prix (ADR 0010). La distance routière (OSRM) sert à
 *  l'affichage et au guidage uniquement. Ne jamais remplacer cet appel
 *  par OSRM dans le calcul d'un prix. */
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

/** Périmètre « chauffeurs autour de toi » (km) — UNIQUE source de
 *  vérité, à changer en un seul endroit : la vue passager (marqueurs
 *  sur la carte + compteur, `components/home/HomeScreen.tsx`) et le
 *  premier rayon du dispatch (`getIncomingRequests`, `lib/rides.ts`)
 *  utilisent cette même valeur. Après 30 s sans proposition, le
 *  dispatch élargit à DISPATCH_WIDENED_RADIUS_KM. Le cercle
 *  périmètre dessiné sur la carte (v2.31) utilise ce même rayon. */
export const DRIVERS_AROUND_RADIUS_KM = 5;

/** Zooms de la carte (v2.31 — « carte zonée quartier ») : la carte
 *  s'ouvre sur le quartier de la personne, jamais sur toute la ville.
 *  `MAP_INITIAL_ZOOM` (14) = vue quartier (rues + libellés tier 3 +
 *  lieux visibles) ; `MAP_CITY_ZOOM` (12) = vue ville (12 libellés),
 *  accessible en dézoomant ; `MAP_MIN_ZOOM` = 12 : on ne peut pas
 *  dézoomer sous la vue ville, la carte reste cadrée sur la zone. */
export const MAP_INITIAL_ZOOM = 14;
export const MAP_CITY_ZOOM = 12;
export const MAP_MIN_ZOOM = 12;

/** Zone de service — Grand Libreville (v2.31). UNIQUE source de
 *  vérité, partagée par :
 *  - la carte (`components/map/LibrevilleMap.tsx` : `maxBounds` +
 *    `maxBoundsViscosity`, on ne peut pas défiler hors zone) ;
 *  - « Me localiser » et l'ancrage d'ouverture
 *    (`components/home/HomeScreen.tsx` : `isInServiceArea`) ;
 *  - le prochain lot (écran hors zone) la réutilisera telle quelle.
 *  Rectangle lat/lng : il couvre les 70 quartiers de
 *  `NEIGHBORHOOD_COORDS` (lat 0,304–0,611, lng 9,322–9,674) avec
 *  ~9 km de marge de chaque côté — assez large pour une position GPS
 *  réelle aux abords d'un quartier, assez serré pour exclure le reste
 *  du Gabon (et, a fortiori, la France). C'est une appartenance au
 *  rectangle, pas une distance au quartier le plus proche : quelqu'un
 *  à 20 km de Libreville est hors zone même si le quartier le plus
 *  proche n'est « qu'à » 20 km. */
export const SERVICE_BOUNDS = {
  /** Sud : ~9 km sous Alenakiri (0,304), le quartier le plus au sud. */
  south: 0.22,
  /** Ouest : ~9 km à l'ouest de Cap Esterias (9,322). */
  west: 9.24,
  /** Nord : ~9 km au nord de Cap Esterias (0,611). */
  north: 0.69,
  /** Est : ~9 km à l'est de Nkoltang (9,674). */
  east: 9.76,
} as const;

/** La position GPS est-elle dans la zone de service (Grand
 *  Libreville) ? Voir `SERVICE_BOUNDS` ci-dessus. */
export function isInServiceArea(lat: number, lng: number): boolean {
  return (
    lat >= SERVICE_BOUNDS.south &&
    lat <= SERVICE_BOUNDS.north &&
    lng >= SERVICE_BOUNDS.west &&
    lng <= SERVICE_BOUNDS.east
  );
}

/** Rayon élargi du dispatch après 30 s sans proposition
 *  (« on élargit la recherche »). */
export const DISPATCH_WIDENED_RADIUS_KM = 25;

/** Quartier le plus proche d'une position GPS (distance au centre du
 *  quartier). Sert à la géolocalisation du point de départ (« Me
 *  localiser ») : on renvoie le quartier + la distance, l'appelant
 *  décide si la position est dans la zone de service
 *  (`isInServiceArea`, `SERVICE_BOUNDS`) — jamais un seuil de
 *  distance seul (l'ancien seuil ~60 km plaçait encore quelqu'un à
 *  20–50 km de Libreville). */
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
