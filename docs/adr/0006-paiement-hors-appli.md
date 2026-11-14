# ADR 0006 — Paiement hors appli (cash / P2P), pas de paiement in-app

- Statut : Acceptée
- Date : 13/11/2026 (décision du propriétaire, validée)

## Contexte

À Libreville, les paiements se font en espèces ou par transfert Mobile
Money direct (Airtel Money / Moov Money) entre particuliers. Intégrer
un paiement in-app supposerait un agrégateur, des frais par transaction,
une gestion des litiges de paiement et une surface d'attaque financière.

## Décision

- **Le passager paie le chauffeur directement** (espèces ou transfert
  P2P Airtel Money / Moov Money). L'application ne touche jamais
  l'argent — elle compte seulement.
- La commission est réglée **une fois par semaine, en un seul
  transfert Mobile Money** (relevé hebdo généré le lundi, « J'ai payé »
  côté chauffeur, validation admin en 1 clic).
- Dépôt de garantie remboursable 5 000 FCFA et plafond de dette ~5 000
  FCFA comme garde contre le chauffeur qui roule une semaine puis
  disparaît.

## Conséquences

- Aucun flux d'argent dans l'application : pas d'agrégateur à intégrer,
  pas de secret de paiement dans le dépôt, pas de PCI à gérer, pas de
  remboursement automatique à implémenter (les plaintes n'ouvrent droit
  à aucune compensation automatique).
- Le règlement hebdo repose sur la déclaration du chauffeur : la
  preuve de paiement n'est pas automatique, l'admin valide.
- L'écran « À payer : X FCFA » à l'arrivée (prix figé, zéro
  négociation au moment de payer) et le reçu détaillé après chaque
  course rendent le paiement direct vérifiable par les deux parties.

## Alternatives écartées

- **Paiement in-app (agrégateur Mobile Money)** : frais par
  transaction, intégration et litiges de paiement, surface d'attaque
  financière — disproportionné au lancement, et contraire à la
  décision de rester invisible dans la transaction (voir ADR 0003).
- **Portefeuille prépayé** : rejeté avec le modèle (ADR 0003).
