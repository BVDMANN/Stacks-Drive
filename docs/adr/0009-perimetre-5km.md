# ADR 0009 — Périmètre dispatch 5 km, puis 25 km après 30 s

- Statut : Acceptée
- Date : 14/11/2026 (v2.18, décision antérieure documentée en v2.33)

## Contexte

Avant v2.18, la vue passager comptait les chauffeurs de la zone
visible (variable selon le zoom) et le dispatch n'avait pas de rayon
défini : l'affichage et le matching pouvaient se contredire (un
chauffeur visible mais jamais sollicité, ou l'inverse). Le compteur
« X chauffeurs autour de toi » n'avait pas de sens stable.

## Décision

- **Rayon unique : 5 km** autour du départ (`DRIVERS_AROUND_RADIUS_KM`,
  `lib/geo.ts`) — une seule constante, trois usages : marqueurs et
  compteur de la vue passager, premier rayon du dispatch
  (`getIncomingRequests`), cercle dessiné sur la carte (v2.31).
- **Après 30 s sans proposition, élargissement à 25 km**
  (`DISPATCH_WIDENED_RADIUS_KM`).
- Le centre est la position GPS exacte si géolocalisé, sinon le centre
  du quartier de départ. Sans départ choisi, pas de centre : tous les
  chauffeurs sont affichés.
- Le filtre places s'ajoute au filtre rayon, il ne le remplace pas
  (voir `lib/seats.ts`).

## Conséquences

- Affichage, compteur, cercle et dispatch ne peuvent pas se
  désaligner : changer le rayon, c'est changer une constante.
- 5 km à Libreville couvre le centre-ville et les quartiers proches
  sans noyer le passager de chauffeurs trop loin ; 25 km après 30 s
  évite les recherches sans réponse aux heures creuses.
- Une demande sans proposition depuis plus de 2 min alerte les
  chauffeurs proches et est journalisée (`unanswered_zones`, v2.27)
  pour cibler le recrutement.

## Alternatives écartées

- **Rayon = zone visible de la carte** : variable selon le zoom, donc
  non reproductible et non testable — c'est le comportement corrigé.
- **Tous les chauffeurs de la ville** : bruit pour le passager, ETA
  mensongères, propositions de chauffeurs à 20 km.
- **Rayon fixe sans élargissement** : recherches sans réponse aux
  heures creuses, sans recours.
