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
  // Nord (Akanda / côte) — ajoutés v2.5 pour la carte.
  'Angondjé',
  'Cap Esterias',
  'Santa Clara',
  'Malibé',
  'Ondogo',
  // Est / nord-est — ajoutés v2.5.
  'Acaé',
  'Mindoubé',
  'Lalala',
  'La Peyrie',
  'Awendjé',
  'Gros-Bouquet',
  'Oloumi',
  'Belle-Vue',
  'Plaine-Orety',
  'Camp de Gaulle',
  'Ambowe',
  // Axe N1 vers Ntoum — ajoutés v2.5.
  'PK5',
  'PK8',
  'PK12',
  'Melen',
  'Bikélé',
  'Essassa',
  // Sud / Owendo — ajoutés v2.5.
  'Ozangué',
  'Sotega',
  'Diba-Diba',
  'Alenakiri',
  'Sogara',
  'Akournam',
  'Igoumié',
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
  // Nord (Akanda / côte).
  Angondjé: { lat: 0.515, lng: 9.445 },
  'Cap Esterias': { lat: 0.615, lng: 9.345 },
  'Santa Clara': { lat: 0.575, lng: 9.37 },
  Malibé: { lat: 0.555, lng: 9.385 },
  Ondogo: { lat: 0.47, lng: 9.45 },
  // Est / nord-est.
  Acaé: { lat: 0.445, lng: 9.49 },
  Mindoubé: { lat: 0.465, lng: 9.5 },
  Lalala: { lat: 0.435, lng: 9.495 },
  'La Peyrie': { lat: 0.435, lng: 9.455 },
  Awendjé: { lat: 0.42, lng: 9.455 },
  'Gros-Bouquet': { lat: 0.425, lng: 9.44 },
  Oloumi: { lat: 0.405, lng: 9.435 },
  'Belle-Vue': { lat: 0.425, lng: 9.465 },
  'Plaine-Orety': { lat: 0.44, lng: 9.435 },
  'Camp de Gaulle': { lat: 0.445, lng: 9.43 },
  Ambowe: { lat: 0.445, lng: 9.42 },
  // Axe N1 vers Ntoum.
  PK5: { lat: 0.44, lng: 9.51 },
  PK8: { lat: 0.45, lng: 9.53 },
  PK12: { lat: 0.46, lng: 9.56 },
  Melen: { lat: 0.455, lng: 9.545 },
  Bikélé: { lat: 0.47, lng: 9.58 },
  Essassa: { lat: 0.475, lng: 9.6 },
  // Sud / Owendo.
  Ozangué: { lat: 0.365, lng: 9.5 },
  Sotega: { lat: 0.335, lng: 9.49 },
  'Diba-Diba': { lat: 0.325, lng: 9.485 },
  Alenakiri: { lat: 0.33, lng: 9.51 },
  Sogara: { lat: 0.345, lng: 9.515 },
  Akournam: { lat: 0.32, lng: 9.5 },
  Igoumié: { lat: 0.315, lng: 9.49 },
  Autre: { lat: 0.3901, lng: 9.4544 },
};

/** Niveau d'affichage du libellé de quartier sur la carte (v2.5).
 *  Tier 1 = grands quartiers, visibles dès le zoom 11 (vue par défaut
 *  = zoom 12) ; tier 2 = quartiers plus petits ou éloignés, visibles
 *  seulement à partir du zoom 14, pour ne pas surcharger la carte.
 *  'Autre' n'a pas de libellé (ce n'est pas un lieu). */
export const NEIGHBORHOOD_LABEL_TIER: Record<Neighborhood, 1 | 2> = {
  'Centre-ville': 1,
  Glass: 1,
  'Nzeng-Ayong': 1,
  Charbonnages: 1,
  Owendo: 1,
  Akanda: 1,
  'Aéroport Léon-Mba': 1,
  Likouala: 1,
  Louis: 1,
  Sablière: 1,
  Alibandeng: 1,
  Kinguele: 1,
  Nkembo: 1,
  Akébé: 1,
  'Plein Ciel': 1,
  'Batterie IV': 1,
  'Mont-Bouët': 1,
  Okala: 1,
  Damas: 1,
  Angondjé: 1,
  'Cap Esterias': 2,
  'Santa Clara': 2,
  Malibé: 2,
  Ondogo: 2,
  Acaé: 2,
  Mindoubé: 2,
  Lalala: 2,
  'La Peyrie': 2,
  Awendjé: 2,
  'Gros-Bouquet': 2,
  Oloumi: 2,
  'Belle-Vue': 2,
  'Plaine-Orety': 2,
  'Camp de Gaulle': 2,
  Ambowe: 2,
  PK5: 1,
  PK8: 1,
  PK12: 2,
  Melen: 2,
  Bikélé: 2,
  Essassa: 2,
  Ozangué: 2,
  Sotega: 2,
  'Diba-Diba': 2,
  Alenakiri: 2,
  Sogara: 2,
  Akournam: 2,
  Igoumié: 2,
  Autre: 2,
};

