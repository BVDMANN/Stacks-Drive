/** Points d'intérêt réels de Libreville affichés sur la carte (v2.6).
 *
 *  CONVENTION DU PROJET : les coordonnées sont APPROXIMATIVES (centres
 *  de quartier / positions estimées sur la carte) — elles servent à
 *  placer les marqueurs, pas à guider au mètre près. La liste exacte
 *  est à faire valider par le propriétaire : noms, catégories et positions
 *  peuvent être corrigés, ajoutés ou retirés sans toucher au code
 *  (uniquement ce fichier).
 *
 *  RÈGLE v2.43 — AUCUN LIEU INVENTÉ : chaque lieu ajouté ici a été
 *  vérifié par au moins une source (recherche de lieux : nom exact +
 *  coordonnées, ou OpenStreetMap / Nominatim). Un lieu dont le nom ou
 *  les coordonnées n'ont pas pu être confirmés n'est PAS ajouté (voir
 *  l'ADR 0018 pour la liste des lieux écartés comme incertains).
 *
 *  Affichage : marqueurs discrets (pictogramme de catégorie + petit
 *  libellé), visibles à partir du zoom 14 pour ne pas surcharger la
 *  carte — même principe que les tiers des libellés de quartiers.
 *  Bars et restaurants : un cran plus tard (pictogramme dès le zoom 15,
 *  libellé dès le zoom 16) — ce sont les catégories les plus denses
 *  (ex. 4 restaurants dans le seul quartier Louis, à ~170 m les uns
 *  des autres) : à 14 leurs pictogrammes se toucheraient, à 15 leurs
 *  libellés se chevaucheraient (voir `POI_DENSE_CATEGORIES`).
 *
 *  RÈGLE v2.42 APPLIQUÉE AUX LIEUX (v2.43, recalibrée en v2.46 pour
 *  CARTO dark_all) : quand le fond Plan imprime déjà le nom d'un
 *  lieu sur ses tuiles, le libellé Drive ne doit pas se poser
 *  par-dessus — `cartoLabelMinZoom` = premier zoom où CARTO affiche
 *  le nom. En Plan, le libellé Drive est masqué à partir de ce zoom
 *  (le nom reste visible une fois, via la tuile) ; en Satellite
 *  (tuiles Esri sans aucun libellé), il s'affiche toujours. Sans ce
 *  champ, le libellé Drive s'affiche à tous les zooms de son tier.
 *  RÈGLE CARTO (style dark matter, `labels.mss`, section « poi
 *  labels ») : seuls les parcs, stades (rang ≤ 3), cimetières
 *  (rang ≤ 3) et attractions (rang ≤ 3) sont labellisés — à partir
 *  de z15 (rang ≤ 1), z16 (rang ≤ 2), z17 (rang ≤ 3), z18. Les
 *  hôtels, écoles, ronds-points et autres lieux ne sont JAMAIS
 *  labellisés par CARTO : leur `osmLabelMinZoom` v2.43 (mesuré sur
 *  tuiles OSM) est retiré en v2.46 — le libellé Drive est le seul
 *  nom. Seul le Palais des Sports (stade, plus grande salle de la
 *  ville, rang ≤ 2 plausible) garde un champ (16) — approximation,
 *  à confirmer en live après push (voir ADR 0021). */

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
  | 'gare'
  | 'bar'
  | 'restaurant';

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
  bar: 'Bar',
  restaurant: 'Restaurant',
};

/** Couleur d'accent par catégorie (v2.7, « Nuit violette »)
 *  — même valeurs que le CSS (.map-poi-marker.cat-*) : la mini-carte
 *  d'info du lieu utilise la même couleur que son pictogramme. */
export const POI_CATEGORY_COLORS: Record<PoiCategory, string> = {
  supermarche: '#FF4D8D',
  marche: '#34d399',
  station: '#F5A623',
  pharmacie: '#2FD6C8',
  hotel: '#c084fc',
  sante: '#f87171',
  lieu: '#94a3b8',
  aeroport: '#38bdf8',
  port: '#2FD6C8',
  stade: '#fbbf24',
  musee: '#e879f9',
  plage: '#fde047',
  gare: '#a5b4fc',
  bar: '#FF7EB0',
  restaurant: '#FF5F6D',
};

export interface Poi {
  name: string;
  category: PoiCategory;
  /** Quartier le plus proche (affiché dans l'infobulle). */
  neighborhood: Neighborhood;
  lat: number;
  lng: number;
  /** Premier zoom où CARTO dark_all imprime déjà ce nom sur la tuile
   *  (Plan) — approximation dérivée du style CARTO (v2.46, voir
   *  l'en-tête du fichier). En Plan, le libellé Drive est masqué à
   *  partir de ce zoom (le nom reste visible une fois, via la tuile) ;
   *  en Satellite, il s'affiche toujours. Absent = CARTO ne labellise
   *  jamais ce lieu : le libellé Drive s'affiche à tous les zooms de
   *  son tier. */
  cartoLabelMinZoom?: number;
}

/** Catégories denses (v2.43) : pictogramme un zoom plus tard (15 au
 *  lieu de 14), libellé un zoom plus tard (16 au lieu de 15) — sinon
 *  leurs marqueurs se touchent dans les quartiers denses (Louis,
 *  Corniche). Les autres catégories gardent les seuils v2.6/v2.14. */
