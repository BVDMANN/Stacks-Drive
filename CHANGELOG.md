# CHANGELOG — Stacks Drive

Historique des versions, rédigé à partir de l'historique du README et
de `SETUP.md`. Ce fichier décrit des versions **livrées** (en ligne ou
en local en attente de push) — jamais un plan. Les entrées ne sont pas
réécrites a posteriori : une version remplacée (ex. v2.9, remplacée par
v2.11) le reste, avec la mention.

Légende : **en ligne** = déployé sur https://stacks-drive.vercel.app ;
**local** = en attente de push et, le cas échéant, d'exécution de la
migration associée (voir le tableau des migrations dans le README).

## v2.46 — 15/11/2026 (local)

Carte Plan : fond sombre CARTO dark_all aux couleurs « Nuit violette » (demande du propriétaire, 15/11 ~07h44 : « La carte à mes palettes de couleur demandées » — la carte elle-même prend sa palette). Le fond Plan passe d'OpenStreetMap clair (v2.41) à CARTO `dark_all` (`basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`, sous-domaines `abcd`, `{r}` = `@2x` sur retina) : **sombre natif, AUCUN filtre CSS sur les tuiles** (le filtre `.map-tiles-dark` qui lavait les détails reste retiré — la demande ne change pas l'exigence de lisibilité du 14/11, elle exige un vrai fond sombre détaillé). **Variante choisie : `dark_all` plutôt que `dark_nolabels`** — `dark_all` imprime les noms de rues (grandes artères dès z13, primaires z14, secondaires/tertiaires z15, rues secondaires z16, desserte z17) et les noms de lieux ; `dark_nolabels` n'imprime aucun nom, ce qui est inacceptable pour une appli de course (on s'oriente aux noms de rues). **Clé API CARTO obligatoire** (documentation officielle, dépôt CartoDB/basemap-styles : « Raster basemaps require an API key. Requests without a key are served with an "API key required" watermark. ») : sans clé, CARTO sert une tuile filigranée au lieu de la carte — clé gratuite (5 M de requêtes/mois hors commercial, 1 M en commercial, https://carto.com/basemaps/apikey/), configurée par `NEXT_PUBLIC_CARTO_API_KEY` (`.env.local` / Vercel, voir `.env.example` et SETUP.md §1) ; **à créer par le propriétaire après le push, avec redéploiement** — sans elle le fond Plan est inutilisable. **Teinte violette :** les tuiles CARTO sont quasi noires (#090909), pas violettes — la palette est portée par les surcouches (libellés Drive, POI, ligne d'itinéraire rose, marqueurs — déjà en place depuis la v2.44) et par le fond du conteneur `.leaflet-container`, passé en #191432 (`night-950`) ; un vrai fond violet demanderait un style vectoriel personnalisé (lot ultérieur possible, non implémenté). **Avertissement lisibilité (lu dans le style, pas deviné) :** dark matter est un fond « doux » conçu pour porter des données — libellés de lieux #444 (~2:1 sur #090909), libellés de rues #333 (~1,6:1), parcs #090909 (invisibles), bâtiments #000 ; l'aperçu officiel du style ne contient que 51 couleurs, luminance max 59/255. Les noms de rues existent mais sont très discrets : **la lisibilité réelle sur téléphone, en plein jour, reste à juger en live après push** — plan de repli : retour au fond OSM clair (v2.41) ou lot vectoriel personnalisé. **Table anti-double recalibrée d'après la définition publique du style** (dépôt CartoDB/basemap-styles, `labels.mss` : city z8–14, town z9–16, village/suburb z12–16, neighbourhood z13–17, aucune règle pour `quarter`) — **approximation explicite, à confirmer en live** : `NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM` devient `NEIGHBORHOOD_CARTO_LABEL_MIN_ZOOM` (56 entrées) + nouvelle table `NEIGHBORHOOD_CARTO_LABEL_MAX_ZOOM` (borne haute par quartier, défaut 16) ; **PK5 retiré** (`place=quarter`, CARTO ne labellise pas les `quarter` — le libellé Drive est le seul nom) ; **Akanda borne haute 14** (`place=city`, règle city z8–14) ; 15 quartiers non reclassés par Photon gardent le masquage v2.42 par prudence ; zooms minimums v2.42 conservés (mêmes données OSM sous CARTO). Conséquence : en Plan, 6 / 11 / 17 libellés Drive aux zooms 12 / 13 / 14, 14 aux zooms 15–16 ; Satellite 12 / 27 / 69, inchangé. **POI :** champ `osmLabelMinZoom` devient `cartoLabelMinZoom` — CARTO ne labellise que parcs, stades, cimetières et attractions : champ retiré de Park Inn by Radisson, Rond-Point de la Démocratie, Institut Français du Gabon et Lycée National Léon Mba ; seul le Palais des Sports garde un champ (16, approximation). **Attribution :** texte exact « © OpenStreetMap contributors © CARTO » (pied de page + contrôle de carte) ; politique d'usage CARTO : attribution obligatoire, tuiles directes OK dans le forfait gratuit. **Correctif fait dans ce lot :** l'attribution ne s'accumule plus après Plan → Satellite → Plan (l'ordre était `changer l'attribution → retirer → remettre` ; Leaflet retirait la nouvelle attribution jamais affichée — désormais `retirer → changer → remettre`). Satellite Esri inchangé (plafond 18), plafond Plan 19 conservé, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes. **Limite de vérification (environnement) :** le proxy de la VM intercepte les tuiles et renvoie un contenu fixe par hôte (OSM toujours 6 725 o / md5 8e8d1ff4 ; CARTO `dark_all`/`dark_nolabels` toujours 2 513 o / md5 df9307c7, identiques pour Paris et Libreville) — un HTTP 200 ne prouve que l'hôte répond, jamais le contenu d'une tuile ; les tuiles ne chargent pas non plus dans le navigateur de la VM. Rien n'a donc été prétendu vérifié sur des tuiles réelles ; la réserve vaut aussi pour la vérification curl « 9 md5 distincts » de la v2.41 (mesurée le 14/11 quand curl rapportait encore des contenus variés — plausible, mais non refaisable depuis cette VM). Vérifié en local : `npm run build` exit 0, `npm run docs:check` OK (35 blocs), rendus mobiles 390×844 (DOM : URL `dark_all`, attribution exacte, libellés Drive, 0 double dans le DOM, 59 POI, bascule Plan/Satellite). **Reste après push :** clé CARTO + vérification live sur téléphone (lisibilité des rues, doubles, attribution, bascule) — voir ADR 0021. ADR 0021.

## v2.45 — 14/11/2026 (local)

Compte admin = admin uniquement (demande du propriétaire, 14/11 ~22h31 : « bref le compte admin est juste admin hein pas chauffeur pas client »). Le compte admin (`is_admin = true`, rôle « passager » en base) est un troisième rôle, séparé : il ne peut agir NI comme chauffeur NI comme passager. **Verrous serveur (même logique que la règle 2 — jamais l'UI seule)** : POST /api/rides rejette la création de demande de course pour un admin (403 `admin_not_allowed`, avant le contrôle de rôle — le rôle en base de l'admin est « passager ») ; GET /api/rides?scope=incoming rejette l'admin (il ne reçoit jamais de proposition) ; PATCH /api/profile rejette pour un admin toute bascule de rôle, toute mise en ligne et tout champ chauffeur (véhicule, places, zone) — la branche admin de vérification des chauffeurs (driverId + verificationStatus) reste autorisée, c'est son travail ; POST /api/verification, POST /api/proposals et /api/driver/seats (GET + PATCH) rejettent explicitement l'admin. **Listes et compteurs** : `getOnlineDrivers`, `getPendingVerifications` et `getAdminStats` excluent l'admin (`.neq('is_admin', true)`) — l'admin n'apparaît jamais dans les listes de chauffeurs et n'est jamais compté comme chauffeur dans /admin ; `getLiveSnapshot` (/admin/live) exclut l'admin des listes chauffeurs ET passagers (compteurs chauffeurs / passagers / en ligne) et de l'événement d'inscription du flux ; `searchLivePeople` ne renvoie plus l'admin dans « Les gens ». Le compteur `usersTotal` de /admin/live compte toujours tous les comptes (l'admin EST un compte — ce n'est pas un compteur de rôle). **Interface** : l'accueil `/` redirige l'admin vers /admin (il voit l'admin, pas le flux passager) ; la bascule Passager / Chauffeur est masquée dans l'en-tête pour l'admin ; /devenir-chauffeur montre à l'admin un rappel (« ce compte est le compte administrateur ») et masque les deux boutons « S'inscrire en chauffeur » ; /tableau-de-bord montre à l'admin le même rappel avec un lien vers /admin ; « Mon compte » affiche le badge « Compte admin » (au lieu de « Compte passager ») ; la feuille de demande refuse aussi côté client (`HomeScreen`). **Aucun changement de schéma** : le drapeau `is_admin` existant est la seule source de vérité — aucun e-mail ni nom codé en dur, dans le code comme dans les docs. **Migration `supabase/migration-v2.45-admin-only.sql` écrite, NON exécutée** (à exécuter une seule fois dans le SQL Editor, après approbation du push) : 3 triggers niveau ligne, idempotents — un compte admin ne peut pas devenir chauffeur ni se mettre en ligne (`profiles`), ne peut pas commander de course (`rides`), ne peut pas proposer de prix (`ride_proposals`) — ils ferment le contournement direct via PostgREST, comme le trigger de la règle 2 (v2.17). `npm run build` exit 0, `npm run docs:check` OK (35 blocs). Vérification sans session réelle (pas de base locale) : rejets prouvés au niveau du code (gardes + tests statiques), rendu mobile 390 px vérifié sur les pages publiques ; le rejet en live avec une session admin réelle reste à faire après le push (voir ADR 0020). Aucun nouveau cron, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes. ADR 0020.

