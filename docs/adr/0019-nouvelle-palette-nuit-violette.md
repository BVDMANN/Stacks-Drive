# ADR 0019 — Nouvelle palette « Nuit violette » (rose néon sur fond violet-nuit)

- **Statut :** acceptée (14/11/2026, demande du propriétaire ~22h29, direction confirmée ~22h31).
- **Contexte :** la palette « Nuit dorée » (or #FFC700 / #FFD60A, cyan #22D3EE, fond bleu encre #070B16 — v2.1, choix du 13/11/2026) ne correspondait plus au goût du propriétaire. Le 14/11 ~22h29, il envoie une capture d'un Reel (compte @voiture.expliquee, « ELLE ROULE SANS CLÉ ») : « Cette palette de couleur est super va sur cette base change ». Puis ~22h31 il confirme la direction : néon rose vif sur nuit violette, style néon nocturne assumé — la palette est validée comme telle. (La référence culturelle exacte qu'il a citée pour décrire la direction figure dans le brief du lot, pas dans ce fichier : aucun nom de marque tiers ne doit apparaître dans l'appli publique, le README ou les docs publiques.)
- **Mesure (pas de devinette) :** couleurs échantillonnées sur la capture `IMG_3757.jpeg` (1320×2714) par zones, en Python/PIL — médiane des pixels filtrés par teinte, buckets dominants en complément :
  | Élément de la capture | Mesure | Valeur retenue |
  |---|---|---|
  | Fond violet-nuit (zones vides) | médiane #191432, buckets #101030 | `night-950` #191432 |
  | Ligne d'itinéraire rose | médiane #EF7E82, buckets #E06090 / #E07090 | `rose-500` #FF4D8D |
  | Pastilles « SANS » / « CLÉ. » (corail) | médiane #EB5E71, buckets #E05070 | `corail` #FF5F6D |
  | Icône maison sarcelle | médiane #65CFCF, buckets #60C0C0 | `sarcelle` #2FD6C8 |
  | Aiguille de jauge orange | médiane #F3A64E | `sunset` #F5A623 |
  | Ovale sarcelle foncé (décor) | médiane #24526C | (ton décoratif, non repris tel quel) |
  Les valeurs retenues sont légèrement éclaircies par rapport aux médianes brutes (diluées par l'anti-crénelage et le fond sombre) pour rester lisibles en interface : le rose #FF4D8D reste dans la famille mesurée (#E06090), pas un rose inventé.

## Décision

1. **Nouveaux jetons Tailwind** (`tailwind.config.ts`) — `night` 950 #191432 / 900 #201646 / 800 #2A1D55 / 700 #352463 / 600 #42307A ; `rose` 100 #FFD9E8 / 300 #FF7EB0 / 500 #FF4D8D / 600 #E8357A / 700 #D6336C ; `corail` #FF5F6D (+ clair #FF8A94, sombre #E5484D) ; `sarcelle` #2FD6C8 (+ clair #7FE8DD, sombre #0E9F94) ; `sunset` #F5A623. Les anciens jetons `or` / `gold` / `cyan` sont **supprimés**, pas gardés en alias : un alias aurait laissé le nom « or » désigner du rose dans le code.
2. **Renommage exhaustif** (44 fichiers) : classes Tailwind (`bg-or` → `bg-rose-500`, `text-or` → `text-rose-300`, `text-gold` → `text-corail`, `text-cyan` → `text-sarcelle`, etc.), hex et rgba (`#FFC700` / `#FFD60A` → `#FF4D8D`, `#22D3EE` → `#2FD6C8`, `#070B16` → `#17112E`, `#0B1020` → `#201646`, `#12182B` → `#2A1D55`, `#1A2340` → `#352463`), commentaires (« Nuit dorée » → « Nuit violette »), et la variante `or` de `PremiumButton` → `rose` (3 pages d'authentification). Vérifié par grep : 0 occurrence restante des anciens jetons dans `app/` / `components/` / `styles/` / `lib/` (hors nuances Tailwind par défaut `cyan-300` / `cyan-400` etc., qui ne sont pas la palette, et hors ambre des encarts d'avertissement sur fond blanc, sémantique d'alerte conservée).
3. **Rose = accent principal, texte sombre sur rose.** Le blanc sur #FF4D8D ne fait que 3,1:1 : les boutons CTA prennent donc le texte sombre `night-950` #17112E sur fond rose (5,8:1) — `.btn-action`, `.btn-price` (corail, 6,2:1), boutons `bg-rose-500` avec `text-night-900`. Textes sur fond sombre : blanc sur #191432 = 17,7:1 ; sarcelle = 9,8:1 ; corail = 6,0:1 ; rose clair #FF7EB0 = 7,5:1. Les petits textes d'accent utilisent `rose-300` / `corail`, jamais `rose-500` sur fond sombre.
4. **Bars et restaurants v2.43 recolorés** (`lib/pois.ts` + `styles/globals.css`, mêmes valeurs des deux côtés — la mini-carte d'info reprend la couleur du pictogramme) : bar #f9a8d4 → rose clair #FF7EB0, restaurant #a3e635 → corail #FF5F6D ; station-service #fb923c → orange #F5A623, pharmacie et port #22d3ee → sarcelle #2FD6C8. Les autres catégories (marché vert, hôtel violet, musée rose, plage jaune…) sont inchangées : elles n'appartiennent pas à l'ancienne palette or/cyan.
5. **La carte ne change pas.** Le fond Plan reste l'OpenStreetMap CLAIR décidé le 14/11 ~21h58 (v2.41, ADR 0016) : la capture montre une carte sombre, mais c'est le style du Reel, pas une demande de retour au sombre. Aucun filtre sombre réintroduit (`.map-tiles-dark` reste retiré, aucun `filter` sur le panneau de tuiles — vérifié dans le DOM, tuiles `tile.openstreetmap.org`). Seuls changent la ligne d'itinéraire OSRM (halo + trait #FF4D8D), les marqueurs chauffeurs (dégradé rose #FF7EB0 → #FF4D8D → #D6336C, anneau sarcelle), le point de départ, les épingles, le cercle périmètre 5 km et le radar (sarcelle).

## Conséquences

- L'identité visuelle change partout d'un coup (feuille, boutons, badges, marqueurs, toasts, tutos, écrans chauffeur et passager, pages légales) : c'est voulu — une palette à moitié appliquée aurait laissé de l'or à côté du rose.
- Le nom de palette devient « Nuit violette » dans les commentaires du code, `tailwind.config.ts`, les blocs DOC-SYNC (`scripts/sync-docs.mjs` : « icônes chauffeurs roses ») et cette ADR. Les entrées historiques du CHANGELOG et du README (v2.5, v2.12, v2.31) gardent « dorée » : elles décrivent des versions passées, on ne les réécrit pas.
- Les captures de tutoriel (v2.21, « visuels réels ») montrent les vrais écrans de l'appli : elles sont à refaire si l'écran change — la nouvelle palette change les écrans, donc les captures de tuto sont à régénérer au prochain lot tuto (signalé, non fait ici).
- Aucune migration, aucun nouveau cron, `lib/commission.ts` intouchée, les 2 règles intactes (barre de chargement partout ; switch passager → chauffeur impossible sans compte chauffeur, verrou serveur compris).

## Alternatives écartées

- **Garder les jetons `or` / `gold` / `cyan` en alias vers les nouvelles valeurs** : zéro risque de casse, mais le code aurait menti sur les noms (`bg-or` = rose) — écarté, le renommage mécanique a été vérifié par grep + build.
- **Repasser la carte en sombre** (la capture montre un fond de carte sombre) : écarté — la décision carte claire du 14/11 ~21h58 (v2.41) n'a pas été remise en cause par le propriétaire ; sa demande porte sur la palette de l'interface, pas sur les tuiles.
- **Rose plus sombre pour le texte blanc** (ex. #D6336C, 4,6:1 avec du blanc) : écarté pour les CTA — le rose vif mesuré #FF4D8D avec texte sombre (5,8:1) garde la couleur exacte de la capture tout en dépassant le seuil AA.
