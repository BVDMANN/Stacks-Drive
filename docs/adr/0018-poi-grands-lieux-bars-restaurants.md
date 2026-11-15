# ADR 0018 — POI : grands lieux, bars, grands restaurants (façon Uber)

- **Statut :** acceptée (14/11/2026, demande du propriétaire ~22h07 : « Répertorie les grands coins, les bars, les grands restaurants sur la carte avec des points comme Uber au final »).
- **Contexte :** la carte montrait 43 lieux (`lib/pois.ts`) : supermarchés, marchés, stations-service, pharmacies, hôtels, santé et lieux publics — mais aucun bar, aucun restaurant nommé, et peu de grands repères (les deux stades, la cathédrale, l'université, le jardin botanique). Un passager qui veut aller boire un verre ou dîner, ou retrouver quelqu'un à un grand lieu, n'avait aucun point sur la carte. La v2.42 venait de corriger les libellés de quartiers en double avec le fond OpenStreetMap : la même erreur ne devait pas être reproduite avec les nouveaux lieux (un libellé Drive posé sur un nom qu'OSM imprime déjà), et la leçon v2.16 restait valable (aucun lieu « placé au pif » — les quartiers approximatifs avaient dû être recorrigés un par un).

## Inventaire des 43 lieux existants (avant le lot)

| Catégorie | Nombre | Lieux |
|---|---|---|
| Supermarché | 6 | Mbolo, Géant Casino, Prix Import, CK2, Casino Supermarché, Cecado |
| Marché | 6 | Marché Mont-Bouët, Marché de Nzeng-Ayong, Marché de Louis, Marché d'Owendo, Marché de Nkembo, Marché d'Akébé |
| Station-service | 6 | TotalEnergies Centre-ville / Glass / Aéroport / Owendo / Akanda, OLA Nzeng-Ayong |
| Pharmacie | 6 | Pharmacie du Centre, de Glass, Mont-Bouët, de Nzeng-Ayong, d'Owendo, de Louis |
| Hôtel | 3 | Radisson Blu Okoumé Palace, Le Méridien Re-Ndama, Hôtel Tropicana |
| Santé | 3 | CHU de Libreville, Hôpital des Armées Omar Bongo, CHU Mère-Enfant Jeanne Ebori |
| Stade | 2 | Stade de l'Amitié, Stade Omar Bongo |
| Lieu public | 3 | Université Omar Bongo, Cathédrale Sainte-Marie, Jardin Botanique |
| Gare | 2 | Gare d'Owendo, Gare Routière |
| Aéroport | 1 | Aéroport international Léon-Mba |
| Port | 2 | Port d'Owendo, Port de Libreville |
| Musée | 1 | Musée National du Gabon |
| Plage | 2 | Plage de la Sablière, Plage d'Angondjé |

## Décision

