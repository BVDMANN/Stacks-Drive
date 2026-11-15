# ADR 0028 — Structure « Bolt, en mieux » : navigation basse, écran Activité, accueil réorganisé + couverture maximale (rues, épiceries, carte sans ambiguïté)

**Statut :** Acceptée (v2.51, local, en attente de push)
**Date :** 15/11/2026

## Contexte

Le 15/11, le propriétaire a envoyé trois captures de SON propre compte Bolt (accueil, Activité, Compte) et demandé, après explication, « Azy en mieux » (~11h13) : construire la structure inspirée de Bolt, mais EN MIEUX, dans le style Drive. Ce que Bolt a et que Drive n'avait pas : une navigation basse persistante, un écran Activité avec mini-carte d'itinéraire + « Réserver », une entrée « Trajets planifiés » visible, des adresses récentes, une page Compte en liste groupée.

Le même jour, trois précisions ont élargi le lot à la carte elle-même :

1. ~11h14 — couverture maximale : « Tous quartiers toutes les rues tout pour la route au max » + « Tous les coins recoins » — tout Libreville doit être trouvable et routable : tous les quartiers, toutes les rues, tous les recoins.
2. ~11h15 — épiceries : « Épicerie tout déclarés sur map doit y être collé quelque soit le quartier il y'a solution » — TOUTES les épiceries de Libreville épinglées sur la carte, dans tous les quartiers ; la solution, c'est les données OpenStreetMap.
3. ~11h15 — principe directeur : « Une carte complète au max pour déplacement sans crainte et ni ambiguïté. » On sait toujours où on est, où on va, et par où on passe — sans se perdre, sans confondre deux lieux.

Contrainte : rien ne doit être inventé — ni rue, ni quartier, ni coordonnée, ni épicerie. Les captures Bolt montrent les adresses et courses personnelles du propriétaire : elles ne sont reprises nulle part (ni code, ni docs, ni captures de test).

## Décision

### 1. Navigation basse persistante (3 onglets)
`components/shared/BottomNav.tsx` (client, `usePathname`) : Accueil `/`, Activité `/activite`, Compte `/compte`. Verre nuit à liseré + faisceau, onglet actif = pastille violette #A134F5, icônes Drive (`DriveHome`, `DriveHistory`, `DriveUser`). Visible UNIQUEMENT sur `/`, `/activite`, `/compte` (et `/mes-courses`, qui redirige) — cachée partout ailleurs (admin, connexion, inscription, courses, suivi, tableau de bord, devenir-chauffeur, aide, pages légales) et sur écran large. Safe-area iOS respectée. Le bas des pages est réservé (`PageShell`, feuille d'accueil). La barre ne contourne rien : la règle 2 (switch verrouillé sans compte chauffeur) est intacte.

### 2. Écran Activité (`/activite`) — `/mes-courses` redirige
`/mes-courses` devient une redirection vers `/activite` (les anciens liens continuent de marcher) ; `/activite` est ajouté aux préfixes protégés du middleware. L'écran reprend les mêmes données et la même logique de sections que `/mes-courses` (En cours / Planifiées / Historique, `ScheduledRideActions`, `FavoriteButton`, reçu, badges, fidélité) dans le langage v2.52.

- **Carte héro** = la course la plus récente (non répétée dans les sections). Mini-carte RÉELLE Drive (Leaflet non interactif, tuiles CARTO dark_all, même URL/clé que la carte principale) : itinéraire **routier OSRM** via `/api/route` quand les coordonnées existent, repli ligne droite sinon — jamais de fausse carte. Marqueurs étiquetés distincts (« Départ · quartier » sarcelle / « Arrivée · quartier » rose), pastille « X km · Y min » (distance/durée réelles de la course quand elles existent, sinon estimation via `/api/estimate` préfixée « ≈ », jamais inventée).
- **« Ajouter une note »** (course terminée) → `/courses/[id]#avis` (ancre ajoutée à la section avis) — s'appuie sur les notes 2 sens v2.30.
- **« Réserver »** (NOUVEAU) : vrai `POST /api/rides` avec les champs d'origine (pickup, destination, rideType, vehiclePreference, paymentMethod, comfort, seats, unpavedRoad, pickupPoint/destinationPoint avec leur quartier — jamais de prix calculé côté client) ; pendant l'envoi, le S qui se remplit (`LogoLoader`) ; erreur = message exact du serveur ; succès → redirection vers la nouvelle course.
- Courses annulées affichées à 0 FCFA avec le statut « Annulée ».

