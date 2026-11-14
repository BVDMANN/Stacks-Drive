# Stacks Drive

**Stacks Drive** — application de mise en relation chauffeurs / passagers, à Libreville d'abord.

🌐 **En ligne :** https://stacks-drive.vercel.app
🏢 **Par :** Stacks (Randy Boulingui — entreprise individuelle, SIREN 104 314 687)
📍 **Zone :** Libreville, Gabon (d'abord)
📌 **Version en ligne :** v2.6 (commit `65996054`, 14/11/2026)

## C'est quoi ?

Une appli type Uber, pensée pour Libreville : le passager demande une course, les chauffeurs en ligne reçoivent une pop-up et font une proposition (prix, places restantes, premier arrêt). Le passager accepte ou refuse. Des prix fixes, des chauffeurs vérifiés, et le chauffeur garde 92 à 95 % de chaque course.

- **Deux types de course :** Solo (privée, directe, prix plein) et Groupe (partagée, prix divisé, arrêts multiples dans l'ordre — par défaut, badge « LE MOINS CHER »). Moto = Solo uniquement.
- **Commission :** 5 % au lancement (3 mois), puis 8 % permanent, **plafond 10 % garanti** (voir `lib/commission.ts`). La commission est calculée sur le total de la course, supplément route non bitumée compris.
- **Paiement :** le passager paie le chauffeur directement (espèces ou transfert P2P Airtel Money / Moov Money). L'appli ne touche jamais l'argent — elle compte seulement. Commission réglée 1 fois par semaine, en un seul transfert Mobile Money. Dépôt de garantie remboursable : 5 000 FCFA. Plafond de dette : ~5 000 FCFA.
- **Sécurité :** vérification chauffeur automatisée dès l'inscription (selfie + pièce d'identité, décision automatique ou ticket admin), SOS (112), partage de course en direct, code PIN à 4 chiffres donné au chauffeur pour démarrer la course.
- **Carte :** 49 quartiers de Libreville avec leurs noms affichés sur la carte, 24 lieux (supermarchés, marchés, stations, pharmacies, hôtels, santé, lieux publics), icônes chauffeurs dorées avec note, feuille de demande à 3 positions (façon Uber) avec bouton pour la replier et voir la carte.
- **Quartiers à accès difficile :** 11 quartiers ne sont pas desservis sur route bitumée — la course s'arrête par défaut à un point de dépôt sur route bitumée ; le passager peut demander la continuité sur route non bitumée pour un supplément forfaitaire de **800 FCFA**, que le chauffeur est libre d'accepter ou non.
- **Fidélité :** 10e course offerte ; points chauffeur (100 points/course, 10 000 points = 5 courses sans commission).

## Stack technique

- **Front / back :** Next.js (App Router, React 19) — TypeScript
- **Base de données + Auth :** Supabase (Postgres + RLS) — projet « stacks-drive », région Francfort
- **Hébergement :** Vercel (projet « stacks-drive »)
- **Carte :** Leaflet vanilla + tuiles Esri Dark Gray (gratuites, sans clé) — jamais react-leaflet (conflit peer dep React 19)
- **E-mails admin :** Resend (`RESEND_API_KEY` configurée dans Vercel, Production)

## Installation (développement local)

```bash
npm install
cp .env.example .env.local   # renseigner NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

```bash
npm run build   # doit passer avant tout push
```

## Base de données — migrations exécutées

Toutes les migrations ci-dessous sont **exécutées une seule fois** dans Supabase (SQL Editor). **Ne jamais les réexécuter.**

| Fichier | Contenu |
|---|---|
| `supabase/schema.sql` | Schéma v1 |
| `supabase/migration-v2.sql` | Modèle Uber (demandes + propositions, vérification) |
| `supabase/migration-v2.2.sql` | Tableau de bord chauffeur, code PIN, gains, avis & plaintes, journal d'audit |
| `supabase/migration-v2.3.sql` | Points chauffeur, courses sans commission |
| `supabase/migration-v2.4.sql` | Vérification automatisée, tickets admin |
| `supabase/migration-v2.6.sql` | Accès difficile (colonnes `unpaved_requested`, `drop_off_point`, `unpaved_accepted`) |

## Où sont les docs ?

- **Mise en ligne et maintenance :** `SETUP.md` (guide unique : installation, déploiement, migrations, dépannage).
- **État des lieux :** [`docs/etat-des-lieux-lancement.md`](docs/etat-des-lieux-lancement.md) (produit, comparaison concurrents, forces et faiblesses — état au 14/11/2026).
- **Vérification automatisée :** [`docs/automatisation-verification.md`](docs/automatisation-verification.md).
- **Pages légales (dans l'appli) :** `app/cgu/page.tsx`, `app/confidentialite/page.tsx`, `app/cookies/page.tsx`, `app/mentions-legales/page.tsx`.
- **Règles métier :** `lib/commission.ts` (commission 5 % / 8 % / plafond 10 %), `lib/pricing.ts` (matrice des tarifs fixes, supplément route non bitumée 800 FCFA), `lib/neighborhoods.ts` (49 quartiers, accès difficile, points de dépôt), `lib/pois.ts` (24 lieux sur la carte), `lib/fare-guard.ts` (sécurité des prix : revalidation côté serveur, bornes, audit).

## État du produit (v2.6, en ligne)

- **v2.1.2** — thème « Libreville la nuit », CGU modèle dépôt + plafond.
- **v2.2** — tableau de bord chauffeur, code PIN, vue course chauffeur, recommandations & plaintes, fiabilité des prix et des paiements, page d'erreur de marque.
- **v2.3** — prix baissés de 24 % (`lib/pricing.ts`, planchers Solo 550 / Groupe 400 FCFA) ; points chauffeur (100 points/course, 10 000 points = 5 courses sans commission, Course Double = points doublés, niveaux = multiplicateurs de points) ; vraie page d'accueil chauffeur.
- **v2.4** — vérification chauffeur automatisée (selfie + OCR de la pièce, décision auto ou ticket admin par e-mail via Resend).
- **v2.5** — icônes chauffeurs dorées (pastille or, anneau cyan, badge note, moto distincte) ; quartiers passés de 20 à 49, avec libellés sur la carte (22 visibles au zoom 12, 48 au zoom 14).
- **v2.5.1** — feuille de demande façon Uber : 3 positions (mini 15 %, aperçu 30 %, pleine 58 %), bouton chevron toujours visible pour replier / déplier, bouton flottant doré en position mini.
- **v2.6** — quartiers à accès difficile (11 quartiers, point de dépôt sur route bitumée, supplément route non bitumée 800 FCFA, chauffeur libre d'accepter ou non) ; 24 lieux affichés sur la carte (pictogrammes dès le zoom 13, noms dès le zoom 15).

## Règles à respecter avant de modifier le code

1. Ne jamais toucher aux taux de `lib/commission.ts` sans décision de Randy.
2. Les prix sont calculés et revalidés **côté serveur uniquement** (`lib/fare-guard.ts`) — jamais de prix envoyé par le client accepté tel quel.
3. Les chauffeurs ne publient rien : ils se mettent en ligne, le passager demande, le chauffeur propose. Modèle Uber, pas BlaBlaCar.
4. L'appli ne touche jamais l'argent : pas de wallet prépayé, pas d'abonnement.
5. `npm run build` doit passer avant tout push. Vérifier en vrai navigateur, en chargement frais, après chaque déploiement.
