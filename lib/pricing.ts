import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';
import { haversineKm } from './geo';

export type RideType = 'solo' | 'groupe';

/** Préférence de véhicule du passager : voiture, moto (rapide aux heures
 *  de pointe, 1 place) ou indifférent. La moto n'existe qu'en Solo :
 *  une moto ne peut pas prendre plusieurs passagers. */
export type VehiclePreference = 'voiture' | 'moto' | 'tous';

export interface FareEstimate {
  /** Prix fixe estimé, en FCFA (jamais de surge). */
  price: number;
  /** Distance à vol d'oiseau entre les deux quartiers, en km. */
  distanceKm: number;
  /** Durée estimée du trajet, en minutes. */
  durationMin: number;
  rideType: RideType;
  vehiclePreference: VehiclePreference;
  /** Explication courte affichée sous le prix (« Tarif fixe · ~4 km · ~12 min »). */
  breakdown: string;
  /** Supplément route non bitumée inclus dans le prix (0 sinon). */
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

/** Tarifs fixes connus pour les trajets les plus courants — cohérents avec
 *  les anciennes courses démo. Clé symétrique « A|B » (aller = retour).
 *  Le prix Groupe est PAR PASSAGER (plus bas que le Solo).
 *  Baisse de 24 % décidée par Randy le 13/11/2026 (v2.3) : les anciens
 *  tarifs sont dans l'historique Git, pas ici. */
const FARE_OVERRIDES: Record<string, { solo: number; groupe: number }> = {
  'Aéroport Léon-Mba|Centre-ville': { solo: 3800, groupe: 1900 },
  'Glass|Nzeng-Ayong': { solo: 1350, groupe: 900 },
  'Charbonnages|Owendo': { solo: 1650, groupe: 1150 },
  'Centre-ville|Nzeng-Ayong': { solo: 1150, groupe: 700 },
  'Akanda|Aéroport Léon-Mba': { solo: 1900, groupe: 1150 },
  'Nzeng-Ayong|Owendo': { solo: 900, groupe: 550 },
};

const AIRPORT = 'Aéroport Léon-Mba';

function round50(n: number): number {
  return Math.max(0, Math.round(n / 50) * 50);
}

function overrideKey(a: Neighborhood, b: Neighborhood): string {
  // Tri par code UTF-16 (pas localeCompare : en français, « é » se trie
  // comme « e », ce qui inverserait « Akanda » et « Aéroport » et ferait
  // rater l'override Akanda ↔ Aéroport). Les clés de FARE_OVERRIDES sont
  // écrites dans cet ordre.
  return [a, b].sort().join('|');
}

/** Distance entre deux quartiers, en km. */
export function distanceBetween(a: Neighborhood, b: Neighborhood): number {
  const ca = NEIGHBORHOOD_COORDS[a];
  const cb = NEIGHBORHOOD_COORDS[b];
  if (!ca || !cb) return 0;
  return haversineKm(ca.lat, ca.lng, cb.lat, cb.lng);
}

/** Estimation de prix fixe pour un trajet. Le prix est calculé côté
 *  serveur à la création de la demande (jamais depuis le client) et
 *  figé à l'acceptation de la proposition. Formule hors overrides :
 *  base × 0,76 (baisse de 24 % décidée par Randy, v2.3), planchers
 *  550 FCFA en Solo et 400 FCFA en Groupe. Route non bitumée (v2.6) :
 *  si `unpavedRoad` est vrai, le supplément forfaitaire
 *  UNPAVED_ROAD_SUPPLEMENT s'ajoute APRÈS tout le reste (remise moto
 *  comprise) : c'est un forfait par course, jamais remisé. */
export function estimateFare(
  pickup: Neighborhood,
  destination: Neighborhood,
  rideType: RideType,
  vehiclePreference: VehiclePreference = 'tous',
  options: { unpavedRoad?: boolean } = {}
): FareEstimate {
  const distanceKm = distanceBetween(pickup, destination);
  const durationMin = Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
  const isAirport = pickup === AIRPORT || destination === AIRPORT;
  const pref: VehiclePreference =
    rideType === 'groupe' && vehiclePreference === 'moto' ? 'voiture' : vehiclePreference;

  // Recherche dans les deux ordres : la clé triée d'abord, puis les deux
  // ordres bruts (filet de sécurité si une clé a été écrite à l'envers).
  const override =
    FARE_OVERRIDES[overrideKey(pickup, destination)] ??
    FARE_OVERRIDES[`${pickup}|${destination}`] ??
    FARE_OVERRIDES[`${destination}|${pickup}`];
  let price: number;
  if (override) {
    price = rideType === 'solo' ? override.solo : override.groupe;
    if (pref === 'moto' && rideType === 'solo') price = round50(price * 0.6);
  } else if (rideType === 'solo') {
    price = round50((600 + 280 * distanceKm + (isAirport ? 800 : 0)) * 0.76);
    if (pref === 'moto') price = round50(price * 0.6);
    price = Math.max(price, 550);
  } else {
    price = round50((350 + 160 * distanceKm + (isAirport ? 400 : 0)) * 0.76);
    price = Math.max(price, 400);
  }

  // Supplément route non bitumée : forfait, ajouté tel quel au tarif.
  const unpavedSupplement = options.unpavedRoad ? UNPAVED_ROAD_SUPPLEMENT : 0;
  price += unpavedSupplement;

  const breakdown = `Tarif fixe · ~${Math.max(1, Math.round(distanceKm))} km · ~${durationMin} min${
    pref === 'moto' ? ' · Moto' : ''
  }${unpavedSupplement > 0 ? ` · +${unpavedSupplement} FCFA route non bitumée` : ''}`;
  return { price, distanceKm, durationMin, rideType, vehiclePreference: pref, breakdown, unpavedSupplement };
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
