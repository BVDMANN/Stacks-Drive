# Stacks Drive — Guide de mise en ligne et de maintenance

Guide unique : installation, déploiement, base de données, e-mails,
dépannage. Le produit est en ligne : https://stacks-drive.vercel.app
(Supabase « stacks-drive », Francfort ; Vercel « stacks-drive »).

---

## 1. Installation locale

```bash
npm install
cp .env.example .env.local   # remplir les valeurs ci-dessous
npm run dev
```

```bash
npm run build   # doit passer avant tout push
```

### Variables d'environnement

| Variable | Où la trouver | Obligatoire |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Oui |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | Oui |
| `RESEND_API_KEY` | Resend → API Keys (commence par `re_`) | Non — sans elle, aucun e-mail de ticket n'est envoyé ; les tickets restent visibles dans /admin |
| `NEXT_PUBLIC_CARTO_API_KEY` | CARTO → https://carto.com/basemaps/apikey/ (gratuite : 5 M de requêtes/mois hors commercial, 1 M en commercial) | Oui (v2.46) — sans elle, le fond Plan affiche le filigrane CARTO « API KEY REQUIRED » au lieu de la carte ; la clé est conçue pour être embarquée dans le code client (variable `NEXT_PUBLIC_`) |
| `ADMIN_EMAIL` | Défaut : stacks.markett@gmail.com (boîte Stacks Market, lue par l’administrateur) — la variable d'environnement, si elle est définie dans Vercel, reste prioritaire | Non |
| `EMAIL_FROM` | Défaut : `Stacks Drive <onboarding@resend.dev>` | Non |

**Ne jamais mettre la clé `service_role` dans `.env.local`** : elle donne
un accès total à la base et ne doit jamais quitter le tableau de bord
Supabase. `.env.local` n'est jamais envoyé sur GitHub (il est dans
`.gitignore`). Ne jamais mettre de vraie clé dans `.env.example`
(fichier versionné).

Dans Vercel, les mêmes variables sont définies dans Settings →
Environment Variables (Production). Après chaque ajout ou modification
d'une variable dans Vercel, **redéployer** (Deployments → ⋯ → Redeploy)
pour que le déploiement en ligne la prenne en compte. Vercel peut
demander un code de vérification envoyé par e-mail avant un
redéploiement manuel.

### Authentification Supabase (déjà réglée)

- Provider **Email** activé.
- Site URL : `https://stacks-drive.vercel.app`.
- Redirect URLs : `https://stacks-drive.vercel.app/auth/callback`
  (et `http://localhost:3000/auth/callback` pour le développement local).

---

## 2. Déploiement (Vercel)

Le déploiement est automatique : chaque push sur `main`
(`BVDMANN/Stacks-Drive`) déclenche un déploiement Vercel. Vérifier que
le déploiement est « Ready » en Production, puis vérifier le site en
vrai navigateur, en chargement frais : carte et 6 marqueurs chauffeurs,
prix affichés, pages légales, connexion.

Réglages Vercel : Framework Preset Next.js, Build Command
`npm run build`.

---

## 3. Base de données — migrations

Toutes les migrations ci-dessous sont **déjà exécutées une seule fois**
dans Supabase (SQL Editor, projet « stacks-drive »). **Ne jamais les
réexécuter.**

| Fichier | Contenu |
|---|---|
| `supabase/schema.sql` | Schéma v1 (tables, RLS, triggers) |
| `supabase/migration-v2.sql` | Modèle Uber : demandes + propositions, vérification, bucket privé `driver-documents` |
| `supabase/migration-v2.2.sql` | Tableau de bord chauffeur, code PIN, gains, avis & plaintes, journal d'audit |
| `supabase/migration-v2.3.sql` | Points chauffeur (`driver_points`, `profiles.free_rides_remaining`, `driver_earnings.is_free_ride`, `redeem_points_for_free_rides`) |
| `supabase/migration-v2.4.sql` | Vérification automatisée (`verification_checks`, `verification_doc_hash`, `verification_image_hash`, `verification_auto_decision`, table `verification_tickets`) |
| `supabase/migration-v2.6.sql` | Accès difficile (`rides.unpaved_requested`, `rides.drop_off_point`, `rides.unpaved_accepted`, `ride_proposals.unpaved_accepted`) |
| `supabase/migration-v2.10.sql` | Messagerie de course (`ride_messages`, `driver_locations`), prix proposé par le passager (`rides.passenger_offered_price`, `ride_proposals.counter_price`) |
| `supabase/migration-v2.15-disputes.sql` | **À EXÉCUTER UNE FOIS (v2.15, pas encore appliquée)** : litiges (`disputes`, `dispute_decisions`, `driver_debt_adjustments`), relevés hebdo (`weekly_settlements`, `settlement_declarations`), rapports hebdo (`weekly_reports`) + fonctions SECURITY DEFINER `generate_weekly_settlements`, `insert_weekly_report`, `mark_weekly_report_emailed` |
| `supabase/migration-v2.17-mode-rules.sql` | **À EXÉCUTER UNE FOIS (v2.17, pas encore appliquée)** : verrouillage du switch Passager → Chauffeur + mise en ligne — le trigger anti-escalade rejette la bascule en mode Chauffeur sans compte chauffeur créé et la mise en ligne sans compte vérifié (ferme le contournement direct via PostgREST ; l'API applique déjà les mêmes verrous) |
| `supabase/migration-v2.19-seats.sql` | **À EXÉCUTER UNE FOIS (v2.19, pas encore appliquée)** : places libres + statut chauffeur (`profiles.free_seats`, trigger de borne `sync_free_seats` — jamais plus de places libres que la capacité, initialisation à la mise en ligne) ; statut dérivé Vide / En course / Plein et matching Groupe / Solo côté serveur (`lib/seats.ts`) |
| `supabase/migration-v2.20-driver-privacy.sql` | **À EXÉCUTER UNE FOIS (v2.20, pas encore appliquée)** : confidentialité chauffeur — `get_public_ride` (lien de suivi public) ne renvoie plus que les champs d'affichage du chauffeur assigné (nom, véhicule, plaque, vérifié, zone, position), jamais téléphone, e-mail, selfie ni pièce d'identité |
| `supabase/migration-v2.24-realtime-emails.sql` | **À EXÉCUTER UNE FOIS (v2.24, pas encore appliquée)** : temps réel (`rides`, `ride_proposals`, `ride_messages` dans la publication `supabase_realtime` — RLS inchangée) + drapeaux de déduplication des e-mails automatiques (`profiles.welcome_email_sent_at`, `profiles.settlement_reminder_sent_at`, `weekly_settlements.driver_email_sent_at`) + fonctions SECURITY DEFINER `mark_weekly_settlement_emailed`, `mark_settlement_reminder_sent` |
| `supabase/migration-v2.25-drivers.sql` | **À EXÉCUTER UNE FOIS (v2.25, pas encore appliquée)** : onboarding / parrainage / relances chauffeurs (`profiles.referral_code` + `referred_by`, table `driver_referrals`, kind `parrainage` dans `driver_points`, `profiles.last_online_at` posée par trigger à chaque mise en ligne, drapeaux `driver_welcome_seen_at` / `incomplete_reminder_sent_at` / `incomplete_reminder_2_sent_at` / `inactive_reminder_sent_at`) + fonctions SECURITY DEFINER `ensure_referral_code`, `record_referral`, `credit_referral_bonus`, `mark_driver_reminder_sent` |
| `supabase/migration-v2.26-fraud.sql` | **À EXÉCUTER UNE FOIS (v2.26, pas encore appliquée)** : détection de fraude auto (`profiles.fraud_blocked` + motif + date, table `fraud_cases` — un seul dossier ouvert par utilisateur et par signal, garde anti-escalade étendue à `fraud_blocked`) + nettoyage RGPD (table `data_cleanups`) + fonctions SECURITY DEFINER `report_fraud_case`, `resolve_fraud_case`, `run_data_cleanup` |
| `supabase/migration-v2.27-traffic.sql` | **À EXÉCUTER UNE FOIS (v2.27, pas encore appliquée)** : trafic communautaire (table `traffic_reports` — type, position, expiration 30–60 min par trigger, RLS : seuls les chauffeurs signalent, tout le monde lit les marqueurs ; table `traffic_confirmations` — une par chauffeur et par signalement) + zones sans chauffeur (table `unanswered_zones` — une ligne par demande sans proposition depuis plus de 2 min, unicité `ride_id`) |
| `supabase/migration-v2.30-p1.sql` | **À EXÉCUTER UNE FOIS (v2.30, pas encore appliquée)** : plancher P1 — courses planifiées (`rides.scheduled_at`, `rides.dispatched_at`, statuts `planifiee` / `expiree`) + lieux favoris (`profiles.home_neighborhood`, `home_detail`, `work_neighborhood`, `work_detail`) + re-vérification selfie (`profiles.selfie_recheck_required`, `selfie_recheck_reason`, `last_selfie_check_at` — backfill au jour de la migration pour les chauffeurs déjà vérifiés) |
| `supabase/migration-v2.32-out-of-zone.sql` | **À EXÉCUTER UNE FOIS (v2.32, pas encore appliquée)** : écran hors zone — liste d'attente « préviens-moi » (table `area_waitlist` : e-mail unique, ville / pays en best-effort, consentement explicite ; RLS : inscription par n'importe quel visiteur avec consentement, lecture admin uniquement ; aucune coordonnée précise stockée). Sans elle, l'écran hors zone s'affiche et se ferme normalement, seule l'inscription « préviens-moi » renvoie une erreur explicite (503). |

