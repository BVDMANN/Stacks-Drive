# ADR 0020 — Compte admin = admin uniquement

- **Statut :** Acceptée
- **Date :** 14/11/2026
- **Demande :** propriétaire, 14/11 ~22h31 — « bref le compte admin est juste admin hein pas chauffeur pas client ».

## Contexte

Le compte admin (`profiles.is_admin = true`) a le rôle « passager » en
base. Rien ne l'empêchait donc, en théorie, d'agir comme un passager
(commander une course — le contrôle de rôle de POST /api/rides le
laissait passer) ni, via un appel API direct, de toucher aux champs
chauffeur. Les listes de chauffeurs le filtraient déjà par le rôle,
mais seulement implicitement : si le rôle venait à changer, l'admin
apparaissait dans les listes et les compteurs. Les tests utilisent des
comptes séparés, jamais l'admin — mais la séparation n'était écrite
nulle part.

## Décision

Le compte admin est un **troisième rôle, séparé** — ni chauffeur, ni
passager. La séparation s'appuie uniquement sur le drapeau `is_admin`
existant : **aucun changement de schéma** (pas de valeur de rôle
« admin », pas de colonne), aucun e-mail ni nom codé en dur, dans le
code comme dans les docs.

**Verrous serveur** (même logique que la règle 2 — jamais l'UI seule),
tous en 403 `admin_not_allowed` :

- POST /api/rides : création de demande de course rejetée pour un
  admin — avant le contrôle de rôle, puisque le rôle en base de
  l'admin est « passager ».
- GET /api/rides?scope=incoming : l'admin ne reçoit jamais de
  proposition.
- PATCH /api/profile : pour un admin, toute bascule de rôle, toute
  mise en ligne et tout champ chauffeur (véhicule, places, zone)
  sont rejetés. La branche admin de vérification des chauffeurs
  (driverId + verificationStatus) reste autorisée — c'est son travail.
- POST /api/verification, POST /api/proposals, /api/driver/seats
  (GET + PATCH) : rejet explicite de l'admin (le contrôle de rôle
  existant le bloquait déjà — ce rejet verrouille le cas où le rôle
  venait à changer).

**Listes et compteurs** — l'admin n'apparaît jamais comme chauffeur ou
comme passager :

- `getOnlineDrivers`, `getPendingVerifications`, `getAdminStats` :
  `.neq('is_admin', true)` explicite.
- /admin/live (`getLiveSnapshot`) : l'admin est exclu des listes
  chauffeurs ET passagers (donc des compteurs chauffeurs / passagers /
  en ligne) et de l'événement « inscription » du flux. `searchLivePeople`
  ne le renvoie plus dans « Les gens ».
- Choix documenté : le compteur `usersTotal` de /admin/live compte
  toujours tous les comptes — l'admin EST un compte, ce n'est pas un
  compteur de rôle.

**Interface** — l'admin voit l'admin, pas les flux opérationnels :

- `/` redirige l'admin vers /admin (pas de carte + feuille passager).
- Bascule Passager / Chauffeur masquée dans l'en-tête pour l'admin.
- /devenir-chauffeur : rappel admin + boutons « S'inscrire en
  chauffeur » masqués. /tableau-de-bord : même rappel + lien /admin.
- « Mon compte » : badge « Compte admin » (au lieu de « Compte
  passager »). La feuille de demande refuse aussi côté client.

**Base (migration `supabase/migration-v2.45-admin-only.sql`, écrite,
NON exécutée)** — 3 triggers niveau ligne, idempotents, à exécuter
une seule fois dans le SQL Editor après approbation du push :

1. `trg_prevent_admin_operational_role` (profiles) : un compte admin
   ne peut pas devenir chauffeur (`role` reste « passager ») ni se
   mettre en ligne — quel que soit l'appelant, y compris l'admin
   lui-même et le SQL direct.
2. `trg_prevent_admin_ride_request` (rides) : INSERT avec un
   `passenger_id` admin rejeté.
3. `trg_prevent_admin_proposal` (ride_proposals) : INSERT avec un
   `driver_id` admin rejeté.

Ils ferment le contournement direct via PostgREST, comme le trigger
de la règle 2 (v2.17). Le code fonctionne sans cette migration
(verrous API) ; elle n'est que le filet.

## Conséquences

- Un chauffeur existant ne peut pas être « promu » admin en gardant
  son rôle : il faut d'abord le repasser en mode passager et hors
  ligne, ou créer un compte admin dédié. C'est la séparation voulue.
- Les tests avec le compte admin sont impossibles par construction :
  ils utilisent des comptes séparés (le compte de test réel est un
  autre compte, jamais l'admin).
- Les 2 règles restent intactes : la séparation admin s'ajoute à la
  règle 2, elle ne la remplace pas.

## Vérification (niveau de preuve honnête)

- `npm run build` exit 0, `npm run docs:check` OK (35 blocs).
- Rendu mobile 390×844 (serveur dev, port 3100) : pages publiques
  vérifiées sans session ; l'interface admin (redirection `/` →
  /admin, masquage de la bascule, blocage « Devenir chauffeur »)
  est vérifiée par le code + le rendu des pages sans session.
- Rejets serveur : prouvés au niveau du code (gardes explicites
  `is_admin` + `code: 'admin_not_allowed'` sur chaque entrée, et
  vérification statique des gardes). **Non exercés en live** : les
  routes API exigent une session Supabase réelle, absente en dev
  local sans `.env.local` — le rejet en live avec une session admin
  réelle (POST /api/rides, PATCH /api/profile rôle chauffeur,
  POST /api/verification) reste à faire après le push, avec un
  compte admin connecté sur le déploiement.
- Greps propres : 0 nom personnel, 0 e-mail personnel dans les fichiers modifiés.

## Alternatives écartées

- **Nouvelle valeur de rôle « admin »** : changement de schéma
  (contrainte CHECK sur `role`, migration des lectures `role =
  'passager'` partout) pour un bénéfice nul — le drapeau `is_admin`
  existe déjà et est déjà la source de vérité des gardes admin.
- **Vérifier l'e-mail de l'admin** : interdit — aucun identifiant
  personnel en dur dans le code ou les docs.
- **UI seule (masquer les boutons)** : insuffisant — un appel API
  direct contournerait tout, comme pour la règle 2.