export const POI_DENSE_CATEGORIES: PoiCategory[] = ['bar', 'restaurant'];

/** Zoom minimum du pictogramme d'un lieu (14 par défaut, 15 pour les
 *  catégories denses). */
export function poiIconMinZoom(category: PoiCategory): number {
  return POI_DENSE_CATEGORIES.includes(category) ? 15 : 14;
}

/** Zoom minimum du libellé d'un lieu (15 par défaut, 16 pour les
 *  catégories denses). */
export function poiLabelMinZoom(category: PoiCategory): number {
  return POI_DENSE_CATEGORIES.includes(category) ? 16 : 15;
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
  // v2.43 — 7 boulevard de Nice, vérifié (recherche de lieux :
  // place_id 770676590930235). OSM imprimait « Park Inn » dès le
  // zoom 17 (tuile z17 vérifiée en v2.43) — mais CARTO ne labellise
  // pas les hôtels (style dark matter : seuls parcs, stades,
  // cimetières et attractions sont labellisés) : pas de
  // `cartoLabelMinZoom` en v2.46 — le libellé Drive est le seul nom.
  { name: 'Park Inn by Radisson', category: 'hotel', neighborhood: 'Trois Quartiers', lat: 0.430673, lng: 9.419899 },

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

  // --- Restaurants (v2.43) ---
  // Grands restaurants de Libreville, noms exacts + coordonnées
  // vérifiés par recherche de lieux (place_id) ou OpenStreetMap /
  // Nominatim (voir ADR 0018). OSM n'imprime le nom d'aucun d'eux
  // (tuiles z16 et z17 vérifiées en v2.43) — et CARTO ne labellise
  // pas les restaurants : pas de `cartoLabelMinZoom`. Catégorie
  // dense : pictogramme dès z15, libellé dès z16.
  { name: 'Roma Restaurant & Hotel', category: 'restaurant', neighborhood: 'Louis', lat: 0.410493, lng: 9.430753 },
  { name: 'Bantu Restaurant', category: 'restaurant', neighborhood: 'Oloumi', lat: 0.372511, lng: 9.458357 },
  { name: 'Le Wap', category: 'restaurant', neighborhood: 'Louis', lat: 0.411522, lng: 9.431872 },
  { name: 'Restaurant Okande', category: 'restaurant', neighborhood: 'Nzeng-Ayong', lat: 0.417963, lng: 9.481749 },
  { name: 'Amaya Restaurant', category: 'restaurant', neighborhood: 'Trois Quartiers', lat: 0.429857, lng: 9.420594 },
  { name: 'D’Ici et D’Ailleurs', category: 'restaurant', neighborhood: 'Sainte-Marie', lat: 0.406502, lng: 9.434356 },
  { name: 'L’Emir', category: 'restaurant', neighborhood: 'Centre-ville', lat: 0.388682, lng: 9.444006 },
  { name: 'Le Phare Du Large', category: 'restaurant', neighborhood: 'Batterie IV', lat: 0.416978, lng: 9.424851 },
  { name: 'L’Odika', category: 'restaurant', neighborhood: 'Louis', lat: 0.4127657, lng: 9.4328021 },

  // --- Bars (v2.43) ---
  // Bars / lounges connus, vérifiés comme les restaurants (voir
  // ADR 0018). OSM n'imprime ni « Yoka Lounge » ni « Luxury Lounge »
  // (tuiles z16 et z17 vérifiées). Catégorie dense (z15 / z16).
  { name: 'Yoka Lounge', category: 'bar', neighborhood: 'Tahiti', lat: 0.439917, lng: 9.41778 },
  { name: 'Luxury Lounge', category: 'bar', neighborhood: 'Charbonnages', lat: 0.4383996, lng: 9.4406665 },

  // --- Grands lieux (v2.43) ---
  // Repères de Libreville, vérifiés (recherche de lieux, Wikipédia,
  // Nominatim — voir ADR 0018). En v2.43, OSM imprimait déjà leur nom
  // (vérifié tuile par tuile : z15, z16, z17) et le libellé Drive
  // était masqué en Plan à partir du zoom indiqué. En v2.46, CARTO
  // ne labellise que les stades (parmi ces quatre lieux) : seul le
  // Palais des Sports garde un champ (16, approximation — rang ≤ 2
  // plausible pour la plus grande salle de la ville, à confirmer en
  // live) ; les trois autres n'ont plus de champ — le libellé Drive
  // est le seul nom, en Plan comme en Satellite.
  { name: 'Palais des Sports', category: 'stade', neighborhood: 'Petit Paris', lat: 0.3948925, lng: 9.4530049, cartoLabelMinZoom: 16 },
  { name: 'Rond-Point de la Démocratie', category: 'lieu', neighborhood: 'Sotega', lat: 0.4249165, lng: 9.4553274 },
  { name: 'Institut Français du Gabon', category: 'lieu', neighborhood: 'Sainte-Marie', lat: 0.4074526, lng: 9.4387226 },
  { name: 'Lycée National Léon Mba', category: 'lieu', neighborhood: 'Trois Quartiers', lat: 0.4279831, lng: 9.422459 },
];


