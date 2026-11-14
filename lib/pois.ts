/** Points d'intérêt réels de Libreville affichés sur la carte (v2.6).
 *
 *  CONVENTION DU PROJET : les coordonnées sont APPROXIMATIVES (centres
 *  de quartier / positions estimées sur la carte) — elles servent à
 *  placer les marqueurs, pas à guider au mètre près. La liste exacte
 *  est à faire valider par Randy : noms, catégories et positions
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
  | 'lieu';

export const POI_CATEGORY_LABELS: Record<PoiCategory, string> = {
  supermarche: 'Supermarché',
  marche: 'Marché',
  station: 'Station-service',
  pharmacie: 'Pharmacie',
  hotel: 'Hôtel',
  sante: 'Santé',
  lieu: 'Lieu public',
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

  // --- Marchés ---
  { name: 'Marché Mont-Bouët', category: 'marche', neighborhood: 'Mont-Bouët', lat: 0.396, lng: 9.468 },
  { name: 'Marché de Nzeng-Ayong', category: 'marche', neighborhood: 'Nzeng-Ayong', lat: 0.429, lng: 9.47 },
  { name: 'Marché de Louis', category: 'marche', neighborhood: 'Louis', lat: 0.41, lng: 9.45 },
  { name: 'Marché d’Owendo', category: 'marche', neighborhood: 'Owendo', lat: 0.341, lng: 9.498 },

  // --- Stations-service ---
  { name: 'TotalEnergies Centre-ville', category: 'station', neighborhood: 'Centre-ville', lat: 0.389, lng: 9.456 },
  { name: 'TotalEnergies Glass', category: 'station', neighborhood: 'Glass', lat: 0.403, lng: 9.443 },
  { name: 'OLA Nzeng-Ayong', category: 'station', neighborhood: 'Nzeng-Ayong', lat: 0.428, lng: 9.468 },
  { name: 'TotalEnergies Aéroport', category: 'station', neighborhood: 'Aéroport Léon-Mba', lat: 0.456, lng: 9.414 },

  // --- Pharmacies ---
  { name: 'Pharmacie du Centre', category: 'pharmacie', neighborhood: 'Centre-ville', lat: 0.391, lng: 9.453 },
  { name: 'Pharmacie de Glass', category: 'pharmacie', neighborhood: 'Glass', lat: 0.402, lng: 9.444 },
  { name: 'Pharmacie Mont-Bouët', category: 'pharmacie', neighborhood: 'Mont-Bouët', lat: 0.397, lng: 9.467 },

  // --- Hôtels ---
  { name: 'Radisson Blu Okoumé Palace', category: 'hotel', neighborhood: 'Centre-ville', lat: 0.398, lng: 9.436 },

  // --- Santé ---
  { name: 'CHU de Libreville', category: 'sante', neighborhood: 'Nzeng-Ayong', lat: 0.44, lng: 9.47 },
  { name: 'Hôpital des Armées Omar Bongo', category: 'sante', neighborhood: 'Camp de Gaulle', lat: 0.445, lng: 9.43 },
  { name: 'CHU Mère-Enfant Jeanne Ebori', category: 'sante', neighborhood: 'Owendo', lat: 0.345, lng: 9.5 },

  // --- Lieux publics ---
  { name: 'Stade de l’Amitié', category: 'lieu', neighborhood: 'Angondjé', lat: 0.518, lng: 9.447 },
  { name: 'Université Omar Bongo', category: 'lieu', neighborhood: 'Lalala', lat: 0.425, lng: 9.465 },
  { name: 'Cathédrale Sainte-Marie', category: 'lieu', neighborhood: 'Centre-ville', lat: 0.392, lng: 9.451 },
  { name: 'Gare d’Owendo', category: 'lieu', neighborhood: 'Owendo', lat: 0.33, lng: 9.505 },
];