### 3. Accueil réorganisé
Deux grandes cartes en verre nuit à liseré avec voitures dessinées Drive : « Trajets » (commander) et « Trajets planifiés » (vraie entrée vers les courses planifiées v2.30 — sous-titre = nombre RÉEL de courses planifiées quand l'utilisateur est connecté, sinon « Réserver à l'avance », jamais de chiffre inventé). Barre de recherche avec bouton « Plus tard » (active le mode planification existant + focus sur le champ date/heure). **Adresses récentes** sous les lieux enregistrés : destinations distinctes de l'historique réel (`getRecentDestinations`, plus récentes d'abord, avec compteur), icône horloge, ETA OSRM réelle depuis le départ courant quand il est connu (même pattern que `FavoritePlaceRow`, repli, jamais de chiffre inventé), 1 tap = définir comme destination.

### 4. Compte restructuré (réorganisation, 0 suppression)
Liste groupée en haut, façon Bolt, langage v2.52 (lignes icône Drive + libellé + chevron, ancres vers les cartes) : Profil (sous-titre = e-mail réel de la session — l'état de confirmation e-mail n'est PAS exposé par `getSessionUser`, donc aucune mention d'état inventée), Paiement (« Espèces · Airtel · Moov »), Aide, Sécurité, Lieux sauvegardés, Paramètres, et « Devenir chauffeur » ajouté (« Gagner en conduisant », il manquait). En dessous, TOUTES les cartes existantes sont conservées dans le même ordre (en-tête profil + 4 boutons ronds, fidélité 10e course, paiement, signalement carte, `ProfileForm` `#parametres` avec `#adresses`, sécurité SOS 112 + contacts, informations, tutoriel, vérification chauffeur, aperçu historique → `/activite`).

### 5. Recherche rue par rue (couverture maximale)
Nouvelle route serveur `GET /api/search-address` : proxy **Photon** forward search (photon.komoot.io, gratuit, sans clé), bbox Grand Libreville, limit 8, cache serveur 10 min, espacement 1,1 s entre appels amont, timeout 5 s, validation zod, repli propre (`{ ok: true, results: [], source: 'none' }`). Fusion dans `DestinationSearch` : quartiers et POI locaux D'ABORD (ordre conservé), puis section « Rues & adresses » (nom de rue + type + district + distance/temps depuis le départ). N'importe quelle rue de Libreville tapée au clavier doit donner un résultat. Sélection d'une rue → `TripPoint` { lat, lng, neighborhood = quartier Drive le plus proche (haversine sur `NEIGHBORHOOD_COORDS` — c'est ce qui fait passer la validation `POST /api/rides`), address = nom de rue, source: 'place' }. Vérifié de bout en bout en dev : recherche « rue du bord de mer » → 3 résultats ; sélection → estimation OSRM 4,9 km, ~7 min, Groupe 950 FCFA. L'estimation routière OSRM et le guidage fonctionnent depuis/vers n'importe quel point trouvé, pas seulement les quartiers.

### 6. Quartiers : 70 → 75 nommés (+ « Autre »)
Recoupement Photon des 70 quartiers : 46 match, 20 sans feature `place` dans Photon (conservés sur leurs sources antérieures), 2 match-far (Owendo, Bizango — conservés), 2 variantes d'orthographe (Nkembo → « N'kembo », PK6 → « Bassin du PK5 »). **Ajoutés (coordonnées Photon exactes)** : Cité de la Caisse, Lalala-Droite, Plaine Niger, Baie des Rois, Ancien Sobraga. Non ajoutés (quasi-coïncidents) : Cité Damas (~140 m de Damas), Akémindjogoni (~130 m de Mont-Bouët), Vallée Sainte-Marie (~250 m de Sainte-Marie). **Divergence signalée, NON tranchée dans le code : Bikélé, 2,16 km entre la position de l'appli et Photon — à trancher avec le propriétaire.**

