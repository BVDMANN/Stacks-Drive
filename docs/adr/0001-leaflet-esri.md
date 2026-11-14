# ADR 0001 — Leaflet vanilla + tuiles Esri, pas MapLibre

- Statut : Remplacée (partiellement — fond Plan : voir ADR 0016 ; Leaflet vanilla et fond Satellite Esri inchangés)
- Date : 14/11/2026 (décision antérieure, documentée en v2.33)

## Contexte

L'application a besoin d'une carte interactive centrée sur Libreville :
70 quartiers avec libellés par tiers de zoom, marqueurs chauffeurs,
itinéraires routiers, bornes de déplacement sur la zone de service.
La carte est le cœur de l'interface passager comme chauffeur.

## Décision

- **Leaflet 1.9.4 vanilla** (pas `react-leaflet`), rendu côté client
  (`components/map/LibrevilleMap.tsx`).
- **Tuiles Esri World Street Map**, assombries par filtre CSS (thème
  « Libreville la nuit »), gratuites et sans clé.

## Conséquences

- Leaflet vanilla évite le conflit de peer dependency entre
  `react-leaflet` et React 19 — c'est la raison du choix, pas une
  préférence esthétique.
- Aucune clé, aucun compte, aucune facturation : la carte ne peut pas
  tomber en panne pour un problème de clé ou de quota.
- Les tuiles Esri couvrent Libreville (rues, eau, parcs, noms de rues).
  En satellite, au-delà d'un certain zoom, les tuiles ne sont plus
  servies : le code règle `maxNativeZoom` et agrandit les tuiles au
  lieu d'afficher du vide.
- Le code carte est du Leaflet impératif dans des composants React :
  il faut discipliner le cycle de vie (création / destruction de la
  carte) au lieu de laisser un wrapper le faire.

## Alternatives écartées

- **MapLibre GL JS** : moteur vectoriel plus moderne, mais plus lourd
  (WebGL, bundle, complexité) pour un besoin raster simple ; les
  tuiles vectorielles libres pour Libreville n'apportent rien de plus
  que les tuiles Esri pour ce produit, et le coût d'apprentissage est
  plus élevé pour une équipe d'une personne.
- **Google Maps JS API** : clé payante, facturation au volume,
  disproportionnée pour une zone unique ; dépendance à un compte
  Google facturé dès le premier jour.
- **react-leaflet** : incompatible avec React 19 (peer dependency).
