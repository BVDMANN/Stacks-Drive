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
// Coordonnées vérifiées (v2.14, puis correctif libellés 14/11 — v2.16) :
// croisement de 3 géocodeurs (Nominatim/OSM, ArcGIS/Esri, Photon),
// de la géométrie routière OSRM (axe N1 vers Ntoum : les PK sont des
// points kilométriques sur la N1, PK0 ~2 km à l'ouest de Centre-ville)
// et de sources encyclopédiques (Wikipédia : Bikélé, Ntoum, Stade
// d'Angondjé). Règle : une coordonnée n'est retenue que si au moins
// deux sources s'accordent (ou une source + la géométrie routière) ;
// les positions incertaines restent sur leur repère connu le plus
// proche et sont listées dans docs/etat-des-lieux-lancement.md :
// ne pas les déplacer sans source. EXCEPTION — ANCRE TARIFAIRE :
// Centre-ville et Nzeng-Ayong sont FIGÉS : les géocodeurs placent
// leurs centres ~1,1 km plus à l'ouest et ~1,3 km plus à l'est
// (distance réelle ~5,9 km au lieu de 4,76 km), appliquer ces deux
// corrections casserait l'ancre Centre-ville → Nzeng-Ayong
// (Solo 1 500 / Groupe 950) ; à trancher avec le propriétaire (recalibrage
// du modèle au km) avant tout déplacement de ces deux points.
export const NEIGHBORHOOD_COORDS: Record<Neighborhood, { lat: number; lng: number }> = {
  'Centre-ville': { lat: 0.3901, lng: 9.4544 },
  Glass: { lat: 0.376, lng: 9.454 },
  'Nzeng-Ayong': { lat: 0.43, lng: 9.47 },
  Charbonnages: { lat: 0.436, lng: 9.446 },
  Owendo: { lat: 0.34, lng: 9.5 },
  Akanda: { lat: 0.5, lng: 9.47 },
  'Aéroport Léon-Mba': { lat: 0.458, lng: 9.412 },
  Likouala: { lat: 0.39, lng: 9.457 },
  Louis: { lat: 0.414, lng: 9.432 },
  Sablière: { lat: 0.485, lng: 9.392 },
  Alibandeng: { lat: 0.456, lng: 9.428 },
  Kinguele: { lat: 0.401, lng: 9.471 },
  Nkembo: { lat: 0.41, lng: 9.455 },
  Akébé: { lat: 0.398, lng: 9.463 },
  'Plein Ciel': { lat: 0.397, lng: 9.476 },
  'Batterie IV': { lat: 0.419, lng: 9.428 },
  'Mont-Bouët': { lat: 0.401, lng: 9.445 },
  Okala: { lat: 0.488, lng: 9.408 },
  Damas: { lat: 0.385, lng: 9.478 },
  // Nord (Akanda / côte).
  Angondjé: { lat: 0.529, lng: 9.414 },
  'Cap Esterias': { lat: 0.611, lng: 9.322 },
  'Santa Clara': { lat: 0.548, lng: 9.373 },
  Malibé: { lat: 0.555, lng: 9.385 },
  Ondogo: { lat: 0.446, lng: 9.466 },
  // Est / nord-est.
  Acaé: { lat: 0.347, lng: 9.474 },
  Mindoubé: { lat: 0.379, lng: 9.498 },
  Lalala: { lat: 0.366, lng: 9.47 },
  'La Peyrie': { lat: 0.4, lng: 9.455 },
  Awendjé: { lat: 0.389, lng: 9.473 },
  'Gros-Bouquet': { lat: 0.421, lng: 9.43 },
  Oloumi: { lat: 0.371, lng: 9.458 },
  'Belle-Vue': { lat: 0.397, lng: 9.469 },
  'Plaine-Orety': { lat: 0.415, lng: 9.438 },
  'Camp de Gaulle': { lat: 0.445, lng: 9.43 },
  Ambowe: { lat: 0.444, lng: 9.437 },
  // Axe N1 vers Ntoum (v2.16) : la N1 file vers l'EST à lat ~0,40
  // (pas vers le nord-est) — les PK sont sur la route, PK0 ~2 km à
  // l'ouest de Centre-ville (PK5 ≈ 3 km de route, PK12 ≈ 10 km).
  PK5: { lat: 0.406, lng: 9.466 },
  PK8: { lat: 0.409, lng: 9.49 },
  PK12: { lat: 0.403, lng: 9.522 },
  Melen: { lat: 0.401, lng: 9.516 },
  Bikélé: { lat: 0.4, lng: 9.567 },
  Essassa: { lat: 0.396, lng: 9.61 },
  // Sud / Owendo.
  Ozangué: { lat: 0.378, lng: 9.481 },
  Sotega: { lat: 0.42, lng: 9.457 },
  'Diba-Diba': { lat: 0.442, lng: 9.452 },
  Alenakiri: { lat: 0.304, lng: 9.511 },
  Sogara: { lat: 0.345, lng: 9.515 },
  Akournam: { lat: 0.347, lng: 9.506 },
  Igoumié: { lat: 0.363, lng: 9.521 },
  // Centre / côte (v2.8).
  'Petit Paris': { lat: 0.397, lng: 9.449 },
  Cocotiers: { lat: 0.415, lng: 9.451 },
  'Gué-Gué': { lat: 0.426, lng: 9.43 },
  'Trois Quartiers': { lat: 0.424, lng: 9.427 },
  Sorbonne: { lat: 0.403, lng: 9.454 },
  'Venez-Voir': { lat: 0.403, lng: 9.462 },
  'Sainte-Marie': { lat: 0.406, lng: 9.439 },
  Tahiti: { lat: 0.449, lng: 9.412 },
  // Nord (Akanda / côte) (v2.8).
  'Cité de la Démocratie': { lat: 0.436, lng: 9.459 },
  Avorbam: { lat: 0.503, lng: 9.392 },
  Barracuda: { lat: 0.565, lng: 9.375 },
  'Cap Caravane': { lat: 0.595, lng: 9.355 },
  // Axe N1 vers Ntoum (v2.8).
  PK6: { lat: 0.407, lng: 9.473 },
  PK9: { lat: 0.41, lng: 9.498 },
  PK11: { lat: 0.402, lng: 9.513 },
  Sibang: { lat: 0.415, lng: 9.495 },
  Montalier: { lat: 0.433, lng: 9.505 },
  Bambouchine: { lat: 0.441, lng: 9.523 },
  Bizango: { lat: 0.465, lng: 9.568 },
  Nkok: { lat: 0.389, lng: 9.623 },
  Nkoltang: { lat: 0.364, lng: 9.674 },
  // Sud / Owendo (v2.8).
  Nomba: { lat: 0.341, lng: 9.478 },
  Autre: { lat: 0.3901, lng: 9.4544 },
};