### 7. Épiceries OSM sur la carte (31 points, couverture partielle)
`scripts/fetch-epiceries.mjs` (relançable, documenté dans son en-tête) interroge l'API **Overpass** (zone Grand Libreville, `shop=supermarket / convenience / grocery`) et génère `lib/epiceries.ts` — la carte ne dépend pas d'Overpass à chaque chargement. **Overpass est INJOIGNABLE depuis la VM de dev (HTTP 406 via le proxy, miroirs refusés) : le repli Photon (recherche par nom) a été utilisé — couverture PARTIELLE (31 points : 7 Carrefour Market, 16 Cecado, Casino, Géant CKdo, Marina Market, MS Market, OKIRA Market, Supermarché PK12, Epicerie ETS et frères, Epicerie Gondjala — noms/coords/rues OSM réels). Relancer le script depuis un poste avec accès Overpass pour viser l'exhaustivité.** Nouvelle catégorie POI `epicerie` (icône devanture dessinée Drive, lime #A3E635), pictogrammes dès z15, libellés dès z16 (comme bars/restaurants), dédupliquée avec les 59 POI existants (1 écartée à 25 m d'un POI existant), cliquable (fiche + estimation) et trouvable en recherche. **Total POI : 59 → 90 lieux.** `scripts/sync-docs.mjs` compte désormais aussi les épiceries (le spread `...EPICERIES.map(...)` dans `lib/pois.ts` ne porte aucun `name: '` littéral — le comptage direct les ratait).

### 8. Carte sans ambiguïté (critères d'acceptation)
- **Zéro ambiguïté dans les noms** : deux lieux/rues au même nom sont distingués (type + quartier/district + rue dans la recherche ET dans les fiches) ; déclinaison des libellés POI (seuils z15/z16, tolérance 64 px x / 16 px y, pictogramme conservé) : 0 chevauchement libellé-libellé constaté aux zooms 12–16 dans la vue par défaut (30/31 libellés épicerie visibles à z16, 1 masqué par la déclinaison, voulu). Restes pré-existants, hors déclinaison POI : à z14, des glyphes POI couvrent partiellement 2 libellés de quartiers (lisibles) ; à z12, 2 libellés partiellement masqués par les marqueurs chauffeurs **démo** (retirés avant le lancement).
- **Trajet incontestable** : épingles Départ/Destination distinctes + **étiquettes permanentes** (« Départ : … », « Destination : … »), itinéraire rose #FF4D8D, distance + durée affichées.
- **Position toujours claire** : « Vous êtes ici · … » permanent quand on est dans la zone ; fond CARTO `maxNativeZoom 19` ; rues nommées via les tuiles ; carte jamais vide ni illisible aux zooms 12–19.
- **Cohérence recherche ↔ carte** : un lieu trouvé en recherche est retrouvé sur la carte au même endroit (sélection rue/POI → épingle exacte + focus zoom 16).
- **Correctif découvert en vérifiant (bug pré-existant, bloquant)** : tant qu'un trajet était défini, aucun zoom/déplacement manuel ne tenait — l'effet d'épingles de `LibrevilleMap.tsx` appelait `fitBounds` à chaque rendu (cause : `pickup`/`destination`/`radarCenter` passés en objets littéraux recréés à chaque rendu dans `HomeScreen.tsx`). Correctif : `pickupPoint` / `destinationPoint` / `radarCenterPoint` mémoïsés (`useMemo`) — le cadrage trajet à la sélection est conservé (il ne se déclenche plus que quand le trajet change vraiment). Correctif lié : les pastilles d'épingles étaient écrasées par `.map-tooltip` — sélecteur renforcé en `.leaflet-tooltip.map-pin-label` dans `globals.css`.

## Conséquences

- `/mes-courses` n'existe plus comme écran (redirection) — tous les liens internes pointent désormais vers `/activite`.
- La recherche de destination dépend désormais de Photon en plus des données locales (même discipline que le géocodage inverse v2.47 : proxy serveur, espacement, cache, repli propre) ; sans Photon, les rues ne remontent pas mais les quartiers/POI locaux fonctionnent toujours.
- Les épiceries sont des données OSM figées à la construction : un rafraîchissement (`node scripts/fetch-epiceries.mjs`) est nécessaire pour suivre les ouvertures/fermetures ; l'exhaustivité exige un poste avec accès Overpass.
- `docs:sync` lit désormais `lib/epiceries.ts` en plus de `lib/pois.ts` pour le nombre de lieux.
- Aucune migration, aucun nouveau cron, aucune nouvelle dépendance, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes.

## Alternatives écartées

- Google Maps pour la mini-carte de l'écran Activité — fond CARTO dark_all, identité Drive.
- Image statique pour la carte héro — vraie carte Drive, itinéraire OSRM réel.
- Overpass appelé à chaque chargement de carte — import à la construction, relançable.
- Inventer les épiceries ou rues manquantes pour « compléter » la couverture — jamais : ce qui n'est pas dans OSM/Photon n'apparaît pas.
- Bolt Plus (abonnement), Promotions / codes promo, Profil familial, Profil professionnel / facturation B2B — interdits par les règles actuelles, non construits.
