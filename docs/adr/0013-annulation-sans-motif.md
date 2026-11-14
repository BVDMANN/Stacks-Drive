# ADR 0013 — Annulation sans motif, erreurs précises

- **Statut :** accepté (14/11/2026, décision du propriétaire en testant sur mobile)
- **Contexte :** depuis la v2.23, annuler une course exigeait de choisir un motif dans une liste courte — un bouton radio était toujours sélectionné (« Autre raison » par défaut). En testant sur mobile, le propriétaire a demandé de pouvoir annuler sans motif. Second point : quand l'annulation échouait, la modale affichait un générique (« Annulation impossible pour le moment. Réessaie. ») qui cachait la cause réelle — alors que le serveur renvoyait déjà un message précis (« Cette course ne peut plus être annulée. »).
- **Décision :**
  1. « Sans motif » devient le premier choix de la liste et le choix par défaut — annuler prend un tap, sans se justifier. La liste courte reste proposée, la précision libre est masquée quand « Sans motif » est choisi.
  2. Nouveau code `sans_motif` dans `lib/cancellations.ts` (type + `CANCEL_REASONS`), accepté côté serveur via l'énumération zod dérivée, stocké tel quel — l'historique distingue « pas de motif donné » de « Autre raison ». Le message système à l'autre partie dit « sans motif précisé ».
  3. En cas d'échec, la modale affiche le message précis du serveur : `onConfirm` renvoie désormais le message d'erreur (ou `null` en cas de succès) au lieu d'un booléen — appliqué aux trois points d'annulation (page de course, courses planifiées, accueil).
- **Conséquences :** la fiabilité (annulations comptées) est inchangée — annuler sans motif compte comme toute annulation. Aucune migration : `reason_code` reste NOT NULL, le code est une valeur valide. Le repli serveur sur `autre` (quand aucun code n'est envoyé) est conservé pour les anciens clients.
- **Alternatives écartées :** supprimer la liste de motifs (perd l'information pour les litiges et la fiabilité) ; garder le motif obligatoire et ajouter un bouton « Annuler sans motif » séparé (deux chemins pour la même action).
