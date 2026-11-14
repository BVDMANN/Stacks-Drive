# CHANGELOG — Stacks Drive

Historique des versions, rédigé à partir de l'historique du README et
de `SETUP.md`. Ce fichier décrit des versions **livrées** (en ligne ou
en local en attente de push) — jamais un plan. Les entrées ne sont pas
réécrites a posteriori : une version remplacée (ex. v2.9, remplacée par
v2.11) le reste, avec la mention.

Légende : **en ligne** = déployé sur https://stacks-drive.vercel.app ;
**local** = en attente de push et, le cas échéant, d'exécution de la
migration associée (voir le tableau des migrations dans le README).

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
