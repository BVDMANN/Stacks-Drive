# ADR 0011 — Retrait de la section « Points de prise en charge »

- Statut : Acceptée
- Date : 14/11/2026 (décision du propriétaire)
- Précise : ADR 0005 (estimation indicative, pas de prix fixe)

## Contexte

En v2.22, l'accueil affichait une section « Points de prise en charge » :
10 lieux (aéroport, marchés, stades, gares, université, CHU, hôtel) avec,
sur chaque ligne, une estimation indicative Groupe / Solo vers la
destination choisie (Centre-ville par défaut). L'intention : un raccourci
de départ — toucher un lieu le définissait comme point de départ.

En vérifiant le produit final le 14/11/2026, le propriétaire a constaté
que la section donnait l'impression de trajets déjà faits, avec des
montants prédéfinis, affichés avant même qu'un trajet soit défini — alors
que l'estimation doit être générée à partir du vrai trajet (départ +
destination choisis), jamais présentée comme une liste de trajets prêts.

## Décision

- La section « Points de prise en charge » est **supprimée de
  l'accueil** (v2.35) : composant `components/home/PickupPoints.tsx`,
  rendu dans `HomeScreen.tsx` (et `handlePickupFromPoi`), données
  `PICKUP_POINT_NAMES` / `PICKUP_POINTS` dans `lib/pois.ts`.
- Les lieux (POI) restent sur la carte (marqueurs cliquables,
  `PoiInfoCard`) : la carte garde ses 43 lieux, seule la liste avec
  montants disparaît.
- L'estimation indicative reste affichée uniquement dans les cartes
  Solo / Groupe, une fois le départ et la destination choisis
  (ADR 0005 inchangée).

## Conséquences

- Plus aucun montant affiché avant qu'un trajet soit défini : l'accueil
  ne montre plus que les champs départ / destination, puis les deux
  types de course avec leur estimation.
- Le raccourci « toucher un lieu pour partir de là » disparaît ; le
  départ se choisit par la liste des quartiers (tri alphabétique +
  recherche) ou par « Me localiser ».
- Les captures des tutoriels montrant l'accueil sont refaites
  (`npm run tuto:captures`) — la section n'y apparaît plus.

## Alternatives écartées

- Garder les lieux sans les montants : le raccourci restait, mais le
  propriétaire a choisi le retrait complet de la section.
