# ADR 0003 — Commission par course, pas d'abonnement

- Statut : Acceptée
- Date : 13/11/2026 (décision du propriétaire, validée)

## Contexte

La plateforme doit se rémunérer sur les courses. Deux modèles ont été
proposés le même soir : un portefeuille prépayé chauffeur, puis un
abonnement forfaitaire. Les deux ont été rejetés par le propriétaire
avant d'être implémentés.

## Décision

- **Commission par course : 5 % au lancement (3 mois), puis 8 %
  permanent, plafond garanti 10 %** (`lib/commission.ts` :
  `COMMISSION_RATE`, `COMMISSION_RATE_PERMANENT`, `COMMISSION_CAP`).
- La commission est calculée sur le total de la course, supplément
  route non bitumée compris, et figée dans `rides` à l'acceptation
  (snapshot : un changement de taux ne modifie jamais les courses
  déjà réservées).
- Dépôt de garantie remboursable 5 000 FCFA, plafond de dette ~5 000
  FCFA : au-delà, plus aucune demande. Règlement hebdomadaire en un
  seul transfert Mobile Money.

## Conséquences

- Le chauffeur garde 92 à 95 % de chaque course : le modèle est
  lisible et attractif au lancement.
- La plateforme ne gagne que si des courses ont lieu : l'incitation
  est alignée sur le volume, pas sur la rétention d'abonnés.
- Le règlement hebdo repose sur la déclaration du chauffeur
  (« J'ai payé ») validée par l'admin : il n'y a pas de preuve de
  paiement automatique (voir ADR 0006).

## Alternatives écartées

- **Portefeuille prépayé chauffeur** : rejeté — le chauffeur ne doit
  pas sentir les frais passer pendant ses courses, et la plateforme
  doit rester invisible dans la transaction, comme si elle ne gagnait
  rien sur le moment.
- **Abonnement forfaitaire** : rejeté — la plateforme prend sa part
  sur chaque course ; un forfait découplerait le revenu du volume
  réel et ferait payer des chauffeurs inactifs.
