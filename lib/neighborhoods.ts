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
  // Centre / côte — ajoutés v2.8 (densification : noms confirmés par
  // les listes officielles des arrondissements et la grille DGI).
  'Petit Paris',
  'Cocotiers',
  'Gué-Gué',
  'Trois Quartiers',
  'Sorbonne',
  'Venez-Voir',
  'Sainte-Marie',
  'Tahiti',
  // Nord (Akanda / côte) — ajoutés v2.8.
  'Cité de la Démocratie',
  'Avorbam',
  'Barracuda',
  'Cap Caravane',
  // Axe N1 vers Ntoum — ajoutés v2.8 (PK6/PK9/PK11, Sibang, Montalier,
  // Bambouchine, Bizango, Nkok, Nkoltang : localités réelles de la N1).
  'PK6',
  'PK9',
  'PK11',
  'Sibang',
  'Montalier',
  'Bambouchine',
  'Bizango',
  'Nkok',
  'Nkoltang',
  // Sud / Owendo — ajoutés v2.8.
  'Nomba',
  'Autre',
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

/** Coordonnées approximatives (lat/lng) du centre de chaque quartier. */
// Coordonnées vérifiées (v2.14) : géocodeur (Mapcarta/OSM), listes
// officielles des arrondissements, JO / L'Union, grille DGI. Les
// positions incertaines restent sur leur repère connu le plus proche
// (voir le rapport v2.14) : ne pas les déplacer sans source.
export const NEIGHBORHOOD_COORDS: Record<Neighborhood, { lat: number; lng: number }> = {
  'Centre-ville': { lat: 0.3901, lng: 9.4544 },
  Glass: { lat: 0.398, lng: 9.441 },
  'Nzeng-Ayong': { lat: 0.43, lng: 9.47 },
  Charbonnages: { lat: 0.436, lng: 9.446 },
  Owendo: { lat: 0.34, lng: 9.5 },
  Akanda: { lat: 0.5, lng: 9.47 },
  'Aéroport Léon-Mba': { lat: 0.458, lng: 9.412 },
  Likouala: { lat: 0.38, lng: 9.47 },
  Louis: { lat: 0.411, lng: 9.443 },
  Sablière: { lat: 0.474, lng: 9.402 },
  Alibandeng: { lat: 0.456, lng: 9.428 },
  Kinguele: { lat: 0.375, lng: 9.46 },
  Nkembo: { lat: 0.44, lng: 9.45 },
  Akébé: { lat: 0.405, lng: 9.46 },
  'Plein Ciel': { lat: 0.43, lng: 9.44 },
  'Batterie IV': { lat: 0.395, lng: 9.43 },
  'Mont-Bouët': { lat: 0.395, lng: 9.47 },
  Okala: { lat: 0.495, lng: 9.42 },
  Damas: { lat: 0.428, lng: 9.465 },
  // Nord (Akanda / côte).
  Angondjé: { lat: 0.515, lng: 9.445 },
  'Cap Esterias': { lat: 0.615, lng: 9.345 },
  'Santa Clara': { lat: 0.575, lng: 9.37 },
  Malibé: { lat: 0.555, lng: 9.385 },
  Ondogo: { lat: 0.445, lng: 9.455 },
  // Est / nord-est.
  Acaé: { lat: 0.445, lng: 9.49 },
  Mindoubé: { lat: 0.465, lng: 9.5 },
  Lalala: { lat: 0.428, lng: 9.482 },
  'La Peyrie': { lat: 0.4, lng: 9.464 },
  Awendjé: { lat: 0.389, lng: 9.473 },
  'Gros-Bouquet': { lat: 0.425, lng: 9.44 },
  Oloumi: { lat: 0.405, lng: 9.435 },
  'Belle-Vue': { lat: 0.394, lng: 9.478 },
  'Plaine-Orety': { lat: 0.408, lng: 9.447 },
  'Camp de Gaulle': { lat: 0.445, lng: 9.43 },
  Ambowe: { lat: 0.445, lng: 9.42 },
  // Axe N1 vers Ntoum.
  PK5: { lat: 0.44, lng: 9.51 },
  PK8: { lat: 0.45, lng: 9.53 },
  PK12: { lat: 0.46, lng: 9.56 },
  Melen: { lat: 0.458, lng: 9.552 },
  Bikélé: { lat: 0.47, lng: 9.58 },
  Essassa: { lat: 0.475, lng: 9.6 },
  // Sud / Owendo.
  Ozangué: { lat: 0.38, lng: 9.487 },
  Sotega: { lat: 0.383, lng: 9.45 },
  'Diba-Diba': { lat: 0.325, lng: 9.485 },
  Alenakiri: { lat: 0.33, lng: 9.51 },
  Sogara: { lat: 0.345, lng: 9.515 },
  Akournam: { lat: 0.32, lng: 9.5 },
  Igoumié: { lat: 0.315, lng: 9.49 },
  // Centre / côte (v2.8).
  'Petit Paris': { lat: 0.384, lng: 9.449 },
  Cocotiers: { lat: 0.397, lng: 9.441 },
  'Gué-Gué': { lat: 0.415, lng: 9.438 },
  'Trois Quartiers': { lat: 0.418, lng: 9.442 },
  Sorbonne: { lat: 0.398, lng: 9.458 },
  'Venez-Voir': { lat: 0.402, lng: 9.468 },
  'Sainte-Marie': { lat: 0.395, lng: 9.455 },
  Tahiti: { lat: 0.45, lng: 9.42 },
  // Nord (Akanda / côte) (v2.8).
  'Cité de la Démocratie': { lat: 0.485, lng: 9.45 },
  Avorbam: { lat: 0.5, lng: 9.46 },
  Barracuda: { lat: 0.565, lng: 9.375 },
  'Cap Caravane': { lat: 0.595, lng: 9.355 },
  // Axe N1 vers Ntoum (v2.8).
  PK6: { lat: 0.443, lng: 9.518 },
  PK9: { lat: 0.453, lng: 9.535 },
  PK11: { lat: 0.458, lng: 9.548 },
  Sibang: { lat: 0.435, lng: 9.52 },
  Montalier: { lat: 0.45, lng: 9.545 },
  Bambouchine: { lat: 0.468, lng: 9.575 },
  Bizango: { lat: 0.465, lng: 9.568 },
  Nkok: { lat: 0.49, lng: 9.61 },
  Nkoltang: { lat: 0.5, lng: 9.63 },
  // Sud / Owendo (v2.8).
  Nomba: { lat: 0.35, lng: 9.498 },
  Autre: { lat: 0.3901, lng: 9.4544 },
};

