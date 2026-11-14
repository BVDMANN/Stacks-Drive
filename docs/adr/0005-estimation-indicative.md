# ADR 0005 — Estimation indicative, pas de prix fixe

- Statut : Acceptée
- Date : 14/11/2026 (décision du propriétaire)
- Remplace : le modèle v2.9 (tarifs fixes de référence conservés)

## Contexte

En v2.9, la plateforme affichait des tarifs fixes de référence en plus
de l'estimation au km. Le propriétaire a décidé le 14/11/2026 que la
plateforme ne définit **aucun** prix : le prix final se convient entre
le passager et le chauffeur.

## Décision

- Les 6 tarifs fixes de référence sont **supprimés** (v2.11).
- L'estimation au km reste affichée avant la course **à titre
  indicatif** (Solo 500 + 210 FCFA/km, Groupe 300 + 135 FCFA/km,
  Moto ×0,6, planchers 550 / 400 FCFA — `lib/pricing.ts`), calculée
  côté serveur uniquement.
- Le chauffeur propose librement son prix, le passager peut proposer
  le sien et contre-proposer ; le prix est **figé à l'acceptation**,
  jamais de surge, jamais de changement à l'arrivée.
- Garde-fou serveur : bornes absolues 400–50 000 FCFA
  (`lib/fare-guard.ts`) — la seule contrainte sur le prix convenu.

## Conséquences

- Le passager voit un repère avant de négocier, sans que la plateforme
  impose un prix : le modèle correspond au marché réel de Libreville
  (négociation), pas à une grille importée.
- Il n'y a plus de ratio « prix proposé vs référence » à maintenir ou
  à contourner : la validation serveur est plus simple (une borne) et
  plus robuste.
- L'ancre Centre-ville → Nzeng-Ayong (Solo 1 500 / Groupe 950 FCFA)
  reste le point de recalage de l'estimation.

## Alternatives écartées

- **Prix fixe par zone** : un vrai prix fixe par zone serait une
  décision de modèle tarifaire à trancher séparément — pas implémenté.
  Les points de prise en charge affichent une estimation indicative,
  jamais un prix fixe.
- **Tarif dynamique / surge** : rejeté — le prix figé avant la course
  est une promesse du produit (« jamais de surge »).
- **Prix à la minute** : rejeté — le modèle est au km uniquement,
  comme les références locales (Gozem, Yango).
