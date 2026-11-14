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
| `ADMIN_EMAIL` | Défaut : stacks.markett@gmail.com (boîte Stacks Market, lue par Randy) — la variable d'environnement, si elle est définie dans Vercel, reste prioritaire | Non |
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
- **Quartiers :** 49 quartiers de Libreville (`lib/neighborhoods.ts`),
  noms affichés sur la carte, listes de départ / destination.
- **Lieux :** 24 lieux sur la carte (`lib/pois.ts`) : supermarchés,
  marchés, stations-service, pharmacies, hôtel, santé, lieux publics
  (pictogrammes dès le zoom 13, noms dès le zoom 15).
- **Quartiers à accès difficile :** 11 quartiers ne sont pas desservis
  sur route bitumée. La course s'y arrête par défaut à un point de
  dépôt sur route bitumée ; le passager peut demander la continuité
  sur route non bitumée pour un supplément forfaitaire de **800 FCFA**
  (`UNPAVED_ROAD_SUPPLEMENT`, `lib/pricing.ts`) ; le chauffeur est
  libre d'accepter ou non — s'il refuse, la destination devient le
  point de dépôt et le supplément est retiré.
- **Commission :** 5 % au lancement (3 mois), puis 8 % permanent,
  **plafond 10 % garanti** (`lib/commission.ts` — ne jamais toucher aux
  taux sans décision de Randy). La commission est calculée sur le total
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
verrouillées (PIN), avis et plaintes.

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
| Points à 0 après une course terminée | La migration v2.3 n'a pas été exécutée (§3). |
| Échange de points impossible | La fonction `redeem_points_for_free_rides` n'existe pas : exécuter `migration-v2.3.sql` (§3). |
| Tous les dossiers de vérification restent « en cours » | La migration v2.4 n'a pas été exécutée (§3) : la route retombe sur l'ancien flux (revue manuelle). |
| Aucun e-mail de ticket reçu | `RESEND_API_KEY` absente ou redéploiement Vercel oublié (§1) ; vérifier le bandeau dans /admin. Sur le plan gratuit, l'expéditeur `onboarding@resend.dev` ne peut écrire qu'à l'e-mail du compte Resend. |
| « Plafond de dette atteint » pour un chauffeur | Ses commissions non réglées atteignent ~5 000 FCFA : enregistrer un règlement dans /admin (Dépôts & règlements). |
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
