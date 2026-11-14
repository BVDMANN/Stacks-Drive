# ADR 0008 — Vérification automatisée + tickets admin

- Statut : Acceptée
- Date : 14/11/2026 (v2.4, décision antérieure documentée en v2.33)

## Contexte

Chaque chauffeur doit être vérifié avant de se mettre en ligne (c'est
le verrou de la règle 2), mais vérifier chaque dossier à la main ne
passe pas à l'échelle. À l'inverse, une vérification 100 % automatique
sans filet humain laisserait passer les dossiers ambigus — ou bloquerait
des chauffeurs légitimes.

## Décision

- **Vérification automatisée dès l'inscription chauffeur** : selfie +
  pièce d'identité, contrôles côté client (présence d'un visage,
  OCR Tesseract.js de la pièce, cohérence du nom entre le compte et la
  pièce — `lib/verification.ts`).
- **Décision automatique ou ticket admin** : signaux bons →
  vérification automatique ; sinon ticket admin (`verification_tickets`)
  avec e-mail via Resend. L'admin tranche.
- **Le serveur re-parse le texte OCR et re-calcule la cohérence**
  (`verification_auto_payload_consistent`) et vérifie les doublons en
  base — il ne refait pas l'OCR lui-même (limite documentée dans
  `docs/ARCHITECTURE.md` §4.6).
- **Re-vérification selfie ponctuelle** (v2.30) : drapeau admin ou
  balayage hebdo (> 30 jours, max 5 chauffeurs par semaine), contrôle
  de présence d'un visage uniquement — jamais de reconnaissance
  faciale — photo non conservée ; mise en ligne bloquée tant que le
  selfie n'est pas refait.

## Conséquences

- Onboarding 100 % autonome pour les dossiers clairs ; l'humain ne
  traite que les cas ambigus.
- La vérification est un document privé : le selfie n'est jamais
  affiché (la « photo » de la proposition est une initiale).
- Le trigger anti-escalade garantit que le statut de vérification ne
  peut pas être forgé par le chauffeur lui-même (voir ADR 0004).

## Alternatives écartées

- **Vérification 100 % manuelle** : ne passe pas à l'échelle, délai
  d'onboarding imprévisible.
- **Service d'identité tiers (Onfido, etc.)** : coût par vérification,
  hors budget au lancement ; Tesseract.js côté client suffit pour
  l'OCR de la pièce.
- **Reconnaissance faciale** : rejetée — le contrôle est la présence
  d'un visage, pas l'identité biométrique ; la photo n'est pas
  conservée après le contrôle ponctuel.