/** Niveau d'affichage du libellé de quartier sur la carte (v2.5, 3 tiers
 *  depuis la v2.8, resserrés en v2.14 — standard « arrivée Google
 *  Maps » : carte propre, lisible, aérée).
 *  Tier 1 (12) = grands quartiers, visibles dès le zoom 11 (vue par
 *  défaut = zoom 12) : Centre-ville, Glass, Nzeng-Ayong, Aéroport,
 *  Owendo, Akanda, Louis, Charbonnages, Lalala, Sotega, Ambowe,
 *  Angondjé — bien espacés, jamais deux libellés collés.
 *  Tier 2 (18) = quartiers moyens, visibles seulement à partir du
 *  zoom 13 (30 libellés au total) ; tier 3 (39) = quartiers petits ou
 *  éloignés, visibles seulement à partir du zoom 14 (69 libellés).
 *  'Autre' n'a pas de libellé (ce n'est pas un lieu). */
export const NEIGHBORHOOD_LABEL_TIER: Record<Neighborhood, 1 | 2 | 3> = {
  'Centre-ville': 1,
  Glass: 1,
  'Nzeng-Ayong': 1,
  Charbonnages: 1,
  Owendo: 1,
  Akanda: 1,
  'Aéroport Léon-Mba': 1,
  Likouala: 3,
  Louis: 1,
  Sablière: 3,
  Alibandeng: 3,
  Kinguele: 3,
  Nkembo: 2,
  Akébé: 2,
  'Plein Ciel': 2,
  'Batterie IV': 3,
  'Mont-Bouët': 2,
  Okala: 2,
  Damas: 3,
  Angondjé: 1,
  'Cap Esterias': 3,
  'Santa Clara': 3,
  Malibé: 3,
  Ondogo: 3,
  Acaé: 2,
  Mindoubé: 2,
  Lalala: 1,
  'La Peyrie': 2,
  Awendjé: 3,
  'Gros-Bouquet': 3,
  Oloumi: 2,
  'Belle-Vue': 3,
  'Plaine-Orety': 3,
  'Camp de Gaulle': 3,
  Ambowe: 1,
  PK5: 3,
  PK8: 3,
  PK12: 2,
  Melen: 2,
  Bikélé: 2,
  Essassa: 3,
  Ozangué: 2,
  Sotega: 1,
  'Diba-Diba': 3,
  Alenakiri: 3,
  Sogara: 3,
  Akournam: 3,
  Igoumié: 3,
  // Centre / côte (v2.8).
  'Petit Paris': 2,
  Cocotiers: 3,
  'Gué-Gué': 2,
  'Trois Quartiers': 3,
  Sorbonne: 3,
  'Venez-Voir': 3,
  'Sainte-Marie': 3,
  Tahiti: 3,
  // Nord (Akanda / côte) (v2.8).
  'Cité de la Démocratie': 2,
  Avorbam: 2,
  Barracuda: 3,
  'Cap Caravane': 3,
  // Axe N1 vers Ntoum (v2.8).
  PK6: 3,
  PK9: 3,
  PK11: 3,
  Sibang: 3,
  Montalier: 3,
  Bambouchine: 3,
  Bizango: 3,
  Nkok: 3,
  Nkoltang: 3,
  // Sud / Owendo (v2.8).
  Nomba: 2,
  Autre: 3,
};

