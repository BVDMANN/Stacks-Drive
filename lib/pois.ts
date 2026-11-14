/** Points d'intérêt réels de Libreville affichés sur la carte (v2.6).
 *
 *  CONVENTION DU PROJET : les coordonnées sont APPROXIMATIVES (centres
 *  de quartier / positions estimées sur la carte) — elles servent à
 *  placer les marqueurs, pas à guider au mètre près. La liste exacte
 *  est à faire valider par le propriétaire : noms, catégories et positions
 *  peuvent être corrigés, ajoutés ou retirés sans toucher au code
 *  (uniquement ce fichier).
 *
 *  Affichage : marqueurs discrets (pictogramme de catégorie + petit
 *  libellé), visibles à partir du zoom 13 pour ne pas surcharger la
 *  carte — même principe que les tiers des libellés de quartiers. */

import type { Neighborhood } from './neighborhoods';

export type PoiCategory =
  | 'supermarche'
  | 'marche'
  | 'station'
  | 'pharmacie'
  | 'hotel'
  | 'sante'
  | 'lieu'
  | 'aeroport'
  | 'port'
  | 'stade'
  | 'musee'
  | 'plage'
  | 'gare';

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  supermarche: 'Supermarché',
  marche: 'Marché',
  station: 'Station-service',
  pharmacie: 'Pharmacie',
  hotel: 'Hôtel',
  sante: 'Santé',
  lieu: 'Lieu public',
  aeroport: 'Aéroport',
  port: 'Port',
  stade: 'Stade',
  musee: 'Musée',
  plage: 'Plage',
  gare: 'Gare',
};

/** Couleur d'accent par catégorie (v2.7, tons assourdis « Nuit dorée »)
 *  — même valeurs que le CSS (.map-poi-marker.cat-*) : la mini-carte
 *  d'info du lieu utilise la même couleur que son pictogramme. */
export const POI_CATEGORY_COLORS: Record<PoiCategory, string> = {
  supermarche: '#ffc700',
  marche: '#34d399',
  station: '#fb923c',
  pharmacie: '#22d3ee',
  hotel: '#c084fc',
  sante: '#f87171',
  lieu: '#94a3b8',
  aeroport: '#38bdf8',
  port: '#2dd4bf',
  stade: '#fbbf24',
  musee: '#e879f9',
  plage: '#fde047',
  gare: '#a5b4fc',
};

export interface Poi {
  name: string;
  category: PoiCategory;
  /** Quartier le plus proche (affiché dans l'infobulle). */
  neighborhood: Neighborhood;
  lat: number;
  lng: number;
}

