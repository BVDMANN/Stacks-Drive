# ADR 0010 — Prix sur distance haversine, pas routière

- Statut : Acceptée
- Date : 14/11/2026 (v2.11 / v2.27, décision antérieure documentée en v2.33)

## Contexte

L'estimation au km a besoin d'une distance. Deux distances existent :
la distance à vol d'oiseau entre les centres des quartiers (haversine)
et la distance routière (OSRM, par les rues). Laquelle doit déterminer
le prix ?

## Décision

- **Le prix (estimation) est calculé sur la distance haversine**
  entre les centres des deux quartiers (`haversineKm`, `lib/geo.ts` ;
  `estimateFare`, `lib/pricing.ts`).
- **La distance routière OSRM sert à l'affichage et au guidage**
  (durée et distance routières sur la feuille et le détail de course,
  ETA chauffeur, navigation guidée) — **jamais au prix**.

## Conséquences

- Le prix ne dépend d'aucun service externe : une panne OSRM, un
  itinéraire détourné ou un trajet allongé ne change aucun prix. Le
  prix est reproductible : mêmes quartiers, même estimation, à chaque
  fois.
- L'estimation reste un repère simple (prise en charge + taux/km),
  lisible dans sa décomposition (« 500 FCFA + 4,8 km × 210 FCFA/km »).
- Le chauffeur qui prend un détour ne peut pas faire monter le prix :
  le prix est figé à l'acceptation de toute façon — mais l'estimation
  initiale, elle, ne bouge pas non plus.

## Alternatives écartées

- **Prix sur distance routière OSRM** : le prix dépendrait d'un
  service démo public non garanti (panne = pas de prix), et varierait
  selon l'itinéraire choisi — deux passagers pour le même trajet
  pourraient voir deux estimations différentes. Inacceptable pour un
  prix affiché avant la course.
- **Prix sur durée** : rejeté avec le modèle au km (ADR 0005) — pas de
  prix à la minute, comme les références locales.