Si une nouvelle migration est ajoutée au dépôt, elle s'exécute une seule
fois dans le SQL Editor, **après** le push du code qui l'utilise, puis
elle est ajoutée à ce tableau.

---

## 4. Comment le produit fonctionne aujourd'hui

- **Modèle Uber, pas BlaBlaCar :** les chauffeurs ne publient rien. Ils
  se mettent en ligne, le passager demande une course, le chauffeur
  reçoit une pop-up et fait une proposition (prix, places restantes,
  premier arrêt, valable 60 s). Le passager accepte, refuse, ou
  contre-propose son prix ; le chauffeur peut accepter la
  contre-proposition ou proposer un autre prix.
- **Courses :** Solo (privée) et Groupe (partagée, prix
  divisé, par défaut, badge « LE MOINS CHER »). Moto = Solo uniquement.
- **Estimation indicative + prix convenu, jamais de surge :** estimation
  au km dans `lib/pricing.ts` (aucun tarif fixe) ; le prix final se
  décide entre le passager et le chauffeur, puis il est figé à
  l'acceptation.
  (baisse de 24 %, planchers Solo 550 / Groupe 400 FCFA), revalidés
  côté serveur par `lib/fare-guard.ts`.
- **Quartiers :** 70 quartiers de Libreville (`lib/neighborhoods.ts`),
  noms affichés sur la carte, listes de départ / destination.
- **Lieux :** 59 lieux sur la carte (`lib/pois.ts`) : supermarchés,
  marchés, stations-service, pharmacies, hôtel, santé, lieux publics,
  bars, restaurants (pictogrammes dès le zoom 14, noms dès le zoom 15 ;
  bars et restaurants : pictogrammes dès le zoom 15, noms dès le
  zoom 16).
- **Quartiers à accès difficile :** 15 quartiers ne sont pas desservis
  sur route bitumée. La course s'y arrête par défaut à un point de
  dépôt sur route bitumée ; le passager peut demander la continuité
  sur route non bitumée pour un supplément forfaitaire de **800 FCFA**
  (`UNPAVED_ROAD_SUPPLEMENT`, `lib/pricing.ts`) ; le chauffeur est
  libre d'accepter ou non — s'il refuse, la destination devient le
  point de dépôt et le supplément est retiré.
- **Commission :** 5 % au lancement (3 mois), puis 8 % permanent,
  **plafond 10 % garanti** (`lib/commission.ts` — ne jamais toucher aux
  taux sans décision du propriétaire). La commission est calculée sur le total
  de la course, supplément route non bitumée compris.
- **Paiement :** le passager paie le chauffeur directement (espèces ou
  P2P Airtel Money / Moov Money). L'appli ne touche jamais l'argent.
  Commission réglée 1 fois par semaine, en un seul transfert Mobile
  Money. Dépôt de garantie remboursable : 5 000 FCFA. Plafond de
  dette : ~5 000 FCFA.
- **Vérification chauffeur :** automatisée (selfie + pièce d'identité,
  visage + OCR, décision auto ou ticket admin — voir
  `docs/automatisation-verification.md`). Tant que ce n'est pas
  vérifié, pas de mise en ligne, pas de proposition.
- **Sécurité passager :** SOS (112), partage de course en direct
  (`/suivi/[token]`), code PIN à 4 chiffres (5 codes faux = course
  verrouillée, déblocage dans /admin).