1. **16 lieux ajoutés (43 → 59), tous vérifiés, aucun inventé.** Chaque lieu a son nom exact et ses coordonnées confirmés par au moins une source (recherche de lieux avec place_id, Nominatim / OpenStreetMap, Wikipédia pour le Palais des Sports). Les quartiers affichés dans l'infobulle sont les plus proches (distance au centre de quartier, `NEIGHBORHOOD_COORDS`), sauf quand l'adresse de la source dit autre chose (L'Emir : Centre-ville, Restaurant Okande : Nzeng-Ayong).

   | Lieu | Catégorie | Quartier | Coordonnées | Source |
   |---|---|---|---|---|
   | Roma Restaurant & Hotel | restaurant | Louis | 0.410493, 9.430753 | Recherche de lieux (place_id 431258282102848) + site officiel romalibreville.com |
   | Bantu Restaurant | restaurant | Oloumi | 0.372511, 9.458357 | Recherche de lieux (place_id 607907774256849) + Petit Futé (Quartier Glass) |
   | Le Wap | restaurant | Louis | 0.411522, 9.431872 | Recherche de lieux (place_id 794774931655155) |
   | Restaurant Okande | restaurant | Nzeng-Ayong | 0.417963, 9.481749 | Recherche de lieux (place_id 611697963805904) |
   | Amaya Restaurant | restaurant | Trois Quartiers | 0.429857, 9.420594 | Recherche de lieux (place_id 1094234595807340, Radisson Blu) |
   | D'Ici et D'Ailleurs | restaurant | Sainte-Marie | 0.406502, 9.434356 | Recherche de lieux (place_id 470991141125394) + guide (Bd Triomphal) |
   | L'Emir | restaurant | Centre-ville | 0.388682, 9.444006 | Recherche de lieux (place_id 1497875500670801) + Petit Futé + TripAdvisor (rue Ange Mba) |
   | Le Phare Du Large | restaurant | Batterie IV | 0.416978, 9.424851 | Recherche de lieux (place_id 313571577592984) + TripAdvisor (Batterie IV) |
   | L'Odika | restaurant | Louis | 0.4127657, 9.4328021 | Nominatim OSM (amenity=restaurant, rue Yves Tchicot) + TripAdvisor (Montée de Louis) |
   | Yoka Lounge | bar | Tahiti | 0.439917, 9.41778 | Recherche de lieux (place_id 595635192171123, lounge bar) |
   | Luxury Lounge | bar | Charbonnages | 0.4383996, 9.4406665 | Nominatim OSM (amenity=restaurant, av. Edith Lucie Bongo Ondimba) + TikTok (rond-point des Charbonnages) |
   | Palais des Sports | stade | Petit Paris | 0.3948925, 9.4530049 | Nominatim OSM (leisure=sports_centre) + Wikipédia (0.39472, 9.45278) + recherche de lieux (0.394792, 9.453034) — 3 sources concordantes |
   | Rond-Point de la Démocratie | lieu | Sotega | 0.4249165, 9.4553274 | Nominatim OSM (Charbonnages) |
   | Institut Français du Gabon | lieu | Sainte-Marie | 0.4074526, 9.4387226 | Nominatim OSM (amenity=community_centre, Bd Triomphal) |
   | Lycée National Léon Mba | lieu | Trois Quartiers | 0.4279831, 9.422459 | Nominatim OSM (amenity=school, Bd de la Nation) |
   | Park Inn by Radisson | hotel | Trois Quartiers | 0.430673, 9.419899 | Recherche de lieux (place_id 770676590930235, 7 Bd de Nice) |

2. **Nouvelles catégories `bar` et `restaurant`** (`lib/pois.ts`) : pictogramme distinct par catégorie (verre à cocktail pour le bar, couverts pour le restaurant), couleur propre (bar rose `#f9a8d4`, restaurant lime `#a3e635` — mêmes valeurs dans `POI_CATEGORY_COLORS` et le CSS `.cat-*`), libellé de catégorie (« Bar », « Restaurant ») dans la mini-carte d'info existante (`PoiInfoCard` : nom, distance, estimation, « Y aller » — aucun code de fiche à changer, elle est générique). Les marqueurs sont cliquables comme les lieux existants (même gestionnaire, même infobulle nom · catégorie · quartier).
3. **Carte non surchargée — tier resserré pour les catégories denses** : bars et restaurants apparaissent un zoom plus tard — pictogramme dès z15 (au lieu de z14), libellé dès z16 (au lieu de z15). Motif mesuré : 4 restaurants dans le seul quartier Louis (Roma, Le Wap, L'Odika à ~170 m les uns des autres), 2 restaurants + 1 hôtel sur la Corniche (Amaya / Park Inn à 119 m). À z14, leurs pictogrammes de 24 px se toucheraient (170 m ≈ 18 px) ; à z15, leurs libellés se chevaucheraient. Implémentation : `POI_DENSE_CATEGORIES` + `poiIconMinZoom()` / `poiLabelMinZoom()` (`lib/pois.ts`, source unique des seuils), deuxième couche Leaflet `poiDenseLayer` et classe `dense` sur le marqueur (`LibrevilleMap.tsx`), classes `map-poi-labels-on` (z15, hors dense) et `map-poi-labels-dense-on` (z16, dense) (`styles/globals.css`). Les grands lieux gardent le tier standard (z14 / z15) : ce sont des repères espacés.
4. **Règle anti-double v2.42 appliquée aux lieux** : nouveau champ optionnel `osmLabelMinZoom` sur `Poi` — premier zoom où OpenStreetMap imprime déjà le nom du lieu sur la tuile. Vérifié comme en v2.42, par curl : 32 tuiles OSM téléchargées (z15, z16, z17) et lues visuellement (Centre-ville, Louis, Corniche nord, Nzeng-Ayong, Oloumi, Charbonnages). Résultat :
   - Lycée National Léon Mba : OSM dès **z15** (nom visible sur la tuile z15).
   - Palais des Sports : OSM dès **z16** (absent à z15, présent à z16 et z17).
   - Park Inn by Radisson, Rond-Point de la Démocratie, Institut Français du Gabon : OSM dès **z17** (absents à z15 et z16, présents à z17).
   - Les 11 autres nouveaux lieux (9 restaurants, 2 bars) : OSM ne les labellise **ni à z16 ni à z17** — pas de champ, leur libellé Drive s'affiche à tous les zooms de leur tier.
   - En Plan, le libellé Drive est masqué à partir de ce zoom (classe `label-osm` posée par `updateLabels` — le nom reste visible une fois, via la tuile) ; en Satellite, il s'affiche toujours (tuiles Esri sans aucun libellé). Contrairement aux quartiers (masqués entre `osmMin` et 16, car OSM cesse de labelliser les quartiers à z17), le masquage des lieux n'a pas de borne haute : OSM labellise les lieux jusqu'à z19. La bascule Plan/Satellite réapplique la règle immédiatement (même `updateLabels` que la v2.42).
5. **Aucun lieu incertain ajouté.** Lieux écartés (à confirmer par le propriétaire avant tout ajout) :
   - **Le Pili Pili** : la fiche lieu dit « Pili Pili Broch » (0.396561, 9.446219, Centre-ville) alors que le guide le place à Mont-Bouët — nom et position incohérents entre les sources.
   - **Amigo's Restaurant** (Glass) : fiche lieu incohérente (catégorie « Health Clinic », coordonnées à ~1,5 km du Méridien) alors que les avis disent « en face du Méridien » — coordonnées non fiables.
   - **Sans coordonnées vérifiables** (mentionnés dans les guides, aucune fiche lieu ni objet OSM) : La Dolce Vita, Café de la Paix, La Voile Blanche, La Guinguette, Ovima by Mayena, Chez Tantine Bijou, Le QG (Glass), Cote Plage Bar, HYPE BAR LOUNGE, The Spot.
   - **Sans coordonnées propres** (à l'intérieur d'un lieu déjà marqué — un second marqueur au même endroit serait un doublon) : Le Piano Bar et Le Pub (dans les hôtels Radisson Blu et Park Inn), Le Tropicana Nightclub (dans l'Hôtel Tropicana, déjà un lieu).
   - **Stade de Nzeng-Ayong** : aucun objet stade trouvé (Nominatim ne renvoie que « Avenue du Stade »).
   - **Place de l'Indépendance** : Nominatim renvoie un autre lieu (Place des Exécutés d'Hollando, 0.3864127, 9.4441813) — l'existence du nom n'est pas confirmée.
   - **Église Saint-Michel de Nkembo, Arboretum Raponda Walker** : aucun résultat Nominatim ni fiche lieu.
   - Repérés sur les tuiles OSM mais sans fiche lieu (coordonnées à dériver de la tuile, adresse de guide incohérente) : **Le Patio** (nom imprimé par OSM à z17, quartier Louis) et **Club Insomnia** (nom imprimé par OSM à z17, quartier Louis) — à confirmer avant ajout.

## Conséquences

- 59 lieux sur la carte (43 + 16) ; compteurs recalculés depuis le code par `scripts/sync-docs.mjs` (blocs `readme-map`, `etat-map`, `readme-rules`, `etat-table-map`, `etat-paperasse-pois`).
- Les libellés Drive des 5 lieux qu'OSM labellise n'apparaissent jamais en double avec la tuile en Plan ; en Satellite, ils s'affichent comme avant.
- Limites connues (vérifiées sur captures mobiles 390 px) : **aucun chevauchement constaté sur les nouveaux lieux** — cluster Louis à z16 et z17 (L'Odika, Le Wap, Roma Restaurant & Hotel, D'Ici et D'Ailleurs : les 4 libellés lisibles, sans se toucher) et paire Amaya / Park Inn à z16 (119 m : les deux libellés lisibles, sur deux lignes différentes grâce au décalage diagonal). Le tier resserré suffit. En revanche, à z16, les libellés **pré-existants** « Musée National du Gabon » / « Cathédrale Sainte-Marie » / « Pharmacie du Centre » se chevauchent encore au Centre-ville (antérieur au lot, déjà signalé en v2.39) — hors périmètre.
- Observation hors lot, non corrigée ici : le lieu existant « Radisson Blu Okoumé Palace » (0.398, 9.436, Centre-ville) est à ~3,7 km de l'hôtel réel (boulevard de Nice — confirmé par les fiches Amaya et Park Inn, 0.4298, 9.4206). La correction déplacerait un lieu existant : à faire valider par le propriétaire. De même, OSM labellise « Stade Omnisports » dès z15 là où le lieu existant dit « Stade Omar Bongo » (même complexe, variante de nom — pas un double exact, hors lot).
- Maintenance : si OSM labellise un jour un des 11 lieux non labellisés, il suffit d'ajouter `osmLabelMinZoom` sur sa ligne — aucune autre modification. Si un lieu écarté est confirmé par le propriétaire, il s'ajoute dans sa section avec sa source.

## Alternatives écartées

- Ajouter les lieux écartés avec des positions estimées (« au pif ») : interdit par la leçon v2.16 — un point mal placé est pire qu'un point absent (le passager se rend au mauvais endroit).
- Même tier (z14 / z15) pour bars et restaurants : leurs pictogrammes se toucheraient dès z14 dans le cluster Louis et sur la Corniche (mesuré : 165 m et 119 m entre voisins).
- Un marqueur par bar d'hôtel (Piano Bar, Le Pub, Tropicana Nightclub) au même point que l'hôtel : deux marqueurs superposés, un seul cliquable — le lieu de l'hôtel couvre déjà l'adresse.
- Supprimer le libellé Drive de tous les lieux qu'OSM labellise, à tous les zooms : en Satellite (aucun libellé sur les tuiles Esri), ces 5 lieux n'auraient plus aucun nom.
