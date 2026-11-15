# Décisions d'architecture (ADR)

Une décision = un fichier. Chaque ADR décrit une décision **prise**
(contexte, décision, conséquences, alternatives écartées) — jamais un
plan ni une intention. Le plan ne vit pas dans le dépôt.

Format : inspiré des Architecture Decision Records classiques
(Michael Nygard). Statut : `Acceptée` (la décision est appliquée dans
le code) ou `Remplacée` (une ADR plus récente la remplace — l'ancienne
reste, avec le renvoi).

| N° | Décision | Statut |
|---|---|---|
| [0001](0001-leaflet-esri.md) | Leaflet vanilla + tuiles Esri, pas MapLibre | Remplacée (partiellement — fond Plan : voir [0016](0016-carte-openstreetmap-filtre-nuit.md) ; Leaflet vanilla et fond Satellite Esri inchangés) |
| [0002](0002-osrm-auto-heberge.md) | OSRM (démo puis auto-hébergé), pas Google Maps | Acceptée |
| [0003](0003-commission-par-course.md) | Commission par course, pas d'abonnement | Acceptée |
| [0004](0004-rls-trigger.md) | RLS + trigger anti-escalade, pas juste l'API | Acceptée |
| [0005](0005-estimation-indicative.md) | Estimation indicative, pas de prix fixe | Acceptée |
| [0006](0006-paiement-hors-appli.md) | Paiement hors appli (cash / P2P), pas de paiement in-app | Acceptée |
| [0007](0007-realtime-sondage-repli.md) | Realtime + sondage en repli, pas l'un ou l'autre | Acceptée |
| [0008](0008-verification-automatisee-tickets.md) | Vérification automatisée + tickets admin | Acceptée |
| [0009](0009-perimetre-5km.md) | Périmètre dispatch 5 km puis 25 km | Acceptée |
| [0010](0010-prix-haversine.md) | Prix sur distance haversine, pas routière | Acceptée |
| [0011](0011-retrait-points-prise-en-charge.md) | Retrait des points de prise en charge (montants avant trajet) | Acceptée |
| [0012](0012-tutoriel-non-bloquant.md) | Tutoriel passager non bloquant à l'arrivée (carte d'accueil, sans voile) | Acceptée |
| [0013](0013-annulation-sans-motif.md) | Annulation sans motif (choix par défaut) + erreur serveur affichée telle quelle | Acceptée |
| [0014](0014-zoom-max-18-controles-visibles.md) | Plafond de zoom 18 (dernier zoom réel) + contrôles de carte toujours visibles feuille dépliée | Acceptée |
| [0015](0015-vue-admin-en-direct.md) | Vue admin « En direct » : agrégation serveur + Realtime en déclencheur, pas de table d'événements | Acceptée |
| [0016](0016-carte-openstreetmap-filtre-nuit.md) | Carte : fond Plan OpenStreetMap + filtre nuit gardé, zoom max 19 en Plan (18 en Satellite) | Remplacée (fond Plan : voir [0021](0021-fond-plan-carto-dark-all.md) ; zoom max par mode et fond Satellite Esri inchangés) |
| [0017](0017-libelles-quartiers-en-double.md) | Libellés de quartiers en double : masquer le libellé Drive là où OpenStreetMap labellise déjà (Plan, zooms 12–16) | Remplacée (partiellement — table renommée `NEIGHBORHOOD_CARTO_LABEL_MIN_ZOOM` et recalibrée pour CARTO dark_all, PK5 retiré, borne haute par quartier : voir [0021](0021-fond-plan-carto-dark-all.md)) |
| [0018](0018-poi-grands-lieux-bars-restaurants.md) | POI : grands lieux, bars, grands restaurants (façon Uber) — 16 lieux vérifiés, tier resserré bars/restaurants (z15/z16), règle anti-double OSM appliquée aux lieux (`osmLabelMinZoom`) | Acceptée |
| [0019](0019-nouvelle-palette-nuit-violette.md) | Nouvelle palette « Nuit violette » : rose vif #FF4D8D / corail #FF5F6D / sarcelle #2FD6C8 / orange #F5A623 sur fond violet-nuit #191432 (couleurs mesurées sur la capture de référence), anciens jetons `or` / `gold` / `cyan` supprimés ; carte Plan OSM claire inchangée | Acceptée |
| [0020](0020-compte-admin-uniquement.md) | Compte admin = admin uniquement : troisième rôle séparé (drapeau `is_admin` existant, aucun changement de schéma) — verrous serveur 403 `admin_not_allowed` (demande de course, bascule de rôle, mise en ligne, vérification, propositions, places), exclusion des listes et compteurs chauffeurs/passagers (/admin, /admin/live), UI admin (redirection `/` → /admin, bascule masquée, « Devenir chauffeur » bloqué), migration v2.45 (3 triggers ligne, non exécutée) | Acceptée |
| [0021](0021-fond-plan-carto-dark-all.md) | Fond Plan CARTO dark_all : la carte prend la palette « Nuit violette » (sombre natif, pas de filtre CSS) — `dark_all` choisi plutôt que `dark_nolabels` (noms de rues visibles), clé API CARTO gratuite obligatoire (`NEXT_PUBLIC_CARTO_API_KEY`, sinon filigrane), table anti-double recalibrée d'après le style (PK5 retiré, Akanda borne 14), attribution « © OpenStreetMap contributors © CARTO », correctif de l'accumulation de l'attribution à la bascule ; lisibilité réelle et doubles sur tuiles réelles à confirmer en live après push | Acceptée |
