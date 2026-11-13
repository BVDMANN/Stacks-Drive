# Stacks Drive

**Stacks Drive** — application de mise en relation chauffeurs / passagers, à Libreville d'abord.

🌐 **En ligne :** https://stacks-drive.vercel.app
🏢 **Par :** Stacks (Randy Boulingui — entreprise individuelle, SIREN 104 314 687)
📍 **Zone :** Libreville, Gabon (d'abord)

## C'est quoi ?

Une appli type Uber, pensée pour Libreville : le passager demande une course, les chauffeurs en ligne reçoivent une pop-up et font une proposition (prix, places restantes, premier arrêt). Le passager accepte ou refuse. Pas de surge, des prix fixes, des chauffeurs vérifiés, et le chauffeur garde 92 à 95 % de chaque course.

- **Deux types de course :** Solo (privée, directe, prix plein) et Groupe (partagée, prix divisé, arrêts multiples dans l'ordre — par défaut, badge « LE MOINS CHER »). Moto = Solo uniquement.
- **Commission :** 5 % au lancement (3 mois), puis 8 % permanent, **plafond 10 % garanti** (voir `lib/commission.ts`).
- **Paiement :** le passager paie le chauffeur directement (espèces ou transfert P2P Airtel Money / Moov Money). L'appli ne touche jamais l'argent — elle compte seulement. Commission réglée 1 fois par semaine, en un seul transfert Mobile Money. Dépôt de garantie remboursable : 5 000 FCFA. Plafond de dette : ~5 000 FCFA.
- **Sécurité :** vérification chauffeur dès le jour 1 (selfie + pièce d'identité), SOS (112), partage de course en direct, code PIN à 4 chiffres donné au chauffeur pour démarrer la course.
- **Fidélité :** 10e course offerte (passager gratuit, chauffeur payé intégralement).
- **Gamification chauffeur :** tableau de bord clair (par course, 24 h, dû en temps réel, récaps hebdo / mensuel), célébrations, quêtes, séries, niveaux Bronze / Argent / Or / Diamant, badges, « Course Double ».

## Stack technique

- **Front / back :** Next.js (App Router, React 19) — TypeScript
- **Base de données + Auth :** Supabase (Postgres + RLS) — projet « stacks-drive », région Francfort
- **Hébergement :** Vercel (projet « stacks-drive »)
- **Carte :** Leaflet vanilla + tuiles Esri Dark Gray (gratuites, sans clé) — jamais react-leaflet (conflit peer dep React 19)

## Installation (développement local)

```bash
npm install
cp .env.example .env.local   # renseigner NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

```bash
npm run build   # doit passer avant tout push
```

## Base de données

- `supabase/schema.sql` — schéma v1. **Ne jamais réexécuter.**
- `supabase/migration-v2.sql` — migration v2 (exécutée une fois, le 13/11/2026).
- `supabase/migration-v2.2.sql` — migration v2.2 (tableau de bord chauffeur, gamification, PIN, retours). **À exécuter une seule fois, dans Supabase (SQL Editor), après le push.**

## Où sont les docs ?

- **Pilotage (état des lieux, lancement, paperasse) :** `docs/` — commencer par [`docs/etat-des-lieux-lancement.md`](docs/etat-des-lieux-lancement.md).
- **Mise en ligne :** `SETUP.md` (v1), `SETUP-v2.md` (migration v2).
- **Pages légales (dans l'appli) :** `app/cgu/page.tsx`, `app/confidentialite/page.tsx`, `app/cookies/page.tsx`, `app/mentions-legales/page.tsx`.
- **Règles métier :** `lib/commission.ts` (commission 5 % / 8 % / plafond 10 %), `lib/pricing.ts` (matrice des tarifs fixes), `lib/gamification.ts` (tous les chiffres de la gamification, réglables en un seul endroit), `lib/fare-guard.ts` (sécurité des prix : revalidation côté serveur, bornes, audit).

## État du produit

- **v2.1.2** — en ligne et vérifiée en vrai navigateur le 13/11/2026 (6 marqueurs chauffeurs, noms de rues au zoom, thème « Libreville la nuit », CGU modèle dépôt + plafond).
- **v2.2** — tableau de bord chauffeur, gamification, code PIN, vue course chauffeur, recommandations & plaintes, fiabilité des prix et des paiements, page d'erreur de marque.

## Règles à respecter avant de modifier le code

1. Ne jamais toucher aux taux de `lib/commission.ts` sans décision de Randy.
2. Les prix sont calculés et revalidés **côté serveur uniquement** (`lib/fare-guard.ts`) — jamais de prix envoyé par le client accepté tel quel.
3. Les chauffeurs ne publient rien : ils se mettent en ligne, le passager demande, le chauffeur propose. Modèle Uber, pas BlaBlaCar.
4. L'appli ne touche jamais l'argent : pas de wallet prépayé, pas d'abonnement.
5. `npm run build` doit passer avant tout push. Vérifier en vrai navigateur, en chargement frais, après chaque déploiement.
