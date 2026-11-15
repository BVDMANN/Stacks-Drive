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
 *  'Autre' n'a pas de libellé (ce n'est pas un lieu).
 *  v2.42 : ces chiffres sont ceux du fond Satellite (et du fond Plan
 *  à partir du zoom 17) — en Plan, aux zooms 12 à 16, le fond
 *  CARTO dark_all affiche déjà la plupart des noms, donc le libellé
 *  Drive des quartiers listés dans NEIGHBORHOOD_CARTO_LABEL_MIN_ZOOM
 *  est masqué sur la plage où CARTO le montre (Plan : 6 libellés
 *  Drive au zoom 12, 11 au zoom 13, 17 au zoom 14, 14 aux zooms
 *  15-16 — chaque nom n'apparaît qu'une seule fois à l'écran).
 *  v2.46 : PK5 n'est plus masqué (`place=quarter`, CARTO ne
 *  labellise pas les `quarter`) — d'où 17 libellés Drive au zoom
 *  14 en Plan au lieu de 16 ; Akanda réapparaît dès le zoom 15
 *  (borne haute 14, règle `city`). */
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

/** Zoom minimum à partir duquel le fond Plan affiche DÉJÀ le nom de
 *  ce quartier (v2.42, recalibré en v2.46 pour CARTO dark_all) — le
 *  libellé Drive est alors masqué en Plan tant que z <= borne haute
 *  (16 par défaut, voir `NEIGHBORHOOD_CARTO_LABEL_MAX_ZOOM`), sinon
 *  le nom apparaît deux fois à l'écran (une fois sur la tuile, une
 *  fois par-dessus, à une position légèrement différente : le rendu
 *  place le nom au centre de la zone, les coordonnées Drive sont des
 *  centres vérifiés). Règle appliquée dans
 *  `components/map/LibrevilleMap.tsx` (`updateLabels`) : libellé
 *  Drive visible si z < min, ou z > borne haute, ou fond Satellite
 *  (les tuiles Esri World Imagery ne portent aucun libellé — les 69
 *  libellés Drive restent affichés comme avant).
 *  Un quartier ABSENT de cette table n'est jamais masqué : le fond
 *  ne labellise pas son nom (vérifié : aucun objet `place` du même
 *  nom dans les données OSM, et aucun libellé vu sur les tuiles) —
 *  son libellé Drive est le seul à l'écran à tous les zooms.
 *  MÉTHODE v2.42 (origine des zooms minimums, 14/11/2026) : vraies
 *  tuiles OSM téléchargées par curl (grilles 3×3, zooms 12 à 18 —
 *  Centre-ville, Angondjé, Owendo, PK12/Melen, côte nord, axe N1
 *  est, nord du centre) et lues visuellement, croisées avec les
 *  objets `place` (suburb / quarter / neighbourhood / village /
 *  city) de la zone via Overpass. Les tuiles montrent que les noms
 *  de quartiers OSM s'affichent de z12 à z16 et DISPARAISSENT à
 *  z17-18 (vérifié : grilles z17 et z18 au Centre-ville — noms de
 *  rues et de lieux uniquement, plus aucun nom de quartier), d'où
 *  la borne haute 16. Le zoom minimum est le premier zoom où le nom
 *  a été VU sur une tuile : l'affichage dépend aussi des collisions
 *  entre libellés voisins (ex. « Mont Bouet » n'apparaît qu'à z15,
 *  masqué à z14 par « Libreville » ; « Charbonnages » apparaît à
 *  z14, invisible à z12-13), donc un nom peut être absent d'un zoom
 *  intermédiaire sans être absent de la plage — masquer sur toute
 *  la plage [min, borne haute] est le seul traitement robuste, au
 *  prix de quelques noms absents de la carte Plan à un zoom où le
 *  fond ne les montre pas non plus (listes et recherche inchangées :
 *  les quartiers restent sélectionnables comme départ et
 *  destination).
 *  RECALIBRAGE v2.46 (15/11/2026) — APPROXIMATION DÉRIVÉE DU STYLE,
 *  À CONFIRMER EN LIVE APRÈS PUSH : le fond Plan n'est plus OSM
 *  standard mais CARTO dark_all. Les plages ci-dessus ne sont donc
 *  plus des observations de tuiles mais une lecture de la définition
 *  publique du style CARTO dark matter (dépôt CartoDB/basemap-styles,
 *  `cartocss/web-styles/dark-matter.tm2/labels.mss`, style partagé
 *  `shared/mss/labels.mss`, variables `style.mss`) : city z8–14,
 *  town z9–16, village z12–16, suburb z12–16, neighbourhood z13–17
 *  (hamlet z14–17) — AUCUNE règle pour `place=quarter`. Les zooms
 *  minimums v2.42 sont CONSERVÉS : CARTO utilise les mêmes données
 *  OSM (mêmes noms, mêmes objets `place`) et ses premiers zooms par
 *  classe (suburb z12, neighbourhood z13) sont cohérents avec les
 *  z12–15 observés (l'écart vient des collisions entre libellés).
 *  Classe OSM de chaque quartier recoupée le 15/11 via Photon
 *  (recherche « <nom>, Libreville », objet `place` retourné) : 40
 *  `suburb`, 1 `city` (Akanda), 1 `quarter` (PK5), 15 non retrouvés
 *  par la recherche (Bikélé, Owendo, Alenakiri, Cap Esterias,
 *  Malibé, Essassa, Nkok, Nkoltang, La Peyrie, Camp de Gaulle,
 *  Igoumié, Akournam, Nkembo, Gros-Bouquet, Aéroport Léon-Mba) —
 *  pour ces 15, le masquage v2.42 est conservé par prudence
 *  anti-double (40 des 42 classés sont `suburb` : la probabilité
 *  qu'ils le soient aussi est forte, et un double serait pire
 *  qu'un nom masqué un zoom de trop). Les 15 restent à reclasser
 *  au premier recoupement Overpass possible.
 *  PK5 RETIRÉ de la table en v2.46 : `place=quarter`, et ni le
 *  style raster CARTO ni le style vectoriel CARTO actuel
 *  (`dark-matter-gl-style`, couches `place_*`) ne contiennent de
 *  règle pour `quarter` — CARTO n'imprime très probablement pas
 *  ce nom, le libellé Drive est donc le seul à l'écran et ne doit
 *  pas être masqué. Si la vérification live montre un double
 *  « PK5 » (la chaîne CARTO mapperait alors `quarter` vers
 *  `suburb`), le remettre ici avec 14 — voir ADR 0021.
 *  VARIANTES DE NOMS (même lieu, libellé OSM différent) : Aéroport
 *  Léon-Mba → « Aéroport » ; Alenakiri → « Alénakirie » ; Akébé →
 *  « Akébé-Ville » / « Akébé Plaine » ; Kinguele → « Akébé-Kinguélé » ;
 *  Batterie IV → « Batterie 4 » ; Damas → « Cité Damas » ; Lalala →
 *  « Lalala-Gauche » / « Lalala-Dakar » / « Lalala-Droite » ; La Peyrie
 *  → « Peyrie » ; Mindoubé → « Mindoube 1 / 2 / 3 » ; Nomba →
 *  « Nomba-Domaine » / « La Nomba » ; Gué-Gué → « Bas de Gué-Gué » /
 *  « Haut de Gué-Gué » (et « Gué » à z13) ; Sainte-Marie → « Vallée
 *  Sainte-Marie » ; Akournam → « Akournam I / II » ; Angondjé →
 *  « Angondjé Village » à z12, « Angondjé » exact à z14 ; Oloumi →
 *  « Zone Industrielle d'Oloumi » à z12, « Oloumi » exact à z13 ;
 *  Gros-Bouquet → « Carrefour Gros Bouquet » (libellé de carrefour,
 *  z15). NON-DOUBLONS vérifiés (noms proches, lieux différents) :
 *  Bizango ≠ « Bizango-Rail » (8 km) ; « Zone Industrielle
 *  d'Oloumi » ≠ Oloumi ; Likouala n'a déjà aucun libellé Drive
 *  (v2.16) — OSM montre « Likouala-Moussaka » à côté, sans double.
 *  QUARTIERS JAMAIS MASQUÉS (13, libellé Drive seul) : Santa Clara,
 *  PK5, PK6, PK8, PK9, PK11, PK12, Melen, Diba-Diba, Sogara,
 *  Barracuda, Cap Caravane, Bizango. Si le fond ajoute un jour un
 *  de ces noms, il suffit d'ajouter une ligne ici — aucune autre
 *  modification. */
