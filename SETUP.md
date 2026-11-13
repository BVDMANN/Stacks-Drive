# Stacks Drive v1 — Guide de mise en ligne

Stacks Drive est la vraie version de la plateforme : comptes avec
vérification par e-mail, publication de courses par les chauffeurs,
réservations réelles, base de données, commission transparente. Ce guide te
fait passer du code (déjà prêt) au site en ligne, étape par étape. **Tu n'as
rien à coder** : tu crées seulement les comptes et tu copies des clés.

Durée estimée : 30 à 45 minutes.

---

## Ce qu'il te faut avant de commencer

- Un compte **GitHub** (déjà OK : BVDMANN — le dépôt `Stacks-Drive` est à
  créer).
- Une adresse e-mail pour créer les comptes (tu peux utiliser
  `boulinguirandy12@gmail.com`).
- Une carte bancaire **n'est pas demandée** : Supabase et Vercel ont des
  offres gratuites suffisantes pour démarrer.

---

## Étape 1 — Créer le projet Supabase

1. Va sur <https://supabase.com> et connecte-toi (compte déjà créé via
   GitHub pour Skatta).
2. Clique sur **New project**.
3. Choisis un nom (ex : `stacks-drive`), un mot de passe de base de données
   (**note-le quelque part, il ne sert qu'à Supabase**) et une région proche
   (ex : Europe — Francfort).
4. Attends 1 à 2 minutes que le projet soit prêt.

> Ne crée rien d'autre dans Supabase pour l'instant : les tables arrivent à
> l'étape 2.

## Étape 2 — Créer les tables (exécuter `supabase/schema.sql`)

1. Dans ton projet Supabase, ouvre le menu **SQL Editor** (icône `</>` dans
   la barre latérale).
2. Clique sur **New query**.
3. Ouvre le fichier `supabase/schema.sql` du dépôt Stacks Drive, **copie
   tout son contenu** et colle-le dans l'éditeur SQL.
4. Clique sur **Run** (ou `Ctrl+Entrée`).
5. Vérifie : dans le menu **Table Editor**, tu dois voir 3 tables —
   `profiles`, `rides`, `bookings` — et 6 courses déjà présentes dans
   `rides` (les 6 courses d'exemple du lancement, marquées fictives).

Si une erreur apparaît, vérifie que tu as copié le fichier **en entier** et
relance : le script est conçu pour être relancé sans doublon (le seed ne se
duplique pas).

## Étape 3 — Activer l'authentification par e-mail

1. Dans Supabase, ouvre **Authentication → Providers**.
2. Vérifie que **Email** est activé (c'est le cas par défaut).
3. Toujours dans **Authentication**, ouvre **URL Configuration** :
   - **Site URL** : mets l'adresse de ton site Vercel (tu l'auras à l'étape
     5, ex : `https://stacks-drive.vercel.app`). Tu peux mettre une adresse
     temporaire maintenant et la corriger après le déploiement.
   - **Redirect URLs** : ajoute `https://stacks-drive.vercel.app/auth/callback`
     (remplace par ta vraie adresse Vercel). Si tu testes en local, ajoute
     aussi `http://localhost:3000/auth/callback`.
4. (Optionnel) Dans **Authentication → Email Templates**, personnalise le
   sujet de l'e-mail de confirmation, ex : « Confirme ton compte Stacks Drive ».

> Sans cette étape, le lien de vérification reçu par e-mail ne redirigera pas
> vers ton site.

## Étape 4 — Récupérer les clés et créer `.env.local`

1. Dans Supabase, ouvre **Project Settings → API**.
2. Note (ou copie) deux valeurs :
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** (clé publique) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Dans le dossier du projet, crée un fichier `.env.local` à la racine (à côté
   de `package.json`) avec ce contenu :

```env
NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ta-cle-anon-publique
```

4. **Ne mets jamais la clé `service_role` dans ce fichier** : elle donne un
   accès total à la base et ne doit jamais quitter le tableau de bord
   Supabase.

> `.env.local` n'est jamais envoyé sur GitHub (il est dans `.gitignore`).
> Ne partage jamais son contenu.

## Étape 5 — Déployer sur Vercel

1. Va sur <https://vercel.com> et connecte-toi (compte déjà créé via GitHub
   pour Skatta).
2. Clique sur **Add New → Project**, puis **Import** le dépôt
   `BVDMANN/Stacks-Drive`.
3. Vercel détecte Next.js tout seul : laisse les réglages par défaut
   (Framework Preset : Next.js, Build Command : `npm run build`).
4. Dans la section **Environment Variables**, ajoute les 2 variables de
   l'étape 4 :
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Clique sur **Deploy** et attends 1 à 2 minutes.
6. Note l'adresse du site (ex : `https://stacks-drive.vercel.app`).

**Reviens ensuite à l'étape 3** pour mettre cette adresse comme Site URL et
Redirect URL dans Supabase, puis **redéploie** sur Vercel (onglet
Deployments → ⋯ → Redeploy) pour que tout soit cohérent.

> Si le build échoue sur une erreur de dépendance, vérifie dans
> **Settings → Build and Deployment → Install Command Override** que la
> commande est `npm install --legacy-peer-deps` (même correctif que pour
> Skatta).

## Étape 6 — Tester le parcours complet

1. **Inscription passager** : sur le site, clique « S'inscrire », choisis
   **Passager**, remplis le formulaire. Tu dois recevoir un e-mail de
   vérification (vérifie les spams) — clique sur le lien : tu arrives
   connecté sur le site.
2. **Réservation** : ouvre une course, clique « Réserver », choisis le
   nombre de places et le moyen de paiement. La réservation apparaît dans
   **Mes courses** avec le statut « En attente », et la découpe du tarif
   (part chauffeur / frais plateforme) est affichée.
3. **Inscription chauffeur** : déconnecte-toi, inscris un deuxième compte
   avec le rôle **Chauffeur** (utilise une autre adresse e-mail, ou la même
   avec un `+` : ex `boulinguirandy12+chauffeur@gmail.com`). Renseigne ton
   véhicule dans **Mon compte**.
4. **Publication** : connecte-toi en chauffeur, va dans **Tableau de bord**,
   clique « + Publier une course », remplis le formulaire et publie. La
   course apparaît immédiatement dans la liste.
5. **Réservation chauffeur** : connecte-toi en passager, réserve une place
   sur la course que tu viens de publier. Reconnecte-toi en chauffeur : la
   réservation apparaît dans ton tableau de bord, avec le nom et le
   téléphone du passager. Change son statut (ex : « Confirmée »), puis
   « Terminée » après le trajet : les gains nets s'affichent.
6. **Mot de passe oublié** : déconnecte-toi, clique « Mot de passe oublié »,
   reçois l'e-mail et choisis un nouveau mot de passe.

Si tout ça fonctionne, **Stacks Drive est en ligne et commercialisable**.

## Étape 7 — Te nommer admin et vérifier les chauffeurs

1. Dans Supabase, ouvre **SQL Editor** et exécute (remplace par ton e-mail) :

```sql
update public.profiles set is_admin = true where email = 'ton-email@gmail.com';
```

2. Connecte-toi sur le site avec ce compte : le lien **Admin** apparaît
   dans le menu. Le tableau de bord admin affiche les statistiques
   (courses, réservations, chauffeurs, commission totale) et la liste des
   chauffeurs à vérifier.
3. Pour vérifier un chauffeur (badge « Vérifié » sur ses courses), clique
   sur **Vérifier** dans la liste, ou en SQL :

```sql
update public.profiles set is_verified = true where email = 'chauffeur@example.com';
```

> Seul un admin peut attribuer la vérification : un chauffeur ne peut pas
> s'auto-vérifier (la base refuse).

## Étape 8 — Lancement : retirer les courses démo quand les vrais chauffeurs arrivent

Les 6 courses initiales sont des **exemples fictifs** : elles montrent à
quoi ressemble une course, mais aucun vrai chauffeur n'est derrière. Quand
les premiers vrais chauffeurs ont publié :

1. Dans Supabase → **SQL Editor**, exécute :

```sql
delete from public.rides where is_demo = true;
```

2. Mets le lien du site partout où il doit apparaître (portfolio, LinkedIn…).

---

## Dépannage rapide

| Problème | Cause probable / solution |
|---|---|
| « Lien de vérification invalide / expiré » | La Site URL de Supabase (étape 3) ne correspond pas à l'adresse Vercel. Corrige-la et redemande un e-mail. |
| Aucune course affichée | Les clés Supabase ne sont pas dans Vercel (étape 5.4) ou le `schema.sql` n'a pas été exécuté (étape 2). |
| « Rôle chauffeur requis » à la publication | Le compte connecté est un compte passager. Crée un compte chauffeur (étape 6.3). |
| Réservation : « Tu as déjà réservé cette course » | Normal : un passager ne peut réserver qu'une seule fois une même course. |
| Réservation : « Plus que X place(s) disponible(s) » | Les places sont parties entre-temps. Les places se libèrent si une réservation est annulée. |
| E-mail de vérification jamais reçu | Vérifie les spams. Dans Supabase → Authentication → Users, vérifie que l'utilisateur existe. En développement, Supabase peut limiter l'envoi (voir les quotas du plan gratuit). |
| Le lien Admin n'apparaît pas | L'étape 7 n'a pas été faite (ou pas sur le bon e-mail). Vérifie avec `select email, is_admin from public.profiles;`. |
| La commission affichée n'est pas 5 % | C'est normal après 3 mois : la constante passe à 8 % dans `lib/commission.ts` (voir « Commission » ci-dessous). |

## Commission

Le taux de commission est **une seule constante** dans le code :
`lib/commission.ts` → `COMMISSION_RATE = 0.05` (5 % au lancement, 3 mois),
puis `COMMISSION_RATE_PERMANENT = 0.08` (8 %), avec un plafond garanti de
10 % (`COMMISSION_CAP`). La découpe est figée dans chaque réservation au
moment où elle est créée : un changement de taux ne modifie jamais les
courses déjà réservées.

## Coûts (plans gratuits)

- **Supabase** : gratuit (500 Mo de base, 50 000 utilisateurs/mois).
- **Vercel** : gratuit (100 Go de bande passante/mois).

Au-delà, chaque service propose un plan payant à la consommation — à
réévaluer quand le trafic grandira.

## Fichiers importants du projet

- `supabase/schema.sql` — tables, sécurité (RLS), triggers et 6 courses d'exemple.
- `supabase/migration-v2.sql` — modèle Uber (demandes + propositions, vérification).
- `supabase/migration-v2.2.sql` — code PIN, gains chauffeur, gamification,
  avis & plaintes, journal d'audit (à exécuter UNE fois, voir ci-dessous).
- `supabase/migration-v2.3.sql` — points chauffeur (table `driver_points`,
  colonne `profiles.free_rides_remaining`, colonne
  `driver_earnings.is_free_ride`, fonction `redeem_points_for_free_rides`,
  `finalize_ride_earnings` remplacée) — à exécuter UNE fois après le
  déploiement de la v2.3. Ne JAMAIS réexécuter les migrations précédentes.
- `.env.example` — la liste des variables à remplir (sans aucune valeur).
- `lib/commission.ts` — le taux de commission (5 % puis 8 %, plafond 10 %).
- `lib/gamification.ts` — TOUS les chiffres de la gamification (quêtes,
  Course Double, niveaux, dépôt, plafond de dette) — c'est ici qu'on règle.
- `app/` — les pages (accueil, courses, connexion, inscription, tableau de
  bord, mes courses, compte, admin, pages légales).
- `lib/` — connexion Supabase, accès aux courses, calcul des tarifs.
- `components/` — les composants de l'interface.

---

# Stacks Drive v2.2 — Mise en ligne

Tableau de bord chauffeur (gains par course, 24 h, semaine, mois, montant
dû, dépôt, dette vs plafond), gamification (célébrations, quêtes, séries,
niveaux, badges, Course Double, chauffeur de la semaine, nudges), code PIN
de démarrage, vue course chauffeur, avis & plaintes (les deux côtés),
plan d'urgence (prix côté serveur, bornes, idempotence, journal d'audit,
page d'erreur de marque).

## Étape 1 — Push GitHub (par Randy / Ruby, comme pour la v2)

Pousser le contenu de `~/workspace/stacks-drive-v2/` sur
`BVDMANN/Stacks-Drive`, branche `main`. Vercel redéploie automatiquement.

## Étape 2 — Exécuter migration-v2.2.sql dans Supabase (UNE fois)

Dashboard Supabase → projet « stacks-drive » → SQL Editor → coller le
contenu complet de `supabase/migration-v2.2.sql` → Run.

Le script est additif et protégé (`if not exists`, `on conflict`) :
- colonnes PIN + gains sur `rides`, dépôt + niveau sur `profiles` ;
- tables `driver_earnings` (1 ligne par course, unique `ride_id`),
  `driver_settlements`, `ride_feedback`, `audit_log`, `driver_badges`,
  `quest_bonus_claims` + RLS ;
- fonctions `verify_ride_pin()`, `finalize_ride_earnings()` (idempotente),
  `get_driver_of_week()`.

Vérifications après exécution (requêtes en bas du script) :
- `select count(*) from public.driver_earnings;` → **0**
- `select count(*) from public.ride_feedback;` → **0**
- `select proname from pg_proc where proname in ('verify_ride_pin',
  'finalize_ride_earnings', 'get_driver_of_week');` → **3 lignes**
- `select column_name from information_schema.columns where table_name =
  'rides' and column_name in ('pin_code', 'pin_locked', 'is_double_ride',
  'commission_rate');` → **4 lignes**

## Étape 3 — Vérifier le déploiement Vercel

Comme pour la v2 : le déploiement du push doit être « Ready », puis
vérifier en chargement frais : 6 marqueurs, prix, pages légales, auth.

## Étape 4 — Vérifier la v2.2 (checklist manuelle)

1. **Inscription réelle** : créer 1 compte passager + 1 compte chauffeur,
   vérifier la réception des e-mails.
2. **Flux complet avec 2 comptes** : demande → proposition → acceptation →
   le passager voit son code PIN en gros → le chauffeur le saisit → la
   course démarre → clôture → la popup de célébration s'affiche (montant
   gardé, % gardé, quête).
