# ADR 0002 — OSRM (démo puis auto-hébergé), pas Google Maps

- Statut : Acceptée
- Date : 14/11/2026 (décision antérieure, documentée en v2.33)

## Contexte

La carte doit tracer le vrai trajet par les rues (itinéraire routier,
ETA chauffeur, navigation guidée virage par virage) au lieu d'une ligne
droite. Le routage est un besoin d'affichage et de guidage — jamais un
besoin de tarification (voir ADR 0010).

## Décision

- **OSRM** (Open Source Routing Machine), via le serveur démo public
  `router.project-osrm.org` (sans clé), surchargeable par la variable
  d'environnement `OSRM_BASE_URL` (`lib/routing.ts`).
- **Auto-hébergement sur petit VPS prévu au lancement** : même moteur,
  même API, sans dépendance au serveur démo.
- Discipline d'usage du serveur démo : cache serveur 5 min par trajet,
  intervalle minimum 1,1 s entre appels (limite : 1 requête/seconde),
  400 points max par itinéraire, proxy par la route API `/api/route`.
- **Repli ligne droite** (25 km/h) si OSRM est indisponible ou trop
  lent : jamais d'écran vide.

## Conséquences

- Zéro coût, zéro compte, zéro clé aujourd'hui ; bascule vers le VPS
  sans changer une ligne de code métier (une variable d'environnement).
- Le serveur démo est une ressource partagée et non garantie : le
  cache et le repli sont obligatoires, pas optionnels.
- Les manœuvres OSRM sont traduites en instructions en français
  (`parseOsrmSteps`) pour la navigation guidée.

## Alternatives écartées

- **Google Maps Directions API** : clé payante au volume, compte de
  facturation requis ; pour un produit dont le prix ne dépend pas de
  l'itinéraire, payer chaque calcul d'itinéraire est un coût récurrent
  sans valeur ajoutée.
- **Valhalla / GraphHopper auto-hébergés dès le premier jour** : même
  famille qu'OSRM, mais OSRM est le plus simple à opérer (un binaire,
  un extrait OSM) et son API de manœuvres est la mieux documentée pour
  la navigation virage par virage.
- **Ligne droite uniquement** : insuffisant pour une navigation guidée
  et pour une ETA crédible — écarté dès que l'ETA routière est devenue
  un besoin (v2.28).