## v2.44 — 14/11/2026 (local)

Nouvelle palette « Nuit violette » (demande du propriétaire, 14/11 ~22h29, sur la base d'une capture de référence : « Cette palette de couleur est super va sur cette base change », direction confirmée ~22h31 : néon rose vif sur nuit violette, style néon nocturne assumé). **Couleurs mesurées sur la capture, pas devinées** (échantillonnage par zones en Python/PIL, médiane des pixels filtrés par teinte sur `IMG_3757.jpeg`, image 1320×2714) : fond violet-nuit médiane #191432 (buckets dominants #101030) ; ligne d'itinéraire rose médiane #EF7E82, buckets #E06090 / #E07090 → accent retenu **#FF4D8D** ; pastilles corail médiane #EB5E71, buckets #E05070 → **#FF5F6D** ; maison sarcelle médiane #65CFCF, buckets #60C0C0 → **#2FD6C8** ; jauge orange médiane #F3A64E → **#F5A623**. Nouveaux jetons Tailwind (`tailwind.config.ts`) : `night` 950 #191432 / 900 #201646 / 800 #2A1D55 / 700 #352463 / 600 #42307A, `rose` 100 #FFD9E8 / 300 #FF7EB0 / 500 #FF4D8D / 600 #E8357A / 700 #D6336C, `corail` #FF5F6D, `sarcelle` #2FD6C8, `sunset` #F5A623 ; les anciens jetons `or` / `gold` / `cyan` sont supprimés et toutes leurs occurrences renommées (44 fichiers, classes Tailwind + hex + rgba + commentaires, y compris `PremiumButton` variante `or` → `rose`). L'or #FFC700 / #FFD60A est remplacé partout par le rose comme accent principal : boutons et CTA (texte sombre #17112E sur #FF4D8D, contraste 5,8:1 — le blanc sur rose ne fait que 3,1:1), ligne d'itinéraire OSRM (halo + trait #FF4D8D, `components/map/LibrevilleMap.tsx`), marqueurs chauffeurs (dégradé rose #FF7EB0 → #FF4D8D → #D6336C, anneau sarcelle), point de départ, épingles, shimmer de chargement du prix, confettis, toasts, feuille, bandeau chauffeurs, PIN, écrans de course. Bars v2.43 recolorés dans la palette : bar #f9a8d4 → rose clair #FF7EB0, restaurant #a3e635 → corail #FF5F6D (`lib/pois.ts` + `styles/globals.css`, mêmes valeurs des deux côtés) ; station-service #fb923c → orange #F5A623, pharmacie et port #22d3ee → sarcelle #2FD6C8. **La carte ne change pas** : fond Plan OpenStreetMap CLAIR inchangé (v2.41) — aucun filtre sombre réintroduit (`.map-tiles-dark` reste retiré, tuiles `tile.openstreetmap.org`, aucun `filter` sur le panneau de tuiles, vérifié dans le DOM) ; seule la ligne d'itinéraire et les surcouches prennent la nouvelle palette. Contrastes vérifiés : blanc sur #191432 = 17,7:1 ; sarcelle #2FD6C8 sur #191432 = 9,8:1 ; corail #FF5F6D sur #191432 = 6,0:1 ; rose clair #FF7EB0 sur #191432 = 7,5:1. Vérifié sur captures mobiles 390×844 avant/après (accueil, connexion, devenir-chauffeur — `/tmp/v244-before-*.png` / `/tmp/v244-after-*.png`) : boutons, feuille, bandeau chauffeurs, marqueurs et POI lisibles ; l'écran de course et le PIN n'ont pas pu être rendus sans session (vérifiés par le code : mêmes jetons `rose` / `corail` / `sarcelle`). `npm run build` exit 0, `npm run docs:check` OK (35 blocs). Aucune migration, aucun nouveau cron, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes (barre de chargement partout, switch passager → chauffeur impossible sans compte chauffeur). ADR 0019.

## v2.43 — 14/11/2026 (local)

POI : grands lieux, bars, grands restaurants, façon Uber (demande du propriétaire, 14/11 ~22h07 : « Répertorie les grands coins, les bars, les grands restaurants sur la carte avec des points comme Uber au final »). Inventaire des 43 lieux existants (`lib/pois.ts`) : 6 supermarchés, 6 marchés, 6 stations-service, 6 pharmacies, 3 hôtels, 3 santé, 2 stades, 3 lieux publics, 2 gares, 1 aéroport, 2 ports, 1 musée, 2 plages. **16 lieux ajoutés, tous vérifiés — aucun inventé, aucune position devinée** (leçon v2.16) : 9 restaurants (Roma Restaurant & Hotel, Bantu Restaurant, Le Wap, Restaurant Okande, Amaya Restaurant, D'Ici et D'Ailleurs, L'Emir, Le Phare Du Large, L'Odika), 2 bars (Yoka Lounge, Luxury Lounge), 4 grands lieux (Palais des Sports, Rond-Point de la Démocratie, Institut Français du Gabon, Lycée National Léon Mba) et 1 grand hôtel (Park Inn by Radisson) — **59 lieux au total**. Sources de vérification, lieu par lieu (ADR 0018) : recherche de lieux (nom exact + coordonnées, place_id), Nominatim / OpenStreetMap (L'Odika, Palais des Sports, Rond-Point de la Démocratie, Institut Français, Lycée National Léon Mba, Luxury Lounge) et Wikipédia (Palais des Sports, coordonnées recoupées par 3 sources). **Lieux écartés comme incertains (non ajoutés)** : Le Pili Pili (nom « Pili Pili Broch » dans la fiche lieu, adresse Mont-Bouët contre coordonnées Centre-ville — incohérence non résolue), La Dolce Vita, Café de la Paix, Le Patio, La Voile Blanche, La Guinguette, Ovima by Mayena, Chez Tantine Bijou, Le QG, Amigo's (fiche lieu incohérente : catégorie « Health Clinic », coordonnées à 1,5 km du Méridien alors que les avis disent « en face du Méridien »), Cote Plage Bar, Le Piano Bar et Le Tropicana Nightclub (sans coordonnées propres — dans les hôtels Radisson Blu et Tropicana déjà marqués), HYPE BAR LOUNGE, The Spot, Le Pub (Park Inn), Stade de Nzeng-Ayong (aucun objet stade trouvé, seulement « Avenue du Stade »), Place de l'Indépendance (Nominatim renvoie un autre lieu, Place des Exécutés d'Hollando), Église Saint-Michel de Nkembo, Arboretum Raponda Walker. Nouvelles catégories `bar` (rose, verre à cocktail) et `restaurant` (lime, couverts) avec pictogrammes distincts et mini-carte d'info existante (nom, catégorie, quartier, estimation, « Y aller »). **Carte non surchargée** : bars et restaurants ont un tier resserré — pictogrammes dès le zoom 15 (au lieu de 14), libellés dès le zoom 16 (au lieu de 15), avec leur propre couche (`poiDenseLayer`, marqueurs `dense`). **Règle anti-double v2.42 appliquée aux lieux** : nouveau champ `osmLabelMinZoom` (`lib/pois.ts`) — premier zoom où OSM imprime déjà le nom du lieu, vérifié tuile par tuile par curl (z15, z16, z17, 32 tuiles lues visuellement) : Lycée National Léon Mba dès z15, Palais des Sports dès z16, Park Inn by Radisson / Rond-Point de la Démocratie / Institut Français du Gabon dès z17 ; les 11 autres nouveaux lieux ne sont labellisés par OSM ni à z16 ni à z17 (pas de champ). En Plan, le libellé Drive est masqué à partir de ce zoom (classe `label-osm` — le nom reste visible une fois, via la tuile) ; en Satellite, il s'affiche toujours. Vérifié sur captures mobiles 390 px : **aucun chevauchement sur les nouveaux lieux** — cluster Louis à z16 et z17 (les 4 libellés lisibles sans se toucher) et paire Amaya / Park Inn à z16 (119 m, libellés sur deux lignes différentes grâce au décalage diagonal). En revanche, les libellés pré-existants « Musée National du Gabon » / « Cathédrale Sainte-Marie » / « Pharmacie du Centre » se chevauchent encore à z16 au Centre-ville (antérieur au lot, déjà signalé en v2.39) — hors périmètre. Observation hors lot, non corrigée ici : le lieu existant « Radisson Blu Okoumé Palace » (0.398, 9.436, Centre-ville) est à ~3,7 km de l'hôtel réel (boulevard de Nice — confirmé par les fiches Amaya et Park Inn) ; à faire valider par le propriétaire. Aucune migration, aucun nouveau cron, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes. ADR 0018.

## v2.42 — 14/11/2026 (local)

Carte : fin des quartiers en double (signalé par le propriétaire le 14/11 ~22h07, depuis son téléphone — « Sur la carte, maintenant il y a du quartier en double »). Cause vérifiée, pas supposée : depuis la v2.41, le fond Plan est OpenStreetMap CLAIR (filtre sombre retiré) — les noms de quartiers qu'OSM affiche déjà sur ses tuiles sont redevenus lisibles, et les libellés Drive (70 quartiers, `lib/neighborhoods.ts`) se posaient par-dessus, à une position légèrement différente (le rendu OSM place le nom au centre de la zone, les coordonnées Drive sont des centres vérifiés) : chaque nom apparaissait deux fois. Preuve par curl le 14/11 : vraies tuiles OSM téléchargées (grilles 3×3, zooms 12 à 18 — Centre-ville, Angondjé, Owendo, PK12/Melen, côte nord, axe N1 est, nord du centre) et lues visuellement, croisées avec les objets `place` de la zone (Overpass, 126 objets) — 57 des 69 libellés Drive ont un doublon OSM (42 noms exacts + 15 variantes : « Aéroport » pour Aéroport Léon-Mba, « Akébé-Kinguélé » pour Kinguele, « Cité Damas » pour Damas, « Lalala-Gauche/Dakar/Droite » pour Lalala, « Nomba-Domaine » pour Nomba, « Mont Bouet » pour Mont-Bouët, « Carrefour Gros Bouquet » pour Gros-Bouquet…), avec le premier zoom d'apparition relevé nom par nom (z12 : Akanda, Owendo, Nzeng-Ayong, Bikélé, Essassa, Nkok… ; z13 : Sorbonne, Akébé, Oloumi, Batterie 4… ; z14 : Centre-ville, Glass, Louis, Charbonnages, PK5… — c'est au zoom d'ouverture 14 que le double se voyait le plus ; z15 : Mont-Bouët, Nkembo, Petit Paris). Les noms de quartiers OSM s'affichent de z12 à z16 et disparaissent à z17-18 (grilles z17 et z18 au Centre-ville vérifiées : noms de rues et de lieux uniquement). Correctif : nouvelle table `NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM` (`lib/neighborhoods.ts`, 57 entrées) — en Plan, le libellé Drive d'un quartier est masqué entre son zoom minimum OSM et 16, et réapparaît en dehors de cette plage ; en Satellite (tuiles Esri sans aucun libellé), les 69 libellés s'affichent comme avant. Résultat : chaque nom apparaît exactement une fois à tous les zooms, dans les deux modes — Plan : 6 libellés Drive au zoom 12, 11 au zoom 13, 16 au zoom 14, 12 aux zooms 15-16, 69 à partir du zoom 17 ; Satellite : 12 / 27 / 69. Les 12 quartiers qu'OSM ne labellise jamais (PK6, PK8, PK9, PK11, PK12, Melen, Diba-Diba, Sogara, Santa Clara, Barracuda, Cap Caravane, Bizango) gardent leur libellé Drive partout — « Bizango-Rail » (OSM) n'est pas Bizango (8 km d'écart), vérifié. Aucune donnée supprimée ni déplacée : coordonnées, tiers, listes de départ/destination et recherche inchangés — seul l'affichage est filtré. La bascule Plan/Satellite réapplique la règle immédiatement (sans attendre le prochain zoom). Aucune migration, aucun nouveau cron, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes. ADR 0017.