export const NEIGHBORHOOD_CARTO_LABEL_MIN_ZOOM: Partial<Record<Neighborhood, number>> = {
  // Visibles sur les tuiles dès z12 (grands noms + villages de la N1).
  Akanda: 12,
  Avorbam: 12,
  Sablière: 12,
  Okala: 12,
  'Aéroport Léon-Mba': 12,
  Alibandeng: 12,
  Tahiti: 12,
  Ondogo: 12,
  'Cité de la Démocratie': 12,
  'Nzeng-Ayong': 12,
  Montalier: 12,
  Bambouchine: 12,
  Sibang: 12,
  Bikélé: 12,
  Owendo: 12,
  Alenakiri: 12,
  Acaé: 12,
  Nomba: 12,
  Lalala: 12,
  'Cap Esterias': 12,
  Malibé: 12,
  Angondjé: 12,
  Essassa: 12,
  Nkok: 12,
  Nkoltang: 12,
  // Premiers vus à z13 (quartiers moyens, centre dense).
  Sotega: 13,
  'Plaine-Orety': 13,
  Sorbonne: 13,
  Akébé: 13,
  Kinguele: 13,
  Oloumi: 13,
  Mindoubé: 13,
  Damas: 13,
  'Batterie IV': 13,
  'Gué-Gué': 13,
  'Sainte-Marie': 13,
  // Premiers vus à z14 (zoom d'ouverture : c'est là que le double
  // affichage se voyait le plus).
  'Centre-ville': 14,
  Glass: 14,
  Louis: 14,
  'La Peyrie': 14,
  'Plein Ciel': 14,
  'Belle-Vue': 14,
  Awendjé: 14,
  Cocotiers: 14,
  Ambowe: 14,
  Charbonnages: 14,
  'Trois Quartiers': 14,
  'Camp de Gaulle': 14,
  // PK5 RETIRÉ en v2.46 : `place=quarter` (Photon, 15/11), aucune
  // règle CARTO pour `quarter` — le libellé Drive est le seul nom.
  Igoumié: 14,
  Akournam: 14,
  Ozangué: 14,
  'Venez-Voir': 14,
  // Premiers vus à z15 (masqués à z14 par les libellés voisins).
  'Mont-Bouët': 15,
  Nkembo: 15,
  'Gros-Bouquet': 15,
  'Petit Paris': 15,
};

