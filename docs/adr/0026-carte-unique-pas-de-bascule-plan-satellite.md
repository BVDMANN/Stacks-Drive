# ADR 0026 — Une seule carte, pas de bascule Plan / Satellite

- **Statut :** acceptée (15/11/2026, v2.50 — décision du propriétaire : Yango n'a pas de choix de fond de carte, Drive non plus).
- **Contexte :** depuis la v2.13, l'accueil proposait deux fonds de carte — Plan (Esri World Street Map, puis OSM clair en v2.41, puis CARTO dark_all en v2.46) et Satellite (Esri World Imagery) — avec des pastilles « Plan » / « Satellite » sous le bouton Recentrer. Sur la vidéo et les captures Yango envoyées par le propriétaire le 15/11, il n'y a pas de choix de fond : la carte est juste la carte. Le propriétaire le signale le 15/11 ~09h54 (« ça aussi je dois te dire ? ») — c'était à nous de le voir. Le Satellite, en plus, coûtait cher en complexité : plafond de zoom par mode (Plan 19 / Satellite 18), attribution qui s'accumulait à chaque bascule (correctif v2.46), règles de libellés différentes par fond (les libellés Drive masqués en Plan réapparaissaient en Satellite), classe CSS `map-satellite` pour le contraste des libellés, et un fond dont les tuiles n'étaient réelles que jusqu'au zoom 18 à Libreville (tuile grise « pas de données » au-delà, v2.18).

## Décision

1. **Une seule carte : le fond CARTO dark_all** (identité Drive, palette « Nuit violette » — ADR 0021). Les pastilles « Plan » / « Satellite » sont retirées de l'accueil ; la barre « Vers où ? » remonte juste sous le bouton Recentrer.
2. **Tout le code Satellite est retiré** : la prop `basemap` de `LibrevilleMap` (et son état + sa persistance `localStorage` dans `HomeScreen`), l'effet de bascule (changement d'URL de tuiles, `setMaxZoom` par mode, changement d'attribution, classe `map-satellite`), les constantes `SATELLITE_MAX_ZOOM` / `SATELLITE_MAX_NATIVE_ZOOM`, les règles CSS `.map-satellite` (`styles/globals.css`).
3. **Plafond de zoom unique : 19** (natif 19, CARTO) — plus de plafond par mode. Le bouton + s'y grise.
4. **Les libellés ne suivent plus que les règles CARTO** (`updateLabels`) : un quartier que CARTO labellise déjà n'affiche son libellé Drive qu'en dehors de la plage [min, max] ; un lieu avec `cartoLabelMinZoom` masque son libellé à partir de ce zoom. Plus de branche « en Satellite, rien n'est masqué ».
5. **Attribution unique** : « © OpenStreetMap contributors © CARTO », posée une fois à la création de la couche — le correctif de l'accumulation de l'attribution (v2.46) est devenu sans objet.

## Conséquences

- Moins de code, moins de cas à tester : un seul fond, un seul plafond, une seule règle de libellés, une seule attribution.
- L'utilisateur ne peut plus voir Libreville en image satellite : perte assumée — aucun concurrent (Yango, Gozem) ne propose ce choix sur son écran de commande, et le Satellite Esri n'était réel que jusqu'au zoom 18.
- Les docs vivantes sont corrigées (README, SETUP, ARCHITECTURE, `scripts/sync-docs.mjs` : les nombres de libellés visibles sont désormais ceux du fond unique). L'historique des versions (README, CHANGELOG, ADR 0016/0021) garde la trace du Satellite — c'est l'historique, pas l'état actuel.
- Si un jour un fond satellite est redemandé, il faudra le réimplémenter proprement (nouvelle décision, pas un retour en arrière silencieux) — le code mort est retiré, pas commenté.

## Alternatives écartées

- **Garder la bascule mais la cacher** (code conservé, bouton retiré) : écarté — du code mort qui pourrit (plafonds par mode, attribution Esri, règles de libellés à deux branches) et qui serait réactivé par accident.
- **Satellite par défaut, Plan en option** : écarté — le fond CARTO dark_all porte l'identité Drive (« Nuit violette ») ; le Satellite ne la porte pas.
- **Deuxième fond en « mode carte » séparé** (écran dédié) : écarté — même complexité, pour un usage que personne n'a demandé.