- **Fidélité :** 10e course offerte ; points chauffeur (100
  points/course, 10 000 points = 5 courses sans commission, Course
  Double = points doublés, niveaux = multiplicateurs).
- **E-mails admin :** tickets de vérification envoyés par Resend à
  `ADMIN_EMAIL` (voir §1). Sans clé, bandeau dans /admin et aucune
  perte de fonctionnalité.

---

## 5. Admin

Le compte admin est un compte normal promu par SQL :

```sql
update public.profiles set is_admin = true where email = 'ton-email@gmail.com';
```

Le tableau de bord /admin affiche : statistiques, chauffeurs à
vérifier, file des tickets de vérification (triés par urgence),
argent des chauffeurs (dû, dépôt, dette vs plafond), dépôts et
règlements, journal d'audit, coût des récompenses, courses
verrouillées (PIN), avis et plaintes, litiges, relevés hebdo et
rapport hebdo (v2.15).

### Litiges (v2.15) — le seul travail que l’administrateur garde

Un passager ou un chauffeur ouvre un litige depuis sa course terminée
ou annulée (motif, montant concerné, message libre). Chaque nouveau
litige est envoyé par e-mail à l'admin (Resend, `ADMIN_EMAIL`) et
visible dans /admin : course, prix accepté, messages in-app, dernière
position connue, statut du code PIN — jamais les numéros de téléphone.
L'admin fait avancer le litige (ouvert → en cours → résolu) et tranche
en ajustant la dette et/ou la commission du chauffeur (montant + motif,
tracé dans `dispute_decisions` et le journal d'audit). L'ajustement de
dette est appliqué dans `driver_debt_adjustments` et pris en compte
dans le « dû » partout ; la commission figée de la course n'est jamais
réécrite.

### Relevés hebdo & rapport hebdo (v2.15) — automatisés le lundi

Deux routes cron Vercel (voir `vercel.json`) :
- **Lundi ~7h** (`/api/cron/weekly-settlements`) : génère le relevé de
  la semaine terminée pour chaque chauffeur ayant roulé (courses,
  commission due, dette totale, dépôt). Le chauffeur déclare son
  transfert dans son tableau de bord (« J'ai payé », montant +
  référence libre) ; l'admin valide en 1 clic dans /admin — la
  déclaration devient alors un règlement classique et la dette baisse.
  Une déclaration non validée ne réduit jamais la dette.
- **Lundi ~7h30** (`/api/cron/weekly-report`) : digest de la semaine
  (courses, revenu commission, nouveaux chauffeurs, litiges ouverts,
  alertes : plafond de dette, dettes anciennes, litiges ouverts depuis
  plus de 7 jours, dépôts non versés), visible dans /admin et envoyé
  par e-mail à l'admin.

Les deux routes exigent `Authorization: Bearer <CRON_SECRET>` — Vercel
Cron l'envoie automatiquement quand la variable `CRON_SECRET` est
définie dans le projet Vercel (Production). Sans elle : 503. Générer
une valeur longue et aléatoire ; ne jamais la mettre en dur ni dans le
dépôt (voir `.env.example`).

### Temps réel, support & e-mails automatiques (v2.24) — lot B

- **Temps réel (Supabase Realtime)** : les propositions (passager 5 s → instantané), les demandes et contre-propositions (chauffeur 10 s / 15 s → instantané) et les messages de course (3 s → instantané) arrivent par canal Realtime (`lib/realtime.ts`). Le sondage reste en repli si Realtime est indisponible, plus un rafraîchissement de sécurité toutes les 60 s. Les toasts de négociation (`lib/proposal-events.ts`) sont inchangés : Realtime ne fait que déclencher un rechargement, jamais un événement en double. RLS inchangée — les canaux ne voient que ce que les lectures actuelles autorisent. Exige la migration v2.24 (publication `supabase_realtime`) ; sans elle, le sondage rapide reprend tout seul.
- **FAQ in-app** (`/aide`, liée dans le pied de page et dans « Mon compte ») : prix, estimation, code PIN, paiement, annulation, retard / attente, Solo vs Groupe, propositions, vérification chauffeur, commission, fidélité, sécurité, bascule de mode. Les questions sans réponse renvoient vers l'ouverture d'un litige (depuis la course) ou un message à l'administrateur — jamais d'e-mail direct au propriétaire pour une question courante.
- **Alertes d'exception uniquement** (`lib/admin-alerts.ts`, point d'entrée unique, un seul e-mail par événement) : course verrouillée (5 faux PIN), chauffeur bloqué par le plafond de dette, cron en échec, route API en échec répété (5 échecs en 1 h). Les litiges (lot A v2.15) et les tickets de vérification ambigus (v2.4) gardent leurs propres e-mails — l'helper les refuse (`owned-by`) pour ne jamais envoyer de doublon.
- **E-mails automatiques** (Resend, plan gratuit — un seul e-mail par événement, `lib/email.ts`) : bienvenue passager (première connexion confirmée, dédupliquée en base), bienvenue chauffeur (quand la vérification passe à « vérifié »), récap hebdo des gains par chauffeur (le lundi, construit sur le relevé du lot A, dédupliqué par relevé), rappels de règlement (dette au plafond ou sans règlement depuis 7 jours, au plus 1 par semaine et par chauffeur, en complément du rappel in-app du lot A). Les e-mails chauffeurs partent le lundi dans la route `/api/cron/weekly-report` (après le rapport admin) — aucun nouveau cron Vercel.
- **Sans Resend** : aucun envoi, simple log serveur — le produit continue de fonctionner (litiges, relevés et rapports restent visibles dans /admin).

### Onboarding, parrainage, relances, dépôt (v2.25) — lot C