/** Décalage d'affichage du libellé uniquement (pixels, jamais les
 *  coordonnées : tarifs et « Me localiser » ne bougent pas). Sert à
 *  décoller deux libellés voisins qui se touchent au zoom 12. */
export const NEIGHBORHOOD_LABEL_OFFSET: Partial<
  Record<Neighborhood, { x: number; y: number }>
> = {
  Likouala: { x: -20, y: 0 },
  Alibandeng: { x: 20, y: 0 },
};

/** Accès routier des quartiers (v2.6) — PROPOSITION À FAIRE VALIDER
 *  PAR RANDY : la liste des quartiers difficiles est un point de
 *  départ, pas une vérité terrain. Un quartier « difficile » n'est pas
 *  desservi par une route bitumée jusqu'au centre du quartier : la
 *  course s'arrête par défaut à son point de dépôt (quartier
 *  accessible le plus proche, sur route bitumée). Le passager peut
 *  demander la continuité sur route non bitumée (+ supplément, voir
 *  UNPAVED_ROAD_SUPPLEMENT dans lib/pricing.ts) ; le chauffeur est
 *  libre de l'accepter ou non. Bikélé n'est PAS difficile (accessible,
 *  juste loin — son éloignement est déjà reflété par le prix calculé
 *  sur la distance). La distance, elle, ne change jamais : seuls les
 *  libellés / points de dépôt sont approximatifs. */
export type RoadAccess = 'bitume' | 'difficile';

export const ROAD_ACCESS: Record<Neighborhood, RoadAccess> = {
  'Centre-ville': 'bitume',
  Glass: 'bitume',
  'Nzeng-Ayong': 'bitume',
  Charbonnages: 'bitume',
  Owendo: 'bitume',
  Akanda: 'bitume',
  'Aéroport Léon-Mba': 'bitume',
  Likouala: 'bitume',
  Louis: 'bitume',
  Sablière: 'bitume',
  Alibandeng: 'bitume',
  Kinguele: 'bitume',
  Nkembo: 'bitume',
  Akébé: 'bitume',
  'Plein Ciel': 'bitume',
  'Batterie IV': 'bitume',
  'Mont-Bouët': 'bitume',
  Okala: 'bitume',
  Damas: 'bitume',
  Angondjé: 'bitume',
  'Cap Esterias': 'difficile',
  'Santa Clara': 'difficile',
  Malibé: 'difficile',
  Ondogo: 'difficile',
  Acaé: 'bitume',
  Mindoubé: 'bitume',
  Lalala: 'bitume',
  'La Peyrie': 'bitume',
  Awendjé: 'bitume',
  'Gros-Bouquet': 'bitume',
  Oloumi: 'bitume',
  'Belle-Vue': 'bitume',
  'Plaine-Orety': 'bitume',
  'Camp de Gaulle': 'bitume',
  Ambowe: 'bitume',
  PK5: 'bitume',
  PK8: 'bitume',
  PK12: 'difficile',
  Melen: 'difficile',
  Bikélé: 'bitume',
  Essassa: 'difficile',
  Ozangué: 'bitume',
  Sotega: 'bitume',
  'Diba-Diba': 'bitume',
  Alenakiri: 'difficile',
  Sogara: 'difficile',
  Akournam: 'difficile',
  Igoumié: 'difficile',
  Autre: 'bitume',
};

/** Point de dépôt d'un quartier difficile : le quartier accessible
 *  (bitume) le plus proche, où la course s'arrête par défaut. Le
 *  point de dépôt est TOUJOURS un quartier 'bitume' — jamais un
 *  quartier difficile, sinon la course n'aboutirait nulle part. */
export const DROP_OFF_POINT: Partial<Record<Neighborhood, Neighborhood>> = {
  // Axe N1 : la route bitumée s'arrête à PK8, les quartiers au-delà
  // sont desservis par des pistes.
  PK12: 'PK8',
  Melen: 'PK8',
  Essassa: 'PK8',
  // Côte nord : la route bitumée s'arrête à Angondjé.
  'Cap Esterias': 'Angondjé',
  'Santa Clara': 'Angondjé',
  Malibé: 'Angondjé',
  // Ondogo : accès par Akanda.
  Ondogo: 'Akanda',
  // Sud d'Owendo (zone portuaire / industrielle) : repli sur Owendo.
  Alenakiri: 'Owendo',
  Sogara: 'Owendo',
  Akournam: 'Owendo',
  Igoumié: 'Owendo',
};

/** Quartier difficile ? */
export function isDifficultAccess(n: Neighborhood): boolean {
  return ROAD_ACCESS[n] === 'difficile';
}

/** Point de dépôt d'un quartier (lui-même si l'accès est bitumé). */
export function dropOffPointFor(n: Neighborhood): Neighborhood {
  return DROP_OFF_POINT[n] ?? n;
}

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