## v2.41 — 14/11/2026 (local)

Carte : fond Plan OpenStreetMap clair (filtre nuit retiré le 14/11 ~21h58, décision du propriétaire : « Retire le thème sombre là-dessus »), zoom max 19 en Plan (18 en Satellite) — décision initiale du propriétaire, 14/11 ~21h48 (« OSM + filtre nuit, thème sombre gardé »), révisée ~21h58. Le fond Plan Esri World Street Map est remplacé par les tuiles OpenStreetMap standard (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` — ordre `{z}/{x}/{y}`, inverse de l'ordre ArcGIS `{z}/{y}/{x}`) ; le filtre sombre `map-tiles-dark` est retiré de la couche Plan (carte claire, comme Skatta) ; le fond Satellite reste Esri World Imagery, intact. Attribution Plan : texte exact « © OpenStreetMap contributors » (lien copyright) ; attribution Esri gardée pour le Satellite uniquement — la bascule d'attribution suit le mode. Zoom max désormais par mode : Plan 19 (tuiles OSM z19 réelles partout dans la zone de service, vérifié par curl le 14/11 : grille 3×3 au Centre-ville, 9 tuiles HTTP 200, 4 157 à 10 812 o, 9 md5 distincts, 67 à 256 couleurs ; Akanda, Owendo et Melen HTTP 200 aussi), Satellite 18 (tuile grise « pas de données » au-delà, v2.18) — la carte règle son plafond à chaque bascule (`map.setMaxZoom`) pour que le Satellite ne zoome jamais dans l'agrandissement flou (v2.39). Politique d'usage OSM : attribution obligatoire, tuiles directes OK pour le lancement mais trafic de production lourd déconseillé — prévoir un fournisseur de tuiles ou l'auto-hébergement au lancement (même logique que le serveur OSRM démo de la v2.27). Aucune migration, aucun nouveau cron, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes. ADR 0016.

## v2.40 — 14/11/2026 (local)

Vue admin « En direct » (demande du propriétaire, 14/11 ~21h04) : une page /admin/live, réservée à l'admin, qui montre tout ce qui se passe en ce moment sur une seule page, pensée mobile d'abord (390 px, cartes, tiroirs plein écran). « En ce moment » : compteurs (utilisateurs, chauffeurs vérifiés / en attente / en ligne, courses actives, courses du jour, commission du jour et de la semaine depuis `driver_earnings`), chauffeurs en ligne (statut dérivé Vide / En course / Plein, places libres), passagers avec une course en cours, courses actives. Flux en direct : 30 derniers événements agrégés (inscriptions, demandes, propositions, acceptations, annulations, courses terminées, litiges, tickets, fraude, SOS, règlements, vérifications) — mise à jour par Supabase Realtime (`rides`, `ride_proposals`) avec sondage 15 s en repli (motif v2.24). « Les gens » : recherche (nom / e-mail / téléphone) + filtres (rôle, statut de vérification, en ligne) ; clic sur une personne → fiche complète (profil, historique des courses, gains / dette / points / dépôt côté chauffeur, fidélité côté passager, litiges, annulations, dernière activité visible). Clic sur une course → trace chronologique complète (demande → propositions → départ → arrivée / annulation → note). Honnêteté « qui est là » : aucune présence inventée — un passager « en ce moment » = une course active ; la dernière connexion n'existe pas en base (pas de client service-role, `auth.users` illisible) : la fiche affiche la « dernière activité visible » (dernière course ou dernier événement d'audit). Migration `supabase/migration-v2.40-realtime-admin.sql` à exécuter une seule fois (`profiles`, `disputes`, `ride_cancellations`, `verification_tickets`, `fraud_cases`, `audit_log` dans la publication `supabase_realtime` — sinon ces tables restent en sondage seul) ; sans elle, la page fonctionne. Aucun nouveau cron, `lib/commission.ts` intouchée, les 2 règles vérifiées intactes. ADR 0015.

## v2.39 — 14/11/2026 (local)

Carte : les contours ne se perdent plus en zoomant (bug signalé par
le propriétaire, 14/11 ~20h15, en testant sur mobile — « tu aurais dû
y penser »). Observation live (navigateur, 14/11 ~20h23) : en Plan,
dès le zoom 16 les rues secondaires s'estompent, à 18 le réseau
secondaire a presque disparu (fond olive uni, 1 seul libellé
minuscule), à 19-20 il ne reste que 2 à 4 artères aux contours flous ;
en Satellite, le zoom 20 est pixelisé (tuile native étirée, coutures
visibles). Cause : le plafond de zoom 20 (v2.18) faisait agrandir les
tuiles z18 ×2 à z19 et ×4 à z20 — l'agrandissement ne « garde » pas les
contours, il les détruit. Correctif : **plafond de zoom 20 → 18**,
dernier zoom RÉEL des deux modes (tuiles natives jusqu'à 18, vérifié
par curl le 14/11) — le bouton + se grise à 18, on ne peut plus zoomer
dans le flou. Second correctif, même observation : **feuille dépliée,
les contrôles de la carte ne disparaissent plus** — Recentrer,
Plan/Satellite et le compteur « chauffeurs autour de toi » s'effaçaient
(`opacity-0` + `pointer-events-none`) quand la feuille atteignait 58
dvh, et le clic sur Recentrer était refusé ; or ces pastilles sont en
haut de l'écran, jamais recouvertes par la feuille (58 dvh max, par le
bas) — le fondu ne servait qu'à épurer, au prix de la fonction. Elles
restent désormais visibles et cliquables en permanence. ADR 0014.
Points mineurs observés, non corrigés dans ce lot : à zoom 12-14,
quelques libellés de quartiers sont partiellement masqués par des
marqueurs chauffeurs / POI ; en Satellite zoom 12, la mosaïque de
tuiles montre des coutures (teintes différentes, fond Esri). Aucune
migration, aucun nouveau cron, `lib/commission.ts` intouchée.

## v2.38 — 14/11/2026 (local)

Annulation sans motif + erreurs précises (décision du propriétaire,
14/11 ~20h20, en testant sur mobile) : on peut désormais annuler une
course sans se justifier. « Sans motif » est le choix par défaut dans
la modale d'annulation (un tap sur « Confirmer l'annulation » suffit) ;
la liste courte reste proposée et la précision libre est masquée quand
« Sans motif » est choisi. Côté serveur, le nouveau code `sans_motif`
est accepté (énumération zod dérivée de `CANCEL_REASONS`) et stocké
tel quel (`reason_code` = 'sans_motif', `cancel_reason` = « Sans
motif ») — l'historique distingue « pas de motif donné » de « Autre
raison » ; le message système à l'autre partie dit « sans motif
précisé ». En cas d'échec de l'annulation, c'est désormais le message
précis du serveur qui s'affiche dans la modale (ex. « Cette course ne
peut plus être annulée. ») — plus de générique « Annulation impossible
pour le moment » qui cache la cause. Appliqué aux trois points
d'annulation : page de course (`RideActions`), courses planifiées
(`ScheduledRideActions`) et accueil (`HomeScreen`). ADR 0013. Aucune
migration (la colonne `reason_code` reste NOT NULL, le code est une
valeur valide), aucun nouveau cron, `lib/commission.ts` intouchée.

## v2.37 — 14/11/2026 (local)

Correctif bloquant — la demande de course ne pouvait pas être créée :
chaque POST /api/rides échouait avec « Demande impossible pour le
moment » (erreur Postgres 23502, trouvée dans les logs Vercel :
`null value in column "departure_time" of relation "rides" violates
not-null constraint`, 3 occurrences le 14/11 à 19:35–19:37).
Cause : `departure_time timestamptz not null` est un reste du modèle v1
(schema.sql) — la migration v2 a supprimé `seats_total`,
`seats_available`, `vehicle_label`, `driver_name`, `is_demo` et
`payment_methods`, mais a oublié `departure_time`. Le modèle v2 ne la
remplit jamais (course immédiate : `created_at` ; planifiée :
`scheduled_at`) et aucun code ne la lit. Migration
`supabase/migration-v2.37-rides-departure-time.sql` : suppression de la
colonne (rien n'en dépend en production — la seule référence, une
politique RLS v1 sur `bookings`, a disparu avec `drop table bookings
cascade` en v2). Le log serveur inclut désormais aussi le code
d'erreur Postgres (`error?.code`) pour diagnostiquer plus vite. Aucune
autre colonne NOT NULL sans défaut ne manque à l'insertion (vérifié
colonne par colonne).

## v2.36 — 14/11/2026 (local)

Tutoriel passager non bloquant à l'arrivée (décision du propriétaire,
14/11/2026, en vérifiant le produit final) : la modale s'ouvrait en
plein écran 900 ms après l'arrivée et masquait tout — les gens
risquaient de se perdre. Désormais, au premier lancement, une petite
carte d'accueil en haut de la carte (sans voile, sans fond sombre —
la carte et la feuille restent visibles et utilisables) propose le
tutoriel ; il ne s'ouvre que si on touche « Voir le tutoriel ». Fermer
la carte (« Plus tard » / croix) vaut « vu » : elle ne revient pas.
La modale elle-même est inchangée pour les ouvertures volontaires
(« Revoir le tutoriel », « Mon compte »). ADR 0012. La formation
chauffeur est inchangée (elle s'ouvre après la création du compte,
pas à l'arrivée sur le site). Scripts remis à jour : la capture
passager-02 utilisait encore `selectOption` (cassé depuis v2.22 — la
combobox a remplacé le `<select>` ; désormais on tape le nom puis on
touche l'option) et `tuto:verify` attendait la modale plein écran à
l'arrivée (il attend désormais la carte d'accueil, puis l'ouverture
volontaire). Aucune migration, aucun nouveau cron.

## v2.35 — 14/11/2026 (local)

Retrait de la section « Points de prise en charge » de l'accueil
(décision du propriétaire, 14/11/2026, en vérifiant le produit final) :
la liste des 10 lieux (aéroport, marchés, stades, gares, université, CHU,
hôtel) affichait des montants avant même qu'un trajet soit défini —
l'estimation doit être générée à partir du vrai trajet (départ +
destination), jamais présentée comme des trajets prêts à prix
prédéfinis. Supprimés : composant `components/home/PickupPoints.tsx`,
rendu dans `HomeScreen.tsx` (et `handlePickupFromPoi`), données
`PICKUP_POINT_NAMES` / `PICKUP_POINTS` dans `lib/pois.ts`. Les lieux
restent sur la carte (43 POI, marqueurs cliquables) ; l'estimation
indicative reste dans les cartes Solo / Groupe une fois le trajet choisi
(ADR 0005 inchangée). ADR 0011. Captures des tutoriels refaites
(`npm run tuto:captures`). Aucune migration, aucun nouveau cron.

## v2.34 — 14/11/2026 (local)

Lot « Au-delà » : RideCheck maison (long arrêt > 5 min, déviation > 500 m de l'itinéraire OSRM, course anormalement longue — confirmation double, check-in passager « Tout va bien ? », alerte admin seulement sur « Problème » ou sans réponse sous 3 min, jamais de blocage chauffeur) ; enregistrement audio du trajet chiffré (AES-GCM, clé par course, envoyé uniquement en cas de litige, supprimé après 7 jours sans litige — limite : pas d'escrow complet de clé, la clé vit sur l'appareil) ; chauffeur favori (priorité 30 s depuis l'historique) ; courses sur le chemin du retour + filtre destination désactivable ; classe Confort (clim garantie, chauffeurs 4,5★ et plus, même prix que Solo, éligibilité vérifiée côté serveur) ; file d'attente virtuelle aéroport (premier arrivé, premier servi, exclusivité 60 s) ; arrondi du prix accepté à 50 FCFA près côté serveur (montant arrondi affiché avant acceptation) — **⚠️ À CONFIRMER PAR LE PROPRIÉTAIRE AVANT LE PUSH** ; parrainage doublé (parrain 2 000 pts, filleul 1 000 pts, toujours silencieux). Migration `supabase/migration-v2.34-au-dela.sql` à exécuter une seule fois. Vérification locale : `node scripts/verify-lot-v234.mjs`.

## v2.33 — 14/11/2026 (local)

Profondeur technique : documentation d'architecture
(`docs/ARCHITECTURE.md` — stack justifiée, modèle de données, modèle
de sécurité, modèle de menaces avec pointeurs vers le code),
`SECURITY.md`, décisions d'architecture (`docs/adr/`), `CONTRIBUTING.md`,
`CHANGELOG.md`, schéma d'architecture et flux de données dans le README,
commentaires du cœur métier (`lib/pricing.ts`, `lib/commission.ts`,
`lib/fare-guard.ts`, `lib/geo.ts`, dispatch, places, vérification).
Docs + commentaires uniquement : aucune logique métier modifiée, aucune
migration.

## v2.32 — 14/11/2026 (local)

Écran hors zone : quand la position est hors de la zone de service, la
carte reste sur Libreville avec un écran explicite ; liste d'attente
« préviens-moi » (table `area_waitlist` : e-mail unique insensible à la
casse, ville / pays en best-effort, consentement explicite ; RLS :
inscription par n'importe quel visiteur avec consentement, lecture admin
uniquement ; aucune coordonnée précise stockée). Migration
`supabase/migration-v2.32-out-of-zone.sql` à exécuter une seule fois.
Vérification locale : `node scripts/verify-lot-v232.mjs`.

## v2.31 — 14/11/2026 (local)

Carte zonée quartier : ouverture au zoom 14 (`MAP_INITIAL_ZOOM`), centrée
sur l'ancre (position GPS si dans la zone, sinon quartier de départ,
sinon Centre-ville) ; cercle périmètre de 5 km autour de l'ancre ;
« Me localiser » dans la zone de service (`SERVICE_BOUNDS`, Grand
Libreville) ; bornes fermes et zoom minimum 12. Aucune migration, aucun
nouveau cron. Vérification locale : `node scripts/verify-lot-v231.mjs`.

## v2.30 — Plancher P1 (local)

Notes dans les deux sens ; courses planifiées (30 min à 7 jours, envoi
~15 min avant, expiration 30 min après l'heure passée) ; lieux favoris
Maison / Travail ; heatmap de demande côté chauffeur (7 jours, sans
surge) ; messages rapides côté chauffeur ; re-vérification selfie
ponctuelle (max 5 chauffeurs par semaine, contrôle de présence d'un
visage uniquement, photo non conservée) ; gains détaillés par course et
export CSV ; export PDF / impression du reçu. Migration
`supabase/migration-v2.30-p1.sql` à exécuter une seule fois. Aucun
nouveau cron Vercel. Vérification locale : `node scripts/verify-lot-p1.mjs`.

## v2.29 — Lot F (local)

Réponses automatiques aux plaintes standard : réponse immédiate et
concrète, journalisée dans `audit_log`, sans litige ni e-mail ; escalade
en litige sur mot grave, montant contesté > 5 000 FCFA, sujet « Autre »
ou rejet de la réponse auto ; aucune compensation automatique. Nouvelle
entrée FAQ « Mon chauffeur est en retard, que faire ? ». Aucune
migration, aucun nouveau cron. Vérification locale :
`node scripts/verify-lot-f.mjs`.

## v2.28 — P0b (local)

ETA routière chauffeur → pickup puis destination (OSRM, recalculée quand
le chauffeur bouge d'environ 100 m ou toutes les 30 s ; repli vol
d'oiseau à 30 km/h) ; navigation guidée chauffeur (instructions virage
par virage en français, bouton « Ouvrir dans l'app Cartes »). Le prix ne
change pas. Aucune migration, aucun nouveau cron. Vérification locale :
`node scripts/verify-p0b.mjs`.

## v2.27 — Lot E (local)

Itinéraire routier OSRM tracé sur la carte (le prix ne change pas —
modèle au km sur la distance à vol d'oiseau) ; trafic communautaire
(signalements, expiration 30–60 min, mise en évidence dès 2
confirmations, anti-doublon 500 m / 10 min) ; zones sans chauffeur
(alerte après 2 min sans proposition, une seule alerte par demande).
Migration `supabase/migration-v2.27-traffic.sql` à exécuter une seule
fois. Aucun nouveau cron.

## v2.26 — Lot D (local)

Détection de fraude automatique (4 signaux : annulations en série 6+ /
40 %, vitesse impossible > 150 km/h, faux PIN répétés, téléphone
partagé) ; nettoyage RGPD (positions supprimées après 24 h, comptes
inactifs ≥ 12 mois comptés seulement) ; CI GitHub Actions
(`.github/workflows/ci.yml` : build + contrôle des docs). Migration
`supabase/migration-v2.26-fraud.sql` à exécuter une seule fois. Aucun
nouveau cron Vercel. Vérification locale : `node scripts/verify-lot-d.mjs`.

## v2.25 — Lot C (local)

Onboarding chauffeur autonome (bienvenue in-app, rappels dossier
incomplet à 48 h puis J+7) ; parrainage silencieux (code `SD-NOM-XXXX`,
1 000 points au parrain / 500 au filleul après vérification + 5 courses) ;
relances chauffeurs inactifs (max 1/semaine) ; rappel dépôt / dette au
plafond. Migration `supabase/migration-v2.25-drivers.sql` à exécuter une
seule fois. Aucun nouveau cron Vercel.

## v2.24 — Lot B (local)

Temps réel Supabase Realtime (propositions, demandes, messages ; sondage
en repli) ; FAQ in-app `/aide` ; alertes d'exception uniquement (5 faux
PIN, plafond de dette, cron en échec, erreur API répétée) ; e-mails
automatiques via Resend (bienvenue, récap hebdo, rappels de règlement —
dédupliqués en base). Migration
`supabase/migration-v2.24-realtime-emails.sql` à exécuter une seule fois.

## v2.23 — P0a (local)

Annulation propre (motif obligatoire, historique `ride_cancellations`,
fiabilité : signalement « À surveiller » à 3+ annulations et taux
> 25 %) ; écran « À payer : X FCFA » ; reçu détaillé ; SOS enrichi
(position + infos course préparées pour le 112) ; contacts de confiance
(max 5) et partage automatique du lien de suivi au départ ; PIN visible
dès le matching. Migration `supabase/migration-v2.23-p0a.sql` à exécuter
une seule fois.

## v2.22 (local)

Listes de quartiers triées par ordre alphabétique avec recherche
(insensible aux accents, à la casse et aux séparateurs) ; section
« Points de prise en charge » (10 lieux, estimation indicative Groupe /
Solo). Vérification : `npm run quartiers:verify`.

## v2.21 (local)

Tutoriels visuels réels : 6 étapes passager (premier lancement, rejouable)
et 6 étapes chauffeur (formation à l'onboarding, rejouable) — captures
des vrais écrans (`public/tuto/`, Playwright).

## v2.20 (local)

Confidentialité chauffeur : identité visible uniquement pendant le
matching ou une course acceptée / terminée ; marqueurs anonymes avant ;
téléphone jamais affiché ; `get_public_ride` minimal. Migration
`supabase/migration-v2.20-driver-privacy.sql` à exécuter une seule fois.

## v2.19 (local)

Places libres + statut chauffeur (Vide / En course / Plein) : pop-up des
places à la mise en ligne, matching Groupe (≥ 1 place libre) / Solo
(véhicule totalement vide), libération à la fin ou à l'annulation.
Migration `supabase/migration-v2.19-seats.sql` à exécuter une seule fois.

## v2.18 (local)

Périmètre « chauffeurs autour de toi » : vue et dispatch alignés sur un
rayon unique de 5 km (`DRIVERS_AROUND_RADIUS_KM`), élargissement à 25 km
après 30 s sans proposition.

## v2.17 — « Les 2 règles » (local)

Règle 1 : barre de chargement partout où il y a une attente. Règle 2 :
switch passager → chauffeur impossible sans compte chauffeur créé,
mise en ligne exige un compte vérifié — verrou côté serveur (PATCH
`/api/profile`, 403) **et** en base (trigger anti-escalade). Migration
`supabase/migration-v2.17-mode-rules.sql` à exécuter une seule fois.

## v2.16 (local)

Correctif libellés des quartiers : 56 quartiers repositionnés après
vérification croisée (Nominatim/OSM, ArcGIS/Esri, Photon, géométrie
routière OSRM, Wikipédia) ; ancre Centre-ville → Nzeng-Ayong figée
(Solo 1 500 / Groupe 950) ; 12 libellés au zoom 12, 27 au zoom 13, 69 au
zoom 14, 0 chevauchement mesuré.

## v2.15 (local)

Litiges in-app + règlements hebdo + rapport hebdo : dossier complet dans
/admin, décision admin tracée (ajustement dette / commission), relevé
hebdo chaque lundi (cron Vercel, `CRON_SECRET`), « J'ai payé » côté
chauffeur, validation en 1 clic. Migration
`supabase/migration-v2.15-disputes.sql` à exécuter une seule fois.

## v2.13

Estimation indicative du prix à partir d'une distance quelconque
(`estimateFareForDistance`, `lib/pricing.ts`) — utilisée par la
mini-carte d'info d'un lieu (POI).

## v2.12 (local)

Notifications pop-up de négociation (toasts in-app, auto-fermeture
~6 s) : nouvelle proposition, changement de prix, prix accepté,
contre-proposition. Lien « Mentions légales » dans la feuille d'accueil.

## v2.11 — 14/11/2026 (local)

Estimation indicative + prix convenu : les tarifs fixes de référence sont
supprimés — la plateforme ne définit plus aucun prix. Estimation au km
(Solo 500 + 210 FCFA/km, Groupe 300 + 135 FCFA/km, Moto ×0,6, planchers
550 / 400 FCFA) ; proposition libre du chauffeur, contre-proposition du
passager, prix figé à l'acceptation, jamais de surge ; garde-fou serveur
= bornes absolues 400–50 000 FCFA. Retrait de l'adresse personnelle et
de l'e-mail personnel des pages publiques.

## v2.10 (local)

Messagerie de course + suivi chauffeur en direct jusqu'au pickup
(position toutes les ~10 s, arrêt au pickup) + historique des courses.
Migration `supabase/migration-v2.10.sql` à exécuter une seule fois.

## v2.9 (local, remplacée par v2.11)

Tarif au km, option A hybride (Solo 450 + 215 FCFA/km, Groupe 250 + 120
FCFA/km, Moto ×0,6, planchers 550 / 400 FCFA) ; les 6 tarifs fixes de
référence sont conservés. **Remplacée par la v2.11 : les tarifs fixes
sont supprimés, l'estimation devient indicative.**

## v2.8 (local)

Carte densifiée : quartiers de 49 à 70, 3 tiers de libellés, lieux de 24
à 43, quartiers difficiles de 11 à 16 ; correction : tous les PK jusqu'à
PK12 inclus sont bitumés et normaux.

## v2.7 (local)

Carte « vivante » : fond Esri World Street Map assombri, anneaux cyan
autour des chauffeurs, lieux colorés par catégorie.

## v2.6 — 14/11/2026 (en ligne)

Quartiers à accès difficile (point de dépôt sur route bitumée,
supplément route non bitumée 800 FCFA, chauffeur libre d'accepter ou
non) ; 24 lieux affichés sur la carte. **Version en ligne au 14/11/2026**
(commit `65996054`).

## v2.5.1

Feuille de demande façon Uber : 3 positions (mini 15 %, aperçu 30 %,
pleine 58 %), bouton chevron toujours visible, bouton flottant doré en
position mini.

## v2.5

Icônes chauffeurs dorées ; quartiers de 20 à 49, avec libellés sur la
carte.

## v2.4

Vérification chauffeur automatisée (selfie + OCR de la pièce, décision
auto ou ticket admin par e-mail via Resend).

## v2.3

Prix baissés de 24 % (planchers Solo 550 / Groupe 400 FCFA) ; points
chauffeur (100 points/course, 10 000 points = 5 courses sans commission) ;
vraie page d'accueil chauffeur.

## v2.2

Tableau de bord chauffeur, code PIN, vue course chauffeur,
recommandations & plaintes, page d'erreur de marque.

## v2.1.2

Thème « Libreville la nuit », CGU modèle dépôt + plafond.

## v1

Schéma initial (`supabase/schema.sql`).