3. **Code PIN faux** : 1 code faux = message + essais restants ; 5 codes
   faux = course verrouillée, visible dans /admin (à déverrouiller).
4. **Tableau de bord chauffeur** : gains du jour / semaine / mois, montant
   dû, barre dette vs plafond, dépôt, quête, niveau, badges.
5. **Avis & plaintes** : après une course terminée, noter + déposer une
   plainte (catégorie) + une recommandation — visibles dans /admin.
6. **Admin** : dépôts & règlements (enregistrer un dépôt / un règlement),
   journal d'audit, coût des récompenses.
7. **Erreur de marque** : couper le réseau ou forcer une erreur 500 →
   la page « Service momentanément indisponible » s'affiche (pas d'écran vide).

## Dépannage v2.2

| Problème | Cause probable / solution |
|---|---|
| « Le code PIN n'est pas encore activé » au démarrage | La migration v2.2 n'a pas été exécutée (étape 2). |
| Gains à 0 dans le tableau de bord | La migration v2.2 n'a pas été exécutée, ou les courses ont été terminées avant elle — le tableau de bord les finalise tout seul à l'affichage (réparation paresseuse). |
| « Plafond de dette atteint » pour un chauffeur | Ses commissions non réglées atteignent ~5 000 FCFA : enregistrer un règlement dans /admin (section Dépôts & règlements). |
| Prix refusé à la proposition | Le prix est hors bornes (400–50 000 FCFA) ou trop éloigné du tarif de référence (×2) : voir le journal d'audit dans /admin. |
| Course verrouillée (PIN) | 5 codes faux : la débloquer dans /admin (section Dépôts & règlements → Courses verrouillées). |

