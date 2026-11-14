# Contribuer à Stacks Drive

Merci de contribuer. Ce document décrit comment travailler sur le dépôt
sans casser ce qui protège les utilisateurs — et sans perdre de temps.

## Prérequis

- Node.js 20, npm.
- Un compte Supabase **de développement** (ou aucun : le build passe
  sans Supabase configuré, les pages dépendant de la base restent vides).

```bash
npm install
cp .env.example .env.local   # renseigner NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                  # serveur local (port 3000 par défaut)
npm run build                # doit passer avant tout push
```

## Avant tout push

```bash
npm run build        # inclut `npm run docs:check` via `prebuild`
npm run docs:check   # les docs doivent être à jour (voir ci-dessous)
```

La CI (`.github/workflows/ci.yml`) exécute ces deux commandes à chaque
push / PR sur `main`. Aucun secret n'est nécessaire.

## Règles qui ne se discutent pas dans une PR

1. **Ne jamais toucher aux taux de `lib/commission.ts`** (5 % puis 8 %,
   plafond 10 %) sans décision du propriétaire.
2. **Ne jamais affaiblir une validation serveur, une politique RLS ou
   le trigger anti-escalade** pour faire passer une fonctionnalité.
   Si une règle gêne, elle se discute dans une ADR (`docs/adr/`), elle
   ne se contourne pas.
3. **Ne jamais introduire de secret** dans le code, les tests, les
   docs ou les messages de commit. Seule la clé anon Supabase (publique,
   protégée par RLS) est exposée. Aucune clé `service_role`.
4. **Ne jamais écrire de nom personnel, d'e-mail personnel ou de
   téléphone personnel** dans le dépôt (ni dans le code, ni dans les
   docs, ni dans les commentaires). Contact public unique :
   stacks.markett@gmail.com.
5. **Ne jamais mettre de mécanique interne, de plan ou de « bientôt /
   à venir »** dans le README ou sur une page publique. Le plan vit
   dans la conversation et les docs internes, jamais dans le dépôt.
6. **Ne jamais modifier le comportement dans un lot « docs +
   commentaires »** : docs et commentaires uniquement, aucune logique
   métier, aucune migration.
7. **Vérifier en vrai navigateur, en chargement frais**, après chaque
   changement visible.

## Les 2 règles (priorité n°1 — à vérifier après chaque lot)

1. Barre de chargement partout où il y a un temps d'attente (prix
   passager, mise en ligne chauffeur, bascule de mode, acceptation,
   envoi / annulation de demande).
2. Switch passager → chauffeur impossible sans compte chauffeur créé ;
   mise en ligne exige un compte vérifié. Verrou côté serveur (PATCH
   `/api/profile`) **et** en base (trigger anti-escalade, migration
   v2.17) — jamais dans l'interface seule.

Détail : `docs/ARCHITECTURE.md` §7.

## Documentation

- **Source de vérité = le code.** `scripts/sync-docs.mjs` recalcule
  les chiffres des documentations depuis les constantes du code et
  réécrit les blocs `<!-- DOC-SYNC: <id> -->` (35 blocs, 4 docs).
  Après toute modification d'une constante métier :
  ```bash
  npm run docs:sync    # met à jour les docs
  npm run docs:check   # vérifie sans écrire
  ```
  **Ne jamais écrire de chiffre à la main dans un bloc DOC-SYNC.**
  Les nouveaux docs (`docs/ARCHITECTURE.md`, `SECURITY.md`,
  `docs/adr/`, `CONTRIBUTING.md`, `CHANGELOG.md`) ne sont pas
  synchronisés : leurs chiffres doivent rester stables et renvoyer
  aux constantes du code plutôt que de les recopier.
- **Architecture :** `docs/ARCHITECTURE.md` — la mettre à jour quand
  un flux, une table ou une règle de sécurité change.
- **Décisions :** un grand choix = une ADR dans `docs/adr/` (contexte,
  décision, conséquences, alternatives écartées). Voir
  `docs/adr/README.md`. Une ADR décrit une décision **prise**, jamais
  un plan.
- **Historique :** `CHANGELOG.md` — une entrée par version livrée,
  rédigée à partir de l'historique réel, sans réécrire le passé.
- **Style des commentaires :** expliquer le **pourquoi** (invariant,
  cas limite, décision), pas le quoi. Les chemins critiques de sécurité
  (RLS, triggers, fare-guard, verrouillage PIN, détection de fraude)
  sont commentés comme une revue de sécurité : l'invariant protégé,
  l'attaque empêchée, le cas limite.

## Migrations base de données

- Une migration = un fichier `supabase/migration-vX.sql`, exécuté
  **une seule fois** dans Supabase (SQL Editor), jamais réexécuté.
- Écrire les migrations de façon idempotente (`CREATE OR REPLACE`,
  `DROP TRIGGER IF EXISTS`, `IF NOT EXISTS`).
- Le code doit rester résilient tant qu'une migration n'est pas
  appliquée (repli calculé ou erreur explicite — jamais de crash
  silencieux).
- Documenter la migration dans le tableau du README et dans
  `SETUP.md` §3, et dans le `CHANGELOG.md`.

## Sécurité

Voir `SECURITY.md` pour signaler une faille. En résumé : ne publiez
jamais une faille avant sa correction ; contact :
stacks.markett@gmail.com.

## Style de code

- TypeScript strict, composants sobres, français pour l'interface
  (l'application est en français d'abord).
- Une seule source de vérité par règle métier : une constante, partagée
  par tous les appelants (`lib/geo.ts`, `lib/pricing.ts`,
  `lib/commission.ts`, `lib/fare-guard.ts`…).
- Zod pour valider tout corps de requête API avant toute lecture en base.
- Pas de prix accepté tel quel sans validation serveur
  (`lib/fare-guard.ts`, bornes 400–50 000 FCFA).
- Les chauffeurs ne publient rien : ils se mettent en ligne, le
  passager demande, le chauffeur propose.
- L'application ne touche jamais l'argent : pas de portefeuille
  prépayé, pas d'abonnement, pas de paiement in-app.
