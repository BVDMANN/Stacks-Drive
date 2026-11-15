# ADR 0024 — Profil passager : photo, fidélité réelle, paiement, signalements de carte, sécurité

- **Statut :** acceptée (15/11/2026, lot v2.49 — local, en attente de push).
- **Contexte :** seconde capture du propriétaire (15/11 ~09h12) : le profil Yango — en-tête (photo, nom, téléphone), quatre boutons ronds (Historique, Assistance, Adresses, Paramètres), « Ajouter une photo — seulement visible par les conducteurs durant les courses », « Réductions — saisir un code promotionnel », « Modes de paiement — Espèces », « Améliorer les cartes — ajouter des lieux, corriger des erreurs », « Sécurité », « Informations ». La consigne : même structure, adaptée à Drive, avec le mécanisme réel derrière chaque élément (précision du propriétaire, 15/11 ~09h19 : « tout le consort qui vient avec, les mécanismes etc. »). La page `/compte` existante était une suite de formulaires sans structure de profil : elle est restructurée, sans toucher au côté chauffeur (vérification) qui garde sa forme.

## Décision

1. **En-tête + 4 boutons ronds.** Photo (optionnelle), nom, téléphone, indicateur de complétion RÉEL (X/2 : photo + téléphone — aucun chiffre inventé). Quatre boutons ronds : Historique (→ /mes-courses, existe v2.10), Assistance (→ /aide + litiges, existe), Adresses (→ #adresses, lieux favoris v2.30 — ancre ajoutée dans `ProfileForm`), Paramètres (→ #parametres, le formulaire de compte existant).
2. **Photo passager — upload + règle de visibilité stricte.** `POST /api/profile/photo` (image ≤ 5 Mo, bucket privé `passenger-photos`, chemin `${user.id}/photo-${stamp}.${ext}`, ancienne photo supprimée après succès) ; `GET` (URL signée 1 h pour le propriétaire) ; `DELETE` (retrait). La photo est montrée au chauffeur assigné UNIQUEMENT pendant la course (cohérent avec la règle v2.20 : identité visible seulement au matching / course acceptée) : la lecture passe par `GET /api/rides/[id]/passenger-photo`, qui vérifie que l'appelant est le chauffeur de la course ET que le statut est `acceptee` ou `en_cours` — sinon 403. **Aucune clé service_role dans le code** (tout passe par la clé anon + RLS) : la visibilité est donc appliquée par une politique de stockage (« Assigned driver reads passenger photo during the ride » : `exists (select 1 from rides where passenger_id = folder AND driver_id = auth.uid() AND status in ('acceptee','en_cours'))`) — dès la course terminée ou annulée, la photo n'est plus lisible. Côté chauffeur, `PassengerPhotoBadge` affiche la photo sur la page de course (rien du tout si l'API refuse : pas de placeholder, pas d'erreur). **Migration `supabase/migration-v2.49-passenger-photo.sql` écrite, NON exécutée** (colonne `profiles.photo_url` + bucket + 5 politiques) : sans elle, les routes répondent 503 explicite (« base pas à jour ») et le formulaire se désactive avec un message honnête — jamais de crash, jamais de photo affichée par erreur.
3. **Fidélité réelle — « Ta 10e course offerte ».** Pas de champ « code promotionnel » (aucun code n'existe, pas d'UI morte) : la section affiche la progression réelle vers la course offerte, avec la MÊME règle serveur que celle qui rend la 10e course gratuite (`getPassengerLoyaltyProgress`, `lib/rides.ts` : `loyaltyFree = (completedCount % 10) === 9` — `towardFree = completed % 10`, `nextIsFree` quand `towardFree === 9`). Barre de progression + « Encore X courses avant ta course offerte » ou « Ta prochaine course est offerte ». Si la lecture échoue, la section est masquée (jamais de chiffre inventé).
4. **Paiement au chauffeur — affichage seul.** Les VRAIS moyens : Espèces / Airtel Money / Moov Money, payés directement au chauffeur (modèle Drive, l'appli ne touche pas l'argent). Aucune saisie de carte, aucun moyen inventé.
5. **« Signaler une erreur de carte » — vrai ticket.** Formulaire simple (4 types : lieu manquant, quartier mal placé, erreur d'adresse, autre ; titre 5–120 caractères, détails 10–2000) → `POST /api/map-reports` → table `map_reports` → section /admin (`MapReportsReview` : filtre ouverts/tous, prendre en charge / marquer résolu / rejeter via `PATCH /api/admin/map-reports/[id]`). Même mécanisme que les tickets de vérification. **Migration `supabase/migration-v2.49-map-reports.sql` écrite, NON exécutée** : sans elle, la route répond 503 et le formulaire le dit.
6. **Sécurité + Informations — regroupement de l'existant.** Sécurité : SOS 112 (`tel:112`), contacts de confiance (`TrustedContactsForm`), partage de course et PIN expliqués (liens réels, rien de réinventé). Informations : liens CGU, confidentialité, mentions légales (existant).
7. **Indicateur de complétion sur l'accueil.** Ligne « Compléter ton profil — X/2 » dans la feuille idle (sous « Mes lieux », au-dessus de « Ta sécurité ») : photo (depuis `GET /api/profile/photo`) + téléphone (du profil). Visible seulement tant que le profil est incomplet ; disparaît quand tout est en place. Sans la migration v2.49a, la photo est inconnue et la ligne est masquée.
8. **Côté chauffeur inchangé** : `/compte` chauffeur garde `ProfileForm` + `VerificationForm` (la photo passager ne le concerne pas — le chauffeur a déjà son selfie de vérification).

## Ce qui vient de Yango, ce qui est propre à Drive

| Écran / mécanisme | Inspiration Yango | Innovation Drive |
|---|---|---|
| En-tête profil | Photo, nom, téléphone, complétion 1/2 | Complétion réelle (photo + téléphone), barre de progression, texte qui dit ce qui manque |
| 4 boutons ronds | Historique, Assistance, Adresses, Paramètres | Mêmes 4, reliés à l'existant Drive (historique v2.10, aide, lieux v2.30, réglages) — aucun lien mort |
| Photo | « Seulement visible par les conducteurs durant les courses » | Visibilité appliquée par RLS (politique de stockage bornée aux statuts acceptee/en_cours) + URL signée 1 h — pas juste une promesse d'UI |
| Réductions | « Saisir un code promotionnel » | Remplacé par la fidélité réelle X/10 (même règle serveur que la gratuité) — pas de champ mort |
| Paiement | « Espèces » | Les 3 vrais moyens Drive (Espèces / Airtel / Moov), affichage seul — l'appli ne touche pas l'argent |
| Améliorer les cartes | « Ajouter des lieux, corriger des erreurs » | Vrai ticket visible dans /admin (table + file de traitement), utile vu les corrections de libellés en cours |
| Sécurité / Informations | Sections regroupées | Regroupement de l'existant Drive (SOS, contacts, partage, PIN ; CGU, confidentialité, mentions légales) |

## Effets et anticipations

- **Effets :** barre de progression animée (fidélité, complétion) ; pastille photo qui apparaît au toucher ; micro-interactions (`active:scale`) sur les boutons ronds et les types de signalement.
- **Anticipations :** photo absente (initiales, pas de cadre vide) ; base pas à jour (formulaire désactivé avec message honnête, jamais de crash) ; signalement sans migration (503 explicite) ; fidélité illisible (section masquée) ; chauffeur hors course (photo refusée par l'API, rien affiché) ; téléphone non renseigné (texte « Téléphone non renseigné », pas de champ vide).
- **Cohérence designer :** la page reste claire (cartes blanches, comme les autres pages secondaires) — la « Nuit violette » est l'accueil et la carte, pas les pages de compte ; un seul style de carte, un seul style de bouton.

## Preuves et limites de vérification

- `npm run build` exit 0 (43 pages, routes `/api/profile/photo`, `/api/map-reports`, `/api/rides/[id]/passenger-photo`, `/api/admin/map-reports/[id]` présentes) ; `npm run docs:check` OK (35 blocs) ; rendus mobiles Playwright 390×844 (serveur dev port 3100) : page /compte restructurée (en-tête, 4 boutons, fidélité, paiement, signalement, sécurité, infos) ; greps de propreté passés (0 nom personnel, 0 mention d'origine artificielle du contenu, 0 clé secrète) ; les 2 règles vérifiées intactes.
- **Non prouvé en local :** les flux de bout en bout (pas de `.env.local`, Supabase non configuré en dev) — upload photo, visibilité chauffeur pendant une course réelle, dépôt de signalement jusqu'à /admin, progression fidélité sur un vrai historique : à tester après push + migrations, avec une session réelle.

## Conséquences

- Deux migrations à exécuter une seule fois chacune, après approbation, dans cet ordre : `migration-v2.49-passenger-photo.sql` puis `migration-v2.49-map-reports.sql`. Sans elles, le code dégrade proprement (503 explicites, sections masquées ou désactivées).
- Nouveau bucket privé `passenger-photos` + table `map_reports` + 5 politiques de stockage + 3 politiques RLS.
- `lib/commission.ts` intouchée ; les 2 règles intactes ; aucun nouveau cron.
- La photo du passager est une donnée personnelle : elle n'est jamais exposée hors du cadre défini (propriétaire + chauffeur assigné pendant la course + admin) ; la suppression après 7 jours sans litige (règle audio v2.34) ne s'applique pas ici — la photo reste tant que le passager la garde, il peut la retirer à tout moment.

## Alternatives écartées

- **Photo visible par tous les chauffeurs (ou sur le radar)** : écarté — contraire à la règle v2.20 (identité visible seulement au matching / pendant la course) et à la promesse Yango reprise ici.
- **URL signée générée avec une clé service_role** : écarté — aucune clé service_role dans le code ; la RLS fait le travail, avec la politique bornée aux statuts de course.
- **Champ « code promotionnel »** : écarté — aucun code n'existe ; la fidélité réelle (X/10) est l'équivalent honnête.
- **Photo stockée en base64 dans `profiles`** : écarté — le bucket privé + chemin est le modèle déjà éprouvé pour les documents chauffeurs (v2.4).