---

# Stacks Drive v2.3 — Mise en ligne

Prix baissés de 24 % (matrice `lib/pricing.ts` : nouveaux overrides +
formule ×0,76 ; plancher Groupe 400 FCFA, Solo 550 FCFA), points
chauffeur à la place de l'argent direct, vraie page d'accueil
chauffeur. Commission inchangée : 5 % au lancement, 8 % ensuite,
plafond 10 % (`lib/commission.ts` — ne jamais toucher).

## Étape 1 — Déployer le code (Vercel, automatique au push)

Comme pour la v2.2 : push sur `main` → déploiement Vercel → vérifier
« Ready » en Production, puis vérifier en vrai navigateur en
chargement frais.

## Étape 2 — Exécuter migration-v2.3.sql dans Supabase (UNE fois)

Dashboard Supabase → projet « stacks-drive » → SQL Editor → copier le
contenu complet de `supabase/migration-v2.3.sql` → Run. **Une seule
fois** — ne JAMAIS réexécuter `schema.sql`, `migration-v2.sql` ni
`migration-v2.2.sql`.

Contenu : table `driver_points` (registre des points, RLS : le
chauffeur voit ses lignes, l'admin voit tout), colonne
`profiles.free_rides_remaining`, colonne `driver_earnings.is_free_ride`,
fonction `redeem_points_for_free_rides()` (échange atomique 10 000
points = 5 courses sans commission), `finalize_ride_earnings()`
remplacée (Course Double = points doublés, quêtes en points, borne
d'anomalie 400 FCFA).

Vérifications rapides (SQL Editor) :

```sql
select count(*) from public.driver_points;          -- 0
select column_name from information_schema.columns
  where table_name = 'profiles'
  and column_name = 'free_rides_remaining';        -- 1 ligne
select column_name from information_schema.columns
  where table_name = 'driver_earnings'
  and column_name = 'is_free_ride';                -- 1 ligne
select proname from pg_proc where proname in
  ('finalize_ride_earnings', 'redeem_points_for_free_rides');
```

## Étape 3 — Vérifier la v2.3 (checklist manuelle)

1. **Prix -24 %** : Nzeng-Ayong → Centre-ville affiche Groupe 700 FCFA /
   Solo 1 150 FCFA ; Centre-ville → Aéroport Léon-Mba, Solo 3 800 FCFA ;
   pastille « Aéroport · 3 800 FCFA » sur l'accueil passager.
2. **Accueil chauffeur** : connecté en chauffeur, l'accueil n'affiche
   PLUS le formulaire de commande — interrupteur En ligne / Hors ligne,
   gains du jour, montant dû, points, demandes entrantes, lien vers le
   tableau de bord. La carte ne montre plus les autres chauffeurs.
   Bascule Passager / Chauffeur (en haut) : chaque rôle a son accueil.
3. **Points** : après une course terminée, le tableau de bord affiche
   +100 points (200 sur Course Double, multiplicateur de niveau :
   Argent ×1,05, Or ×1,10, Diamant ×1,25) ; la quête du jour donne
   +1 000 points, le défi hebdo +5 000 points ; la popup de célébration
   affiche les points gagnés.
4. **Échange** : avec 10 000 points, le bouton d'échange du tableau de
   bord est actif — après échange, 5 courses sans commission restantes ;
   la course suivante clôturée a une commission de 0 FCFA et le compteur
   passe à 4. Sans les 10 000 points, le bouton est désactivé.
5. **Course sans commission** : visible dans l'historique du tableau de
   bord (badge « SANS COMMISSION ») et dans /admin (coût des récompenses).

## Dépannage v2.3

| Problème | Cause probable / solution |
|---|---|
| Points à 0 après une course terminée | La migration v2.3 n'a pas été exécutée (étape 2). |
| Échange impossible (« migration v2.3 ») | La fonction `redeem_points_for_free_rides` n'existe pas : exécuter `migration-v2.3.sql` (étape 2). |
| L'accueil chauffeur affiche le formulaire passager | Le profil n'est pas passé à l'accueil (régression `app/page.tsx`) ou le rôle du compte n'est pas « chauffeur ». |
| Prix refusé à la proposition | Le prix est hors bornes (400–50 000 FCFA) ou trop éloigné du tarif de référence (×2) : voir le journal d'audit dans /admin. |

# Stacks Drive v2.4 — Mise en ligne

Vérification chauffeur AUTOMATISÉE (décision de Randy, 14/11/2026 :
« Automatise le max de trucs »). Le chauffeur n'est plus approuvé à la
main : ses photos sont contrôlées dès l'envoi (visage, lecture de la
pièce par OCR, doublons) et le serveur tranche — vérifié, refusé avec
motif, ou ticket pour l'admin. Seuls les dossiers ambigus (et les
doublons) arrivent dans /admin, triés par urgence, avec un e-mail si
Resend est configuré. Commission inchangée : 5 % au lancement, 8 %
ensuite, plafond 10 % (`lib/commission.ts` — ne jamais toucher). Prix
inchangés (`lib/pricing.ts`, `lib/fare-guard.ts` — ne jamais toucher).