/** Borne haute du masquage par quartier (v2.46) — dernier zoom où le
 *  fond Plan CARTO dark_all imprime encore le nom. Défaut : 16
 *  (règles du style : suburb / village / town s'arrêtent à z16).
 *  Seule exception connue : Akanda (14) — `place=city` (Photon,
 *  15/11), et la règle `city` du style s'arrête à z14 (le nom
 *  disparaît à z15). La règle `city` est en plus conditionnée par
 *  le rang (z8–14, rang ≤ 11/12/15 selon le zoom — rang d'Akanda
 *  inconnu : si la vérification live montre « Akanda » absent à
 *  z12–14, retirer Akanda de la table des minimums). Un quartier
 *  `place=neighbourhood` aurait une borne à 17 (règle
 *  neighbourhood z13–17) — aucun dans la table au 15/11 (Photon :
 *  0 `neighbourhood` parmi les 57) ; si un jour un quartier est
 *  reclassé `neighbourhood`, ajouter ici `Nom: 17`.
 *  Approximation dérivée du style, comme la table des minimums —
 *  à confirmer en live après push (voir ADR 0021). */
export const NEIGHBORHOOD_CARTO_LABEL_MAX_ZOOM: Partial<Record<Neighborhood, number>> = {
  Akanda: 14,
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