/** Niveau d'affichage du libellé de quartier sur la carte (v2.5, 3 tiers
 *  depuis la v2.8, resserrés en v2.14, redensifiés en v2.16 — standard
 *  « arrivée Google Maps » : carte propre, lisible, aérée).
 *  Tier 1 (12) = grands quartiers, visibles dès le zoom 11 (vue ville
 *  = zoom 12) : Centre-ville, Glass, Nzeng-Ayong, Aéroport,
 *  Owendo, Akanda, Louis, Charbonnages, Lalala, Sotega, Ambowe,
 *  Angondjé — bien espacés, jamais deux libellés collés.
 *  Tier 2 (15) = quartiers moyens, visibles seulement à partir du
 *  zoom 13 (27 libellés au total) ; tier 3 (44 entrées, dont Autre
 *  sans libellé et Likouala masqué → 42 visibles) = quartiers petits
 *  ou éloignés, visibles seulement à partir du zoom 14 (69 libellés
 *  au total). La vue d'ouverture est le zoom 14 (v2.31) : les 69
 *  libellés sont visibles dès l'arrivée — les tiers ne changent pas,
 *  c'est le zoom d'ouverture qui a changé (avant : zoom 12).
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
  'La Peyrie': 3,
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
  Melen: 3,
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
  'Cité de la Démocratie': 3,
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

/** Quartiers SANS libellé sur la carte (v2.16) — leurs coordonnées
 *  restent utilisées partout ailleurs (tarifs, listes, « Me
 *  localiser ») : seul le libellé est masqué, parce qu'il se
 *  superposerait à celui d'un voisin même au zoom 14.
 *  Likouala : son centre vérifié (0,390 / 9,457) est à 0,3 km du
 *  point d'ancrage tarifaire de Centre-ville (0,3901 / 9,4544,
 *  figé — voir NEIGHBORHOOD_COORDS) : les deux libellés se
 *  recouvrent. Si l'ancre Centre-ville est un jour déplacée vers
 *  son vrai centre (0,391 / 9,444), Likouala pourra réapparaître. */