## Étape 1 — Déployer le code (Vercel, automatique au push)

Comme pour la v2.3 : push sur `main` → déploiement Vercel → vérifier
« Ready » en Production, puis vérifier en vrai navigateur en
chargement frais.

## Étape 2 — Exécuter migration-v2.4.sql dans Supabase (UNE fois)

Dashboard Supabase → projet « stacks-drive » → SQL Editor → copier le
contenu complet de `supabase/migration-v2.4.sql` → Run. **Une seule
fois** — ne JAMAIS réexécuter `schema.sql`, `migration-v2.sql`,
`migration-v2.2.sql` ni `migration-v2.3.sql`.

Contenu : colonnes `profiles.verification_checks` (JSONB),
`verification_doc_hash`, `verification_image_hash`,
`verification_auto_decision` ; index unique sur le hash du numéro de
pièce ; table `verification_tickets` (RLS : admin partout, chauffeur
en lecture de ses propres tickets) ; fonction
`verification_auto_payload_consistent()` + remplacement du trigger
anti-escalade `prevent_privilege_escalation()` (autorise la décision
automatique du serveur, avec charge utile complète et cohérente).

Vérifications rapides (SQL Editor) :

```sql
select count(*) from public.verification_tickets;   -- 0
select column_name from information_schema.columns
  where table_name = 'profiles'
  and column_name like 'verification_%';            -- 7 lignes (4 anciennes + 3 nouvelles + auto_decision)
select proname from pg_proc where proname =
  'verification_auto_payload_consistent';           -- 1 ligne
```