/** Décalage d'affichage du libellé uniquement (pixels, jamais les
 *  coordonnées : tarifs et « Me localiser » ne bougent pas). Sert à
 *  décoller deux libellés voisins qui se touchent au zoom 12. */
export const NEIGHBORHOOD_LABEL_OFFSET: Partial<
  Record<Neighborhood, { x: number; y: number }>
> = {
  Likouala: { x: -20, y: 0 },
  Alibandeng: { x: 20, y: 0 },
  // v2.8 : libellés qui se toucheraient sinon au zoom 12-13.
  Cocotiers: { x: -75, y: -14 },
  'Gué-Gué': { x: -45, y: -16 },
  'Sainte-Marie': { x: -10, y: 14 },
  Bambouchine: { x: 0, y: -14 },
  // v2.14 : libellés voisins qui se toucheraient sinon.
  Lalala: { x: 48, y: 6 },
  'Aéroport Léon-Mba': { x: -40, y: 0 },
  Sotega: { x: -55, y: 30 },
  'Petit Paris': { x: 45, y: 25 },
  Nkembo: { x: 50, y: -12 },
  Avorbam: { x: -30, y: 0 },
  Bikélé: { x: 40, y: 0 },
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
  PK12: 'bitume',
  Melen: 'bitume',
  Bikélé: 'bitume',
  Essassa: 'difficile',
  Ozangué: 'bitume',
  Sotega: 'bitume',
  'Diba-Diba': 'bitume',
  Alenakiri: 'difficile',
  Sogara: 'difficile',
  Akournam: 'difficile',
  Igoumié: 'difficile',
  // Centre / côte (v2.8) : bitume.
  'Petit Paris': 'bitume',
  Cocotiers: 'bitume',
  'Gué-Gué': 'bitume',
  'Trois Quartiers': 'bitume',
  Sorbonne: 'bitume',
  'Venez-Voir': 'bitume',
  'Sainte-Marie': 'bitume',
  Tahiti: 'bitume',
  // Nord (Akanda / côte) (v2.8) : au-delà d'Angondjé, la route
  // bitumée s'arrête — même logique que Cap Esterias / Santa Clara /
  // Malibé (v2.6).
  'Cité de la Démocratie': 'bitume',
  Avorbam: 'bitume',
  Barracuda: 'difficile',
  'Cap Caravane': 'difficile',
  // Axe N1 (v2.8, corrigé) : la route bitumée va jusqu'à PK12
  // (rond-point PK12 / Melen) — tous les PK jusqu'à PK12 inclus
  // sont normaux. Au-delà de PK12 seulement, l'accès devient
  // difficile — même logique qu'Essassa (v2.6).
  PK6: 'bitume',
  PK9: 'bitume',
  PK11: 'bitume',
  Sibang: 'bitume',
  Montalier: 'bitume',
  Bambouchine: 'difficile',
  Bizango: 'difficile',
  Nkok: 'difficile',
  Nkoltang: 'difficile',
  // Sud / Owendo (v2.8) : bitume.
  Nomba: 'bitume',
  Autre: 'bitume',
};

/** Point de dépôt d'un quartier difficile : le quartier accessible
 *  (bitume) le plus proche, où la course s'arrête par défaut. Le
 *  point de dépôt est TOUJOURS un quartier 'bitume' — jamais un
 *  quartier difficile, sinon la course n'aboutirait nulle part. */
export const DROP_OFF_POINT: Partial<Record<Neighborhood, Neighborhood>> = {
  // Axe N1 : la route bitumée s'arrête à PK12 (rond-point PK12 /
  // Melen) — tous les PK jusqu'à PK12 inclus sont bitumés et
  // normaux. Les quartiers au-delà sont desservis par des pistes.
  Essassa: 'PK12',
  // Côte nord : la route bitumée s'arrête à Angondjé.
  'Cap Esterias': 'Angondjé',
  'Santa Clara': 'Angondjé',
  Malibé: 'Angondjé',
  // Ondogo : accès par Nzeng-Ayong (6e arrondissement, Libreville).
  Ondogo: 'Nzeng-Ayong',
  // Sud d'Owendo (zone portuaire / industrielle) : repli sur Owendo.
  Alenakiri: 'Owendo',
  Sogara: 'Owendo',
  Akournam: 'Owendo',
  Igoumié: 'Owendo',
  // Côte nord (v2.8) : la route bitumée s'arrête à Angondjé.
  Barracuda: 'Angondjé',
  'Cap Caravane': 'Angondjé',
  // Axe N1 (v2.8) : la route bitumée s'arrête à PK12.
  Bambouchine: 'PK12',
  Bizango: 'PK12',
  Nkok: 'PK12',
  Nkoltang: 'PK12',
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
