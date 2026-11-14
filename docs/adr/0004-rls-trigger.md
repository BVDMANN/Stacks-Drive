# ADR 0004 — RLS + trigger anti-escalade, pas juste l'API

- Statut : Acceptée
- Date : 14/11/2026 (v2.17, décision antérieure documentée en v2.33)

## Contexte

L'API Next.js applique déjà les verrous métier (ex. PATCH
`/api/profile` : 403 si bascule en mode Chauffeur sans compte
chauffeur). Mais le client navigateur utilise la clé anon Supabase :
n'importe quel utilisateur authentifié peut appeler PostgREST
directement et modifier sa propre ligne `profiles` sans passer par
l'application. Une règle appliquée uniquement dans l'API est donc
contournable.

## Décision

- **Politiques RLS** sur toutes les tables sensibles (lecture /
  écriture par rôle et par appartenance : parties de la course,
  propriétaire, admin).
- **Trigger `prevent_privilege_escalation()`** (`BEFORE UPDATE` sur
  `profiles`, migration v2.4 étendue en v2.17) : rejette toute
  modification de `is_verified` / `is_admin` par un non-admin, toute
  modification de `verification_status` hors des chemins autorisés,
  la bascule en mode Chauffeur sans compte chauffeur créé, et la mise
  en ligne sans compte vérifié.
- L'API reste le premier rempart (message clair + redirection) ; le
  trigger est le filet. Les deux appliquent la même règle.

## Conséquences

- La sécurité ne dépend plus de l'interface : un client modifié, un
  script ou un appel `curl` direct ne peut pas escalader.
- Les règles vivent en SQL (migrations versionnées, idempotentes) :
  elles sont revues comme du code, et le code TypeScript reste
  résilient tant qu'une migration n'est pas appliquée.
- L'admin garde tous les droits et le SQL direct (`auth.uid()` null)
  aussi — pour la nomination du premier admin.

## Alternatives écartées

- **API uniquement** : contournable en une requête PostgREST — c'est
  précisément la faille que la migration v2.17 ferme.
- **Clé `service_role` côté serveur pour tout réécrire** : elle
  contournerait RLS et ferait du serveur un point unique de confiance
  absolue ; une fuite de cette clé serait catastrophique. Aucune clé
  `service_role` n'existe dans le dépôt.
- **Règles Firestore / base sans RLS** : pas de trigger équivalent
  pour appliquer des règles au plus près des données.