## Étape 3 — Configurer les e-mails admin (Resend, plan gratuit)

Sans cette étape, tout fonctionne, mais aucun e-mail n'est envoyé :
les tickets restent visibles dans /admin (bandeau « E-mails non
configurés »). **C'est Randy qui crée le compte** (Ruby ne crée pas
de compte à son nom).

1. Aller sur https://resend.com → « Start Building » → créer le
   compte avec l'e-mail **boulinguirandy76@gmail.com**.
2. Dashboard Resend → « API Keys » → « Create API Key » → nom
   « stacks-drive », permission « Sending access » → copier la clé
   (elle commence par `re_`, elle ne s'affiche qu'une fois).
3. Vercel → projet stacks-drive → Settings → Environment Variables →
   ajouter `RESEND_API_KEY` = la clé copiée (Production + Preview),
   puis **redéployer** (Deployments → ⋯ → Redeploy).
4. Optionnel : `ADMIN_EMAIL` (défaut : boulinguirandy76@gmail.com) et
   `EMAIL_FROM` (défaut : `Stacks Drive <onboarding@resend.dev>` —
   l'adresse du plan gratuit, qui ne peut envoyer qu'à l'e-mail du
   propriétaire du compte Resend, c'est-à-dire l'admin lui-même).
   Pour envoyer depuis un domaine à vous, vérifiez le domaine dans
   Resend (Domaines → Add Domain) puis définissez EMAIL_FROM en
   conséquence.