export const NEIGHBORHOOD_NO_LABEL: ReadonlySet<Neighborhood> = new Set([
  'Likouala',
]);

/** Décalage d'affichage du libellé uniquement (pixels, jamais les
 *  coordonnées : tarifs et « Me localiser » ne bougent pas).
 *  RÈGLE (correctif libellés 14/11 — v2.16) : le libellé reste COLLÉ
 *  à son point — AUCUN décalage. Les décalages des v2.8/v2.14 (jusqu'à
 *  75 px : Cocotiers, Lalala, Sotega…) déplaçaient les libellés loin
 *  de leur quartier, d'où l'effet « placé au pif » signalé par le propriétaire.
 *  Si deux libellés se touchent, on réduit la densité (tier du
 *  libellé, voir NEIGHBORHOOD_LABEL_TIER) au lieu de déplacer les
 *  libellés. Cet objet est conservé vide pour ne pas casser les
 *  imports ; ne pas y remettre de décalage sans re-vérification
 *  visuelle à tous les zooms. */
export const NEIGHBORHOOD_LABEL_OFFSET: Partial<
  Record<Neighborhood, { x: number; y: number }>
> = {};

/** Accès routier des quartiers (v2.6) — PROPOSITION À FAIRE VALIDER
 *  PAR LE PROPRIÉTAIRE : la liste des quartiers difficiles est un point de
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
  // Axe N1 (v2.16, géométrie corrigée) : la N1 bitumée file vers
  // l'est jusqu'à Ntoum — Bikélé (sur la N1, 16 km de route) est le
  // quartier bitumé le plus proche d'Essassa, Nkok et Nkoltang, pas
  // PK12 (qui était le plus proche avec les anciennes coordonnées,
  // 5-11 km trop au nord). Les quartiers au-delà de la N1 restent
  // desservis par des pistes.
  Essassa: 'Bikélé',
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
  // Axe N1 (v2.8, corrigé v2.16) : point de dépôt = Bikélé.
  Bambouchine: 'PK12',
  Bizango: 'PK12',
  Nkok: 'Bikélé',
  Nkoltang: 'Bikélé',
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

/** Tri alphabétique d'affichage (v2.22) : copie triée de NEIGHBORHOODS
 *  — le tableau source n'est PAS réordonné (son ordre ne sert à rien
 *  d'autre que l'affichage : les tiers de libellés sont dans
 *  NEIGHBORHOOD_LABEL_TIER, clé par nom, et les validations zod
 *  acceptent l'enum dans n'importe quel ordre). Tri français
 *  (sensibilité de base : « Akébé » se trie comme « Akebe », entre
 *  « Acaé » et « Akanda »). */
export const NEIGHBORHOODS_SORTED: readonly Neighborhood[] = [...NEIGHBORHOODS].sort((a, b) =>
  a.localeCompare(b, 'fr', { sensitivity: 'base' })
);

/** Quartiers sélectionnables, triés par ordre alphabétique (v2.22) :
 *  'Autre' n'est pas un lieu — il n'apparaît dans aucune liste de
 *  départ / destination / zone. À utiliser partout où on affiche une
 *  liste de quartiers (accueil, accueil chauffeur, tableau de bord,
 *  profil). */
export const SELECTABLE_NEIGHBORHOODS: readonly Neighborhood[] =
  NEIGHBORHOODS_SORTED.filter((n) => n !== 'Autre');

/** Normalisation de recherche (v2.22) : minuscules, sans accents, sans
 *  séparateurs — « Nzeng Ayong », « nzeng-ayong » et « nzengayong »
 *  trouvent tous « Nzeng-Ayong » ; « aeroport » trouve
 *  « Aéroport Léon-Mba », « mont bouet » trouve « Mont-Bouët ». */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Le quartier correspond-il à la recherche tapée ? (v2.22) — recherche
 *  par sous-chaîne sur le nom normalisé, insensible aux accents, à la
 *  casse et aux séparateurs. Requête vide = tout correspond. */
export function matchesNeighborhoodQuery(name: Neighborhood, query: string): boolean {
  const q = normalizeSearchText(query);
  if (q === '') return true;
  return normalizeSearchText(name).includes(q);
}

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
