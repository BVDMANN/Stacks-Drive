# Stacks Drive v2 — note historique

> Le guide de mise en ligne et de maintenance est désormais unique :
> voir **[SETUP.md](SETUP.md)** (installation, déploiement, migrations,
> dépannage). Ce fichier ne garde que le résumé de ce que la v2 a
> changé — à titre de référence.

## Ce que la v2 a changé (résumé)

- **Accueil map-first** : carte Leaflet de Libreville plein écran, radar
  pulsant pendant la recherche, marqueurs des chauffeurs en ligne,
  feuille du bas (départ, destination, Solo / Groupe, prix fixe estimé,
  Commander). Plus de liste d'offres, plus de mur marketing.
- **Modèle Uber** : le chauffeur ne publie RIEN — il se met en ligne,
  reçoit une pop-up quand une demande match son périmètre, et propose
  un prix, des places et un premier arrêt. Le passager accepte ou refuse.
  Proposition = 60 secondes, puis expiration.
- **Types de course** : Solo (privée, directe, prix plein) et Groupe
  (partagée, prix par passager, arrêts dans l'ordre). Groupe par défaut.
  Moto = Solo uniquement.
- **Vérification chauffeur obligatoire** : selfie + CNI / passeport /
  permis, bucket privé `driver-documents`, validation admin dans /admin.
- **Sécurité** : SOS pendant la course + partage en direct
  (`/suivi/[token]`), fidélité 10e course offerte, Groupe par défaut,
  prix garanti + tarifs fixes (aéroport).
- **Supprimé** : publication de courses, réservations (`bookings`),
  anciennes courses démo en base (remplacées par 6 chauffeurs démo
  statiques dans `lib/demo-drivers.ts`).

Migration associée : `supabase/migration-v2.sql` — **exécutée une seule
fois, ne jamais réexécuter** (voir SETUP.md, §3).

## Notes

- `lib/commission.ts` n'a PAS été touché par la v2 (5 % puis 8 %,
  plafond 10 %). Le snapshot de la découpe est désormais dans `rides`
  (`platform_fee` / `driver_share`).
- Les profils restent lisibles publiquement (noms des chauffeurs) ; les
  documents de vérification sont dans un bucket **privé** (liens signés
  1 h côté admin uniquement).
- Aucun paiement réel : le règlement se fait directement entre passager
  et chauffeur (espèces, Airtel Money, Moov Money).