5. En local : copier `.env.example` en `.env.local` et remplir
   `RESEND_API_KEY` (jamais commité).

## Étape 4 — Vérifier la v2.4 (checklist manuelle)

1. **Auto-vérifié** : avec un compte chauffeur de test, envoyer un
   selfie net + une CNI lisible (nom = nom du compte, majeure, en cours
   de validité) → l'écran affiche « Compte vérifié ! » et le chauffeur
   peut se mettre en ligne immédiatement, sans action admin.
2. **Auto-refusé** : envoyer une pièce expirée (ou un selfie sans
   visage + une pièce illisible) → l'écran affiche le motif précis et
   le chauffeur peut renvoyer.
3. **Ticket** : envoyer une pièce floue / partiellement lisible → le
   dossier reste « en cours », un ticket apparaît dans /admin (section
   « Tickets de vérification », trié par urgence) et, si Resend est
   configuré, un e-mail arrive sur boulinguirandy76@gmail.com avec
   l'explication, le compte rendu des contrôles et le niveau d'urgence.
4. **Résolution** : dans /admin, ouvrir le ticket → approuver, refuser
   ou demander de refaire → le statut du chauffeur et le ticket sont
   mis à jour, et l'événement apparaît dans le journal d'audit.
5. **Rappel de règlement** : sur le tableau de bord d'un chauffeur qui
   doit des commissions depuis plus de 7 jours, un bandeau de rappel
   s'affiche dans « Ce que tu dois ».

## Dépannage v2.4

| Problème | Cause probable / solution |
|---|---|
| Tous les dossiers restent « en cours » | La migration v2.4 n'a pas été exécutée (étape 2) : la route retombe sur l'ancien flux (revue manuelle). |
| Aucun e-mail de ticket reçu | `RESEND_API_KEY` absente ou redéploiement Vercel oublié (étape 3) ; vérifier le bandeau dans /admin. Sur le plan gratuit, l'expéditeur `onboarding@resend.dev` ne peut écrire qu'à l'e-mail du compte Resend. |
| « Vérification déjà en cours » au renvoi | Le dossier est en attente (ticket ouvert) : l'admin doit d'abord trancher, ou le chauffeur attend la décision. |
| OCR très lent sur téléphone | Tesseract.js télécharge ses données au premier usage (~10 Mo) ; la lecture prend ensuite quelques secondes. Si le réseau est faible, le dossier part quand même et le serveur tranche. |
| FaceDetector indisponible (iPhone/Safari) | Normal : la détection de visage native n'existe que sur Chrome/Android. Le contrôle est marqué « indisponible » et ne bloque pas — l'OCR fait foi. |