- **Onboarding autonome** : bienvenue in-app sur le tableau de bord chauffeur (en complément de l'e-mail du lot B, fermable une fois, drapeau `profiles.driver_welcome_seen_at`) + rappel si le dossier de vérification est incomplet après 48 h (message in-app dès 48 h sur le tableau de bord et l'accueil chauffeur + e-mail, une seule fois), puis une relance à J+7 si toujours incomplet (drapeaux `incomplete_reminder_sent_at` / `incomplete_reminder_2_sent_at`). Les dossiers « en attente » attendent l'administrateur : jamais relancés. La vérification automatique elle-même ne change pas (v2.4).
- **Parrainage chauffeurs** — SILENCIEUX, jamais annoncé sur les pages publiques : chaque chauffeur vérifié a un code unique (`SD-NOM-XXXX`, créé à la vérification, aussi visible dans sa carte « Parrainage chauffeurs » du tableau de bord) ; un chauffeur peut saisir le code de son parrain à l'inscription (champ facultatif, rôle chauffeur uniquement) ou après coup dans la carte. Quand le filleul est vérifié ET a terminé 5 courses, le parrain gagne 1 000 points et le filleul 500 points (système existant : 100 points/course, 10 000 points = 5 courses sans commission) — crédités par le cron hebdo (`credit_referral_bonus`, idempotent). Section « Parrainage chauffeurs » dans /admin (parrains, filleuls, bonus versés / en attente). Le parrainage passager vient dans un lot ultérieur.
- **Relances inactifs** : chauffeur vérifié, jamais en ligne ou absent depuis 7 jours sans mise en ligne (`profiles.last_online_at`, posée par trigger + par l'API à chaque mise en ligne) → message in-app + e-mail, max 1/semaine/chauffeur (drapeau `inactive_reminder_sent_at`). Jamais le même message pour un chauffeur bloqué par la dette au plafond (il reçoit « Régularise pour reprendre ») ni pour un chauffeur refusé / non vérifié (rappel de dossier incomplet).
- **Dépôt / dette au plafond** : le blocage existe déjà (v2.2) ; ce lot ajoute seulement le message côté chauffeur — « Régularise pour reprendre » avec le montant dû et le moyen de règlement (transfert Mobile Money puis « J'ai payé »), visible sur son tableau de bord et son accueil. Il ne duplique ni l'alerte admin ni le rappel e-mail du lot B.
- **Aucun nouveau cron Vercel** : relances (dossier incomplet, inactifs) et récompenses de parrainage passent par la route existante `/api/cron/weekly-report` (le lundi). Sans migration v2.25, les relances e-mail sont sautées proprement (jamais d'envoi sans drapeaux de déduplication) et les messages in-app fonctionnent en mode dégradé.

### Trafic : itinéraire routier, trafic communautaire, zones sans chauffeur (v2.27) — lot E

- **Itinéraire routier (phase 1)** : route API `GET /api/route` (proxy OSRM — serveur démo public `router.project-osrm.org`, sans clé, surchargeable par `OSRM_BASE_URL` ; cache serveur 5 min par trajet, espacement 1,1 s entre appels — limite du serveur démo : 1 req/s). La carte trace la géométrie OSRM au lieu de la ligne droite (repli ligne droite si OSRM indisponible) ; la feuille passager et le détail de course affichent la durée et la distance routières. **Le prix ne change pas** : l'estimation reste calculée sur la distance à vol d'oiseau (Solo 500 + 210/km, Groupe 300 + 135/km). Démo uniquement : l'auto-hébergement OSRM sur petit VPS viendra au lancement (décision différée).
- **Trafic communautaire (phase 2)** : pendant une course, le chauffeur signale Embouteillage / Accident / Travaux / Route fermée à sa position (géolocalisation, sinon dernière position connue) depuis son tableau de bord ; marqueurs sur la carte des passagers (accueil) ET des chauffeurs (suivi de course), rafraîchis toutes les 60 s ; expiration auto 30 min (embouteillage) à 60 min (autres) ; modération auto — mise en évidence dès 2 confirmations par d'autres chauffeurs (jamais de confirmation de son propre signalement, une confirmation par chauffeur et par signalement, anti-doublon 500 m / 10 min). L'identité du signaleur n'est jamais exposée. Exige la migration v2.27 ; sans elle, les signalements renvoient une liste vide et le bouton affiche l'erreur serveur.
- **Zones sans chauffeur** : une demande sans proposition depuis plus de 2 min est journalisée dans `unanswered_zones` (une seule alerte par demande — unicité `ride_id`) et signalée aux chauffeurs proches (bannière sur l'accueil chauffeur, rayon 25 km) ; section « Zones sans chauffeur » dans /admin pour cibler le recrutement. Aucun nouveau cron : la vérification tourne à chaque sondage des demandes entrantes et à chaque lecture de la bannière.
- **Vérification locale** : `node scripts/verify-lot-e.mjs` (OSRM en direct, route `/api/route`, constantes, migration, 2 règles, aucun nouveau cron).

### ETA chauffeur + navigation guidée (v2.28) — P0b

- **ETA routière** : dès la proposition reçue (position du chauffeur connue) et pendant la course acceptée, le passager voit « Arrivée dans ~X min · Y km par la route » — durée et distance OSRM chauffeur → pickup via `GET /api/route` (hook partagé `lib/use-road-route.ts` : cache client 5 min, appels en vol dédupliqués, recalcul quand le chauffeur bouge d'environ 100 m ou toutes les 30 s ; réutilise le sondage 5 s / le partage de position existants, aucun nouveau polling agressif). Le chauffeur voit la même ETA vers le pickup, puis vers la destination en course en cours. Sans OSRM (ou sans position), repli sur l'estimation à vol d'oiseau (30 km/h) — jamais d'écran vide, jamais d'erreur visible.
- **Navigation guidée (chauffeur)** : pendant la course, la carte trace l'itinéraire routier chauffeur → pickup puis chauffeur → destination (géométrie OSRM, position du chauffeur dessus) et le panneau de guidage liste les instructions virage par virage en français (manœuvres OSRM traduites dans `lib/routing.ts`, étape courante mise en avant, 5 suivantes listées) + bouton « Ouvrir dans l'app Cartes » (lien Google Maps gratuit, sans compte, origine = position du chauffeur). Pas de navigation vocale native, pas de service payant. La géolocalisation du navigateur reste active en course en cours pour le guidage local, sans envoi serveur (le partage s'arrête au pickup, comme avant).
- **Le prix ne change pas** : l'estimation reste calculée sur la distance à vol d'oiseau ; `lib/pricing.ts` et `lib/commission.ts` (5 % puis 8 %, plafond 10 %) ne sont pas touchés. Aucune migration (calculs en lecture uniquement), aucun nouveau cron, aucune donnée personnelle exposée (la position du chauffeur n'est visible que pendant la course acceptée, entre ses deux parties).
- **Vérification locale** : `node scripts/verify-p0b.mjs` (OSRM en direct avec étapes, route `/api/route`, branchements, prix/commission intouchés, absence de migration, 2 règles, aucun nouveau cron).

### Réponses automatiques aux plaintes standard (v2.29) — lot F

- **Principe** : une plainte ouverte depuis une course terminée ou annulée ne remonte plus d'emblée à un humain. L'utilisateur choisit d'abord son sujet (retard, attente trop longue, annulation par l'autre partie, prix / montant contesté, paiement / monnaie, itinéraire / destination, véhicule / propreté, autre problème). Si le sujet est standard, il reçoit **immédiatement** une réponse auto concrète : excuse adaptée, explication avec les chiffres de SA course (prix figé accepté, estimation indicative, qui a annulé et pourquoi — annulation = aucune facturation, course close ; retard = prix inchangé) et actions existantes (refaire une demande / se remettre en ligne, entrée FAQ liée : `/aide#retard`, `#prix`, `#paiement`, `#annulation`). La réponse est journalisée dans `audit_log` (`complaint_auto_replied`) — elle ne crée ni litige ni e-mail.
- **Escalade** : la plainte devient un litige (flux v2.15 existant : dossier complet dans /admin + e-mail admin) quand elle n'est PAS standard — mot grave dans le message (fraude, arnaque, vol, menace, agression, danger…), montant contesté de plus de 5 000 FCFA (même seuil que le dépôt et le plafond de dette), sujet « Autre problème » — OU quand l'utilisateur rejette la réponse auto (« Ça ne résout pas mon problème »). Le litige escaladé porte le préfixe `[Réponse auto « … » rejetée — transmis à Stacks Drive]` dans son message (visible dans /admin, badge « Après réponse auto », et dans l'e-mail) et un événement `complaint_escalated` en plus de `dispute_opened`. L'utilisateur voit toujours clairement si sa plainte est traitée automatiquement ou transmise à un humain.
- **Aucune compensation automatique** : la réponse auto = message + guidage + actions existantes uniquement — aucune remise, aucun remboursement, aucun crédit. L'application ne touche jamais l'argent ; seul un humain peut décider d'un ajustement, via le litige. La classification est re-faite côté serveur (route `POST /api/complaints/auto-reply`, même fonction `lib/auto-replies.ts` que le client) : un client ne peut pas forcer une réponse auto sur un sujet grave. Le retard n'a pas de motif de litige dédié : il est routé vers « Autre » (aucune nouvelle valeur d'énumération, donc aucune migration).
- **Le prix ne change pas** : `lib/pricing.ts` et `lib/commission.ts` (5 % puis 8 %, plafond 10 %) ne sont pas touchés. Aucune migration (réutilisation de `disputes` / `audit_log` uniquement), aucun nouveau cron. La messagerie in-app n'est pas proposée comme action : elle se ferme à la fin de la course, donc les actions proposées sont la nouvelle demande / la remise en ligne et l'aide.
- **Vérification locale** : `node scripts/verify-lot-f.mjs` (classification : 16 cas dont fraude, vol, montants 5 000 / 6 000 FCFA ; contenu concret des 7 réponses ; FAQ ; branchements ; absence de migration et de cron ; prix/commission intouchés ; 2 règles ; HTTP local). Le parcours en session connectée réelle (plainte → réponse auto, rejet → litige dans /admin) n'est pas vérifiable en dev (Supabase non configuré, routes en 503) : test connecté avec le propriétaire après le push.

### Plancher P1 (v2.30)

- **Notes dans les deux sens** : le formulaire d'avis après course (v2.2, `FeedbackForm` + `POST /api/feedback`) notait déjà dans les deux sens — le passager note le chauffeur (`rides.rating_driver`), le chauffeur note le passager (`rides.rating_passenger`, 1–5 étoiles + commentaire facultatif). Ce qui manquait, c'était la visibilité : la note moyenne du passager est maintenant calculée côté serveur (`getPassengerRating` / `getPassengerRatings`, `lib/rides.ts` — moyenne des notes de ses courses terminées, jamais 0 inventé) et affichée au chauffeur dans la demande entrante (`RequestPopup`, avec « Nouveau passager » si aucune course notée), dans la liste des demandes entrantes et sur la carte de course (`/courses/[id]`). Aucune migration pour ce point (les colonnes existent depuis la v2.2).
- **Courses planifiées** : le passager coche « Planifier pour plus tard » sur l'accueil et choisit une date/heure (au moins 30 min dans le futur, au plus 7 jours — validé côté client ET côté serveur, `POST /api/rides` avec `scheduledAt`). La demande est créée avec le statut `planifiee` (`rides.scheduled_at`) et apparaît dans « Mes courses » (section « Planifiées »), annulable avant l'envoi (motif obligatoire, comme les autres annulations). L'envoi aux chauffeurs proches a lieu ~15 min avant l'heure prévue : il est déclenché par le sondage existant des demandes entrantes (`dispatchDueScheduledRides`, appelé dans `getIncomingRequests` — chaque chauffeur en ligne sonde toutes les 10 s) — **aucun nouveau cron Vercel**. La route `GET /api/cron/scheduled-dispatch` (protégée par `CRON_SECRET`) existe en filet de sécurité si aucun chauffeur n'est en ligne au moment de l'envoi : elle n'est PAS programmée dans `vercel.json` par défaut. Le cron hebdo existant (`/api/cron/weekly-report`) appelle aussi le dispatch en meilleur effort. Passée l'heure prévue de plus de 30 min sans chauffeur, la course passe en `expiree` : le passager la voit dans « Mes courses » et sur la page de course, avec un bouton « Relancer maintenant » (action `relaunch` sur `PATCH /api/rides/[id]` : même trajet, mêmes conditions, envoi immédiat). Sans la migration v2.30, une planification renvoie une erreur explicite (503) — jamais une demande immédiate silencieuse.
- **Lieux favoris** : domicile et travail dans « Mon compte » (`ProfileForm` : quartier + précision libre, `PATCH /api/profile` avec `homeNeighborhood` / `homeDetail` / `workNeighborhood` / `workDetail` — vider le quartier supprime le lieu). Sur l'accueil, « Maison » et « Travail » deviennent des raccourcis 1 tap : boutons « Départ » / « Destination » à côté de chaque lieu.
- **Heatmap de demande (chauffeur)** : `GET /api/driver/heatmap` + section « Zones demandées » du tableau de bord (`DemandHeatmap`, rafraîchie toutes les 60 s) — les 8 quartiers les plus demandés sur les 7 derniers jours (vraies demandes `rides`, jamais de données inventées), avec le nombre de demandes restées sans proposition (v2.27). **Info seulement** : sans surge, sans prix dynamique, sans promesse de gain — le texte l'indique explicitement. Sans historique, la liste est vide et le dit.
- **Messages rapides côté chauffeur** : la messagerie de course (`RideChat`, v2.10) affichait déjà « Où êtes-vous ? », « J'arrive », « Je suis devant… » côté passager — le chauffeur a maintenant ses équivalents : « J'arrive », « Je suis devant… », « Je vous attends », « Je suis en route ». Messagerie in-app uniquement, aucun numéro affiché.
- **Re-vérification selfie ponctuelle** : de temps en temps, le chauffeur doit refaire un selfie avant de pouvoir se mettre en ligne. Déclencheurs : drapeau `profiles.selfie_recheck_required` posé par l'admin après un signalement (litige ouvert contre le chauffeur, `POST /api/disputes`, meilleur effort) ou par le balayage hebdo (`flagDueSelfieRechecks` dans `/api/cron/weekly-report` : dernier contrôle vieux de plus de 30 jours, au plus 5 chauffeurs par semaine — donc pas plus d'1 fois par mois et par chauffeur). Le verrou est côté serveur (`PATCH /api/profile` refuse la mise en ligne avec le code `selfie_recheck_required`) et visible côté chauffeur (`SelfieRecheckCard`, accueil chauffeur + tableau de bord). Le contrôle est une simple présence de visage (réutilise la détection v2.4, `detectSelfieFace`) — **jamais de reconnaissance faciale biométrique ni d'identification** : la photo n'est pas conservée (seule l'empreinte SHA-256 est calculée côté serveur, puis oubliée). Visage détecté → drapeau levé ; aucun visage → ticket `visage_non_detecte` dans la file admin (v2.4, e-mail admin) et le drapeau reste — un humain tranche, jamais de blocage définitif automatique. Détection indisponible sur l'appareil : le contrôle technique ne bloque jamais le chauffeur (règle v2.4), le résultat est consigné. La migration v2.30 pose `last_selfie_check_at = now()` pour les chauffeurs déjà vérifiés : personne n'est bloqué le jour de la migration. Sans la migration, la re-vérification est inactive.
- **Gains détaillés par course** : la section « Détail par course » du tableau de bord chauffeur (`DriverEarnings`) affiche désormais, par course terminée, la date, le trajet, le prix accepté, la commission et le gain net — montants depuis `driver_earnings` (source de vérité), trajet et date de fin joints depuis `rides` (`lib/earnings.ts`). Bouton « Exporter en CSV » (fichier `gains-stacks-drive.csv`, généré côté client, sans dépendance).
- **Export PDF / impression du reçu** : bouton « Imprimer / Exporter le reçu » sur la carte du reçu (`RideReceiptCard`, page de course) et dans l'historique (« Mes courses », course terminée → `/courses/[id]?print=1`, qui ouvre la boîte d'impression toute seule via `AutoPrintOnParam`). Mise en page d'impression propre : `window.print` + CSS print (`styles/globals.css` — seule la zone `.print-receipt` s'imprime) ; l'utilisateur choisit « Enregistrer au format PDF » dans la boîte d'impression du navigateur. Aucune dépendance lourde, aucun service payant, aucun compte.
- **Formation chauffeur in-app** : déjà faite par les tutos visuels réels (v2.21) — **non refaite**. Vérifié : la formation est montée dans le tableau de bord (`DriverTutorial`) et rejouable avec le bouton « Revoir la formation » (`TutoReplayButton`, dans les actions de `/tableau-de-bord`).
- **Le prix ne change pas** : `lib/pricing.ts` et `lib/commission.ts` (5 % puis 8 %, plafond 10 %) ne sont pas touchés. Migration v2.30 à exécuter une seule fois (voir §3). Aucun nouveau cron Vercel.
- **Vérification locale** : `node scripts/verify-lot-p1.mjs` (logique pure importée : dispatch planifiées, re-vérification selfie, heatmap ; branchements relus depuis les fichiers livrés ; prix/commission intouchés ; 2 règles ; HTTP local). Le parcours en session connectée réelle (planifier → envoi à −15 min simulé, favoris, heatmap, messages rapides chauffeur, selfie, gains, impression) n'est pas vérifiable en dev (Supabase non configuré, routes en 503) : test connecté avec le propriétaire après le push.

### Carte zonée quartier (v2.31)

- **Vue d'ouverture = zoom quartier** : la carte s'ouvre au zoom 14 (`MAP_INITIAL_ZOOM`, `lib/geo.ts`), centrée sur l'ancre — (a) position GPS réelle si elle est dans la zone de service, (b) sinon quartier de départ choisi, y compris le brouillon restauré après connexion, (c) sinon Centre-ville. Le départ se cale par défaut sur le quartier le plus proche de la position GPS. Jamais toute la ville au premier chargement ; la vue ville (zoom 12, 6 libellés Drive en Plan — les autres noms sont déjà sur les tuiles CARTO dark_all, v2.42 recalibré v2.46 — 12 en Satellite) reste accessible en dézoomant — les tiers de libellés ne changent pas. Géolocalisation silencieuse au chargement (délai 5 s, repli immédiat sans bloquer l'ouverture, sans message d'erreur ; la position ne quitte jamais le navigateur).
- **Cercle périmètre 5 km** : cercle statique subtil (trait or pointillé, remplissage or très léger) autour de l'ancre — il visualise la zone « chauffeurs autour de toi », avec le rayon de matching existant (`DRIVERS_AROUND_RADIUS_KM`, 5 km — pas un second chiffre). Il suit la position GPS par défaut, et le quartier de départ dès qu'il est choisi manuellement (liste, favoris, trajets fréquents, point de prise en charge). Distinct du radar cyan pulsé (100 → 1 600 m, actif seulement pendant la recherche).
- **« Me localiser »** : centre sur la position GPS au zoom quartier si elle est dans la zone de service ; sinon la carte reste sur Libreville + message « le service est à Libreville pour l'instant ». Le test est désormais une appartenance à la zone (`isInServiceArea`, `SERVICE_BOUNDS` dans `lib/geo.ts`) — l'ancien test « > 60 km du quartier le plus proche » plaçait encore quelqu'un à 20–50 km de Libreville.
- **Zone de service (`SERVICE_BOUNDS`)** : rectangle Grand Libreville (sud 0,22 / ouest 9,24 / nord 0,69 / est 9,76) — il couvre les 70 quartiers avec ~9 km de marge. Constante nommée partagée : la carte l'utilise pour `maxBounds` (+ `maxBoundsViscosity: 1.0`, bornes fermes), « Me localiser » et l'ancrage l'utilisent pour le test d'appartenance, et le lot suivant (écran hors zone) la réutilisera telle quelle.
- **Bornes** : `minZoom` 12 — on dézoome jusqu'à la vue ville, jamais en dessous ; `maxBounds` sur la zone de service — impossible de défiler hors zone (le centre reste dans le rectangle, la vue ville y tient entièrement).
- **Listes départ / destination** : vérifié — quartiers de Libreville uniquement (`SELECTABLE_NEIGHBORHOODS`, 70 quartiers, « Autre » exclu), inchangées.
- **Le prix ne change pas** : `lib/pricing.ts` et `lib/commission.ts` (5 % puis 8 %, plafond 10 %) ne sont pas touchés. Aucune migration (lot 100 % client), aucun nouveau cron Vercel.
- **Vérification locale** : `node scripts/verify-lot-v231.mjs` (logique pure importée : zooms, zone de service, appartenance ; branchements relus depuis les fichiers livrés ; prix/commission intouchés ; 2 règles ; HTTP local) + contrôle visuel Playwright (chargement frais au zoom 14, cercle 5 km, dézoom jusqu'au zoom 12, bornes). Le parcours avec un vrai GPS (position dans la zone, « Me localiser » hors zone depuis la France) n'est pas vérifiable en dev : test sur le téléphone du propriétaire après le push.

### Écran hors zone (v2.32)

- **Déclencheur** : la position GPS connue est hors de la zone de service (`isInServiceArea`, `SERVICE_BOUNDS` dans `lib/geo.ts` — réutilisés tels quels, aucune seconde zone définie). Déclenchement sur la géolocalisation silencieuse au chargement (délai 5 s, v2.31) et sur « Me localiser » — jamais en boucle, jamais de nouvelle demande de permission. Pas de GPS / pas de permission = pas d'écran (on ne sait pas où la personne est). Jamais affiché pour une position dans la zone.
- **Écran** : plein écran, langage de la page d'erreur de marque (`app/error.tsx`, v2.2 — fond `bg-night-950`, tuile icône or, titre, texte `slate-400`, bouton principal or en pilule + ligne de contact) avec fond animé discret dans le vocabulaire existant (anneaux radar `radar-ping`, halo `driver-halo`). Textes : FR « Nous ne sommes pas encore là-bas, mais ne vous inquiétez pas, ça arrive. » + « Pour l'instant, Stacks Drive est à Libreville. » ; EN « We're not there yet, but don't worry, we're coming. » + « For now, Stacks Drive is in Libreville. » — basculeur FR | EN en haut, langue du navigateur par défaut.
- **Ne bloque pas l'appli** : le bouton « Explorer Libreville » / « Explore Libreville » ferme l'écran et laisse explorer la carte de Libreville quand même (le propriétaire lui-même, en France, peut utiliser l'appli). Une fois fermé, l'écran ne réapparaît pas avant la fin de la session (`sessionStorage`, clé `stacks-drive-out-of-zone-dismissed-v1`) — sauf « Me localiser », action explicite qui le remontre.
- **« Me prévenir »** : champ e-mail + case de consentement explicite obligatoire, envoyés à `POST /api/notify-me` (validation serveur : e-mail valide, consentement requis, ville / pays ≤ 80 caractères). Enregistré dans la table dédiée `area_waitlist` (e-mail unique insensible à la casse — une deuxième inscription renvoie un succès idempotent ; RLS : inscription par n'importe quel visiteur avec consentement, lecture admin uniquement), visible dans /admin (section « Demandes d'arrivée dans une nouvelle zone » : e-mail, ville / pays, date). Aucune coordonnée précise conservée : ville / pays en best-effort seulement (reverse-geocoding Nominatim, `reverseGeocodeCityCountry` dans `lib/geolocation.ts`). Migration `supabase/migration-v2.32-out-of-zone.sql` à exécuter une seule fois (voir §3) — sans elle, l'écran fonctionne normalement et seule l'inscription renvoie une erreur explicite (503).
- **Le prix ne change pas** : `lib/pricing.ts` et `lib/commission.ts` (5 % puis 8 %, plafond 10 %) ne sont pas touchés. Aucun nouveau cron Vercel.
- **Vérification locale** : `node scripts/verify-lot-v232.mjs` (réutilisation de `SERVICE_BOUNDS` / `isInServiceArea`, branchements relus depuis les fichiers livrés, route `/api/notify-me`, migration, prix/commission intouchés, 2 règles, HTTP local) + contrôle visuel Playwright (position simulée Paris : écran FR puis EN, fond animé, « Explorer Libreville » ferme sans réapparition dans la session ; position dans la zone : aucun écran ; sans GPS : aucun écran). Le parcours en session connectée réelle (inscription « préviens-moi » jusqu'à /admin) n'est pas vérifiable en dev (Supabase non configuré, route en 503) : test connecté avec le propriétaire après le push et après la migration v2.32.

Pour vérifier un chauffeur manuellement (ou résoudre un ticket) :
dans /admin, approuver, refuser ou demander de refaire. Seul un admin
peut attribuer la vérification : un chauffeur ne peut pas
s'auto-vérifier (la base refuse).

Pour retirer les chauffeurs démo affichés sur la carte : vider
`DEMO_DRIVERS` dans `lib/demo-drivers.ts` (et retirer son import de
`app/page.tsx` si besoin). La carte n'affichera plus que les
chauffeurs réels en ligne.

---

## 6. Dépannage

| Problème | Cause probable / solution |
|---|---|
| « Lien de vérification invalide / expiré » | La Site URL de Supabase (§1) ne correspond pas à l'adresse Vercel. Corrige-la et redemande un e-mail. |
| Aucune course / aucun chauffeur affiché | Les clés Supabase ne sont pas dans Vercel (§1) ou une migration n'a pas été exécutée (§3). |
| « Rôle chauffeur requis » | Le compte connecté est un compte passager. Créer un compte chauffeur. |
| Prix refusé à la proposition | Le prix proposé est hors bornes (400–50 000 FCFA) : voir le journal d'audit dans /admin. |
| « Le code PIN n'est pas encore activé » au démarrage | La migration v2.2 n'a pas été exécutée (§3). |
| Course verrouillée (PIN) | 5 codes faux : la débloquer dans /admin. |
| Gains à 0 dans le tableau de bord | Migration manquante (§3), ou courses terminées avant la migration — le tableau de bord les finalise tout seul à l'affichage. |
| « Courses planifiées pas encore activées » (503) | La migration v2.30 n'a pas été exécutée (§3) : appliquer `supabase/migration-v2.30-p1.sql`, puis replanifier. |
| Mise en ligne refusée — « Refais un selfie de vérification » | Re-vérification selfie ponctuelle (v2.30) : le chauffeur refait un selfie (contrôle de présence d'un visage) depuis son accueil ou son tableau de bord ; en cas de doute, ticket admin. |
| Points à 0 après une course terminée | La migration v2.3 n'a pas été exécutée (§3). |
| Échange de points impossible | La fonction `redeem_points_for_free_rides` n'existe pas : exécuter `migration-v2.3.sql` (§3). |
| Tous les dossiers de vérification restent « en cours » | La migration v2.4 n'a pas été exécutée (§3) : la route retombe sur l'ancien flux (revue manuelle). |
| Aucun e-mail de ticket reçu | `RESEND_API_KEY` absente ou redéploiement Vercel oublié (§1) ; vérifier le bandeau dans /admin. Sur le plan gratuit, l'expéditeur `onboarding@resend.dev` ne peut écrire qu'à l'e-mail du compte Resend. |
| « Plafond de dette atteint » pour un chauffeur | Ses commissions non réglées atteignent ~5 000 FCFA : enregistrer un règlement dans /admin (Dépôts & règlements). |
| Propositions / messages lents (pas de temps réel) | La migration v2.24 n'a pas été exécutée (tables absentes de la publication `supabase_realtime`) : le sondage rapide reprend — exécuter la migration, puis vérifier dans Supabase → Database → Replication que les 3 tables sont activées. |
| E-mail de bienvenue / récap chauffeur non reçu | `RESEND_API_KEY` absente, ou migration v2.24 non appliquée (drapeaux de déduplication manquants : la bienvenue n'est pas envoyée sans le drapeau, pour ne pas spammer). Sur le plan gratuit, l'expéditeur `onboarding@resend.dev` ne peut écrire qu'à l'e-mail du compte Resend. |
| Carte « Parrainage chauffeurs » vide / pas de code | La migration v2.25 n'a pas été exécutée (code recalculé en lecture seule, sans persistance) : exécuter `migration-v2.25-drivers.sql` (§3). Le code n'existe que pour un chauffeur vérifié. |
| Rappel « dossier incomplet » / relance inactif non reçu | La migration v2.25 n'a pas été exécutée : le cron hebdo saute ces relances (pas d'envoi sans drapeaux de déduplication). Exécuter la migration (§3) et vérifier `RESEND_API_KEY`. Les dossiers « en attente » et les chauffeurs bloqués par la dette ne reçoivent pas ces relances (c'est voulu). |
| « Vérification déjà en cours » au renvoi | Le dossier est en attente (ticket ouvert) : l'admin doit d'abord trancher, ou le chauffeur attend la décision. |
| OCR très lent sur téléphone | Tesseract.js télécharge ses données au premier usage (~10 Mo) ; la lecture prend ensuite quelques secondes. Si le réseau est faible, le dossier part quand même et le serveur tranche. |
| FaceDetector indisponible (iPhone/Safari) | Normal : la détection de visage native n'existe que sur Chrome/Android. Le contrôle est marqué « indisponible » et ne bloque pas — l'OCR fait foi. |
| Le lien Admin n'apparaît pas | Le compte n'a pas été promu admin (§5). Vérifier avec `select email, is_admin from public.profiles;`. |
| E-mail de vérification jamais reçu | Vérifier les spams. Dans Supabase → Authentication → Users, vérifier que l'utilisateur existe. En développement, Supabase peut limiter l'envoi (quotas du plan gratuit). |

## Commission

Le taux de commission est **une seule constante** dans le code :
`lib/commission.ts` → `COMMISSION_RATE = 0.05` (5 % au lancement, 3 mois),
puis `COMMISSION_RATE_PERMANENT = 0.08` (8 %), avec un plafond garanti de
10 % (`COMMISSION_CAP`). La commission est calculée sur le total de la
course, supplément route non bitumée compris. La découpe est figée dans
chaque course au moment où elle est acceptée : un changement de taux ne
modifie jamais les courses déjà acceptées.

## Coûts (plans gratuits)

- **Supabase** : gratuit (500 Mo de base, 50 000 utilisateurs/mois).
- **Vercel** : gratuit (100 Go de bande passante/mois).
- **Resend** : gratuit (limites du plan gratuit : l'expéditeur
  `onboarding@resend.dev` ne peut écrire qu'à l'e-mail du propriétaire
  du compte Resend).
- **CARTO (fond de carte Plan dark_all)** : gratuit (5 M de requêtes de
  tuiles/mois hors commercial, 1 M en commercial — clé
  `NEXT_PUBLIC_CARTO_API_KEY`, voir §1) ; Esri World Imagery
  (Satellite) : gratuit, sans clé.

Au-delà, chaque service propose un plan payant à la consommation.

## Fichiers importants du projet

- `supabase/schema.sql`, `supabase/migration-v2.sql`,
  `supabase/migration-v2.2.sql`, `supabase/migration-v2.3.sql`,
  `supabase/migration-v2.4.sql`, `supabase/migration-v2.6.sql` — base
  de données (toutes exécutées, §3).
- `.env.example` — la liste des variables à remplir (sans aucune valeur).
- `lib/commission.ts` — le taux de commission (5 % puis 8 %, plafond 10 %).
- `lib/pricing.ts` — estimation indicative au km + supplément route non bitumée (800 FCFA).
- `lib/neighborhoods.ts` — 49 quartiers, accès difficile, points de dépôt.
- `lib/pois.ts` — 24 lieux affichés sur la carte.
- `lib/fare-guard.ts` — revalidation des prix côté serveur.
- `lib/gamification.ts` — chiffres de la gamification (points, quêtes,
  Course Double, niveaux, dépôt, plafond de dette).
- `lib/verification.ts`, `lib/verification-client.ts`, `lib/email.ts`,
  `lib/tickets.ts` — vérification automatisée et tickets.
- `app/` — les pages (accueil, courses, connexion, inscription, tableau de
  bord, mes courses, compte, admin, pages légales).
- `components/` — les composants de l'interface.
- `docs/` — état des lieux et vérification automatisée.
