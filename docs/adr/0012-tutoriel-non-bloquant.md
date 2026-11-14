# ADR 0012 — Tutoriel passager non bloquant à l'arrivée

- Statut : Acceptée
- Date : 14/11/2026 (décision du propriétaire)
- Précise : v2.21 (tutoriel passager, ouverture automatique au premier lancement)

## Contexte

En v2.21, le tutoriel passager (6 étapes, captures des vrais écrans)
s'ouvrait automatiquement en modale plein écran 900 ms après le
premier lancement de l'app : fond sombre + voile sur tout l'écran,
carte de 92 % de la hauteur ancrée en bas sur mobile.

En vérifiant le produit final le 14/11/2026, le propriétaire a
constaté que la modale masquait tout l'écran dès l'arrivée sur le
site — les gens risquent de se perdre avant même d'avoir vu la carte
et la feuille de demande.

## Décision

- Au premier lancement, on montre une **petite carte d'accueil en
  haut de la carte, sans voile** : la carte et la feuille restent
  visibles et utilisables derrière. Elle propose le tutoriel
  (« Voir le tutoriel ») sans l'imposer.
- Le tutoriel (modale) ne s'ouvre que sur action volontaire :
  bouton de la carte d'accueil, « Revoir le tutoriel » (pied de la
  feuille), « Mon compte ».
- Fermer la carte (« Plus tard » / croix) vaut « vu » : elle ne
  revient pas au prochain lancement (même clé localStorage
  `stacks-drive-tuto-passager-vu`, rejouable à la demande).
- La modale elle-même est inchangée pour les ouvertures volontaires.
- La formation chauffeur est inchangée : elle s'ouvre après la
  création du compte chauffeur (premier passage sur le tableau de
  bord), pas à l'arrivée sur le site.

## Conséquences

- Un nouvel arrivant voit d'abord la carte, les chauffeurs autour et
  la feuille de demande — jamais un écran qu'il n'a pas demandé.
- Le tutoriel reste découvrable en un toucher, et sa fréquentation
  devient un signal : s'il n'est presque jamais ouvert, c'est que la
  carte se suffit à elle-même.
- Les captures des tutoriels ne changent pas (la modale est
  identique) ; seul l'écran d'accueil sans tutoriel est re-capturé
  (`npm run tuto:captures`).

## Alternatives écartées

- Garder l'ouverture automatique avec une modale plus petite : même
  petite, une modale avec voile bloque l'écran à l'arrivée.
- Ne rien montrer du tout au premier lancement : on perd la
  découverte du tutoriel pour les gens qui en ont besoin.