export const POIS: Poi[] = [
  // --- Supermarchés ---
  { name: 'Mbolo', category: 'supermarche', neighborhood: 'Centre-ville', lat: 0.3965, lng: 9.438 },
  { name: 'Géant Casino', category: 'supermarche', neighborhood: 'Akanda', lat: 0.462, lng: 9.483 },
  { name: 'Prix Import', category: 'supermarche', neighborhood: 'Nzeng-Ayong', lat: 0.431, lng: 9.471 },
  { name: 'CK2', category: 'supermarche', neighborhood: 'Mont-Bouët', lat: 0.397, lng: 9.466 },
  { name: 'Casino Supermarché', category: 'supermarche', neighborhood: 'Centre-ville', lat: 0.3905, lng: 9.452 },
  { name: 'Cecado', category: 'supermarche', neighborhood: 'Glass', lat: 0.404, lng: 9.441 },

  // --- Marchés ---
  { name: 'Marché Mont-Bouët', category: 'marche', neighborhood: 'Mont-Bouët', lat: 0.396, lng: 9.468 },
  { name: 'Marché de Nzeng-Ayong', category: 'marche', neighborhood: 'Nzeng-Ayong', lat: 0.429, lng: 9.47 },
  { name: 'Marché de Louis', category: 'marche', neighborhood: 'Louis', lat: 0.41, lng: 9.45 },
  { name: 'Marché d’Owendo', category: 'marche', neighborhood: 'Owendo', lat: 0.341, lng: 9.498 },
  { name: 'Marché de Nkembo', category: 'marche', neighborhood: 'Nkembo', lat: 0.441, lng: 9.452 },
  { name: 'Marché d’Akébé', category: 'marche', neighborhood: 'Akébé', lat: 0.406, lng: 9.461 },

  // --- Stations-service ---
  { name: 'TotalEnergies Centre-ville', category: 'station', neighborhood: 'Centre-ville', lat: 0.389, lng: 9.456 },
  { name: 'TotalEnergies Glass', category: 'station', neighborhood: 'Glass', lat: 0.403, lng: 9.443 },
  { name: 'OLA Nzeng-Ayong', category: 'station', neighborhood: 'Nzeng-Ayong', lat: 0.428, lng: 9.468 },
  { name: 'TotalEnergies Aéroport', category: 'station', neighborhood: 'Aéroport Léon-Mba', lat: 0.456, lng: 9.414 },
  { name: 'TotalEnergies Owendo', category: 'station', neighborhood: 'Owendo', lat: 0.338, lng: 9.502 },
  { name: 'TotalEnergies Akanda', category: 'station', neighborhood: 'Akanda', lat: 0.452, lng: 9.488 },

  // --- Pharmacies ---
  { name: 'Pharmacie du Centre', category: 'pharmacie', neighborhood: 'Centre-ville', lat: 0.391, lng: 9.453 },
  { name: 'Pharmacie de Glass', category: 'pharmacie', neighborhood: 'Glass', lat: 0.402, lng: 9.444 },
  { name: 'Pharmacie Mont-Bouët', category: 'pharmacie', neighborhood: 'Mont-Bouët', lat: 0.397, lng: 9.467 },
  { name: 'Pharmacie de Nzeng-Ayong', category: 'pharmacie', neighborhood: 'Nzeng-Ayong', lat: 0.429, lng: 9.472 },
  { name: 'Pharmacie d’Owendo', category: 'pharmacie', neighborhood: 'Owendo', lat: 0.34, lng: 9.499 },
  { name: 'Pharmacie de Louis', category: 'pharmacie', neighborhood: 'Louis', lat: 0.409, lng: 9.451 },

  // --- Hôtels ---
  { name: 'Radisson Blu Okoumé Palace', category: 'hotel', neighborhood: 'Centre-ville', lat: 0.398, lng: 9.436 },
  { name: 'Le Méridien Re-Ndama', category: 'hotel', neighborhood: 'Centre-ville', lat: 0.393, lng: 9.45 },
  { name: 'Hôtel Tropicana', category: 'hotel', neighborhood: 'Centre-ville', lat: 0.388, lng: 9.453 },

  // --- Santé ---
  { name: 'CHU de Libreville', category: 'sante', neighborhood: 'Nzeng-Ayong', lat: 0.44, lng: 9.47 },
  { name: 'Hôpital des Armées Omar Bongo', category: 'sante', neighborhood: 'Camp de Gaulle', lat: 0.445, lng: 9.43 },
  { name: 'CHU Mère-Enfant Jeanne Ebori', category: 'sante', neighborhood: 'Owendo', lat: 0.345, lng: 9.5 },

  // --- Lieux publics ---
  { name: 'Stade de l’Amitié', category: 'stade', neighborhood: 'Angondjé', lat: 0.518, lng: 9.447 },
  { name: 'Université Omar Bongo', category: 'lieu', neighborhood: 'Lalala', lat: 0.425, lng: 9.465 },
  { name: 'Cathédrale Sainte-Marie', category: 'lieu', neighborhood: 'Centre-ville', lat: 0.392, lng: 9.451 },
  { name: 'Gare d’Owendo', category: 'gare', neighborhood: 'Owendo', lat: 0.33, lng: 9.505 },
  { name: 'Aéroport international Léon-Mba', category: 'aeroport', neighborhood: 'Aéroport Léon-Mba', lat: 0.458, lng: 9.412 },
  { name: 'Port d’Owendo', category: 'port', neighborhood: 'Owendo', lat: 0.335, lng: 9.505 },
  { name: 'Port de Libreville', category: 'port', neighborhood: 'Petit Paris', lat: 0.386, lng: 9.447 },
  { name: 'Stade Omar Bongo', category: 'stade', neighborhood: 'Centre-ville', lat: 0.397, lng: 9.452 },
  { name: 'Musée National du Gabon', category: 'musee', neighborhood: 'Centre-ville', lat: 0.392, lng: 9.45 },
  { name: 'Plage de la Sablière', category: 'plage', neighborhood: 'Sablière', lat: 0.474, lng: 9.402 },
  { name: 'Plage d’Angondjé', category: 'plage', neighborhood: 'Angondjé', lat: 0.517, lng: 9.44 },
  { name: 'Gare Routière', category: 'gare', neighborhood: 'Petit Paris', lat: 0.385, lng: 9.451 },
  { name: 'Jardin Botanique', category: 'lieu', neighborhood: 'Centre-ville', lat: 0.394, lng: 9.446 },
];

/** Points de prise en charge principaux (v2.22) : les lieux où on
 *  vient le plus souvent chercher un passager — aéroport, marchés,
 *  stades, gares et lieux connus. Liste de noms, éditée ici sans
 *  toucher au code : un nom doit correspondre à un lieu de POIS
 *  (comparaison normalisée — accents, casse et apostrophes ignorés —
 *  pour ne pas casser si un nom est recorrigé) ; un nom introuvable
 *  est simplement ignoré, la liste ne plante jamais l'appli.
 *  L'estimation affichée pour chaque point est INDICATIVE uniquement
 *  (même modèle au km que l'estimation de course, lib/pricing.ts) :
 *  la plateforme ne définit aucun prix fixe, le prix final se
 *  négocie entre le passager et le chauffeur. Un vrai prix fixe par
 *  zone serait une décision de modèle tarifaire à trancher avec le
 *  propriétaire — pas implémenté ici. Déclaré APRÈS POIS (le bloc
 *  lit POIS : le déclarer avant planterait l'appli au chargement). */
export const PICKUP_POINT_NAMES = [
  'Aéroport international Léon-Mba',
  'Marché Mont-Bouët',
  'Marché de Nzeng-Ayong',
  'Stade de l’Amitié',
  'Stade Omar Bongo',
  'Gare d’Owendo',
  'Gare Routière',
  'Université Omar Bongo',
  'CHU de Libreville',
  'Radisson Blu Okoumé Palace',
] as const;

function normalizePoiName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export const PICKUP_POINTS: Poi[] = PICKUP_POINT_NAMES.flatMap((name) => {
  const poi = POIS.find((p) => normalizePoiName(p.name) === normalizePoiName(name));
  return poi ? [poi] : [];
});
