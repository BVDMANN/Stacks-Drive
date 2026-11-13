/** Quartiers et zones de Libreville (Grand Libreville) utilisés dans les
 *  listes de départ / destination. Libreville est la zone de lancement.
 *  Les coordonnées sont approximatives (centres de quartier) : elles
 *  servent à placer les marqueurs sur la carte et à estimer les prix. */

export const NEIGHBORHOODS = [
  'Centre-ville',
  'Glass',
  'Nzeng-Ayong',
  'Charbonnages',
  'Owendo',
  'Akanda',
  'Aéroport Léon-Mba',
  'Likouala',
  'Louis',
  'Sablière',
  'Alibandeng',
  'Kinguele',
  'Nkembo',
  'Akébé',
  'Plein Ciel',
  'Batterie IV',
  'Mont-Bouët',
  'Okala',
  'Damas',
  'Autre',
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

/** Coordonnées approximatives (lat/lng) du centre de chaque quartier. */
export const NEIGHBORHOOD_COORDS: Record<Neighborhood, { lat: number; lng: number }> = {
  'Centre-ville': { lat: 0.3901, lng: 9.4544 },
  Glass: { lat: 0.4033, lng: 9.442 },
  'Nzeng-Ayong': { lat: 0.43, lng: 9.47 },
  Charbonnages: { lat: 0.415, lng: 9.43 },
  Owendo: { lat: 0.34, lng: 9.5 },
  Akanda: { lat: 0.45, lng: 9.49 },
  'Aéroport Léon-Mba': { lat: 0.458, lng: 9.412 },
  Likouala: { lat: 0.38, lng: 9.47 },
  Louis: { lat: 0.41, lng: 9.45 },
  Sablière: { lat: 0.42, lng: 9.48 },
  Alibandeng: { lat: 0.38, lng: 9.49 },
  Kinguele: { lat: 0.37, lng: 9.44 },
  Nkembo: { lat: 0.44, lng: 9.45 },
  Akébé: { lat: 0.405, lng: 9.46 },
  'Plein Ciel': { lat: 0.43, lng: 9.44 },
  'Batterie IV': { lat: 0.395, lng: 9.43 },
  'Mont-Bouët': { lat: 0.395, lng: 9.47 },
  Okala: { lat: 0.41, lng: 9.49 },
  Damas: { lat: 0.36, lng: 9.47 },
  Autre: { lat: 0.3901, lng: 9.4544 },
};

/** Centre de la carte au chargement (Centre-ville). */
export const LIBREVILLE_CENTER = NEIGHBORHOOD_COORDS['Centre-ville'];

/** Types de véhicules acceptés pour les chauffeurs. */
export const VEHICLE_TYPES = ['Berline', 'SUV', 'Citadine', 'Moto'] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Moyens de paiement acceptés (aucun traitement réel : le paiement
 *  se fait directement entre le passager et le chauffeur, en espèces ou
 *  par Mobile Money). */
export const PAYMENT_METHODS = ['especes', 'airtel', 'moov'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  especes: 'Espèces',
  airtel: 'Airtel Money',
  moov: 'Moov Money',
};
