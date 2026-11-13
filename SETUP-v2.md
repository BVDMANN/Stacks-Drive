# Stacks Drive v2 — Mise en ligne

Refonte complète du modèle (Uber, pas BlaBlaCar) : carte plein écran,
demande → propositions chauffeurs → acceptation, vérification selfie +
pièce, fidélité 10e course offerte, SOS + partage de course.

## Ce qui a changé (résumé)

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
- **Innovations** : SOS pendant la course + partage en direct
  (`/suivi/[token]`), fidélité 10e course offerte, Groupe par défaut,
  prix garanti + tarifs fixes (aéroport).
- **Supprimé** : publication de courses, réservations (`bookings`),
  anciennes courses démo en base (remplacées par 6 chauffeurs démo
  statiques dans `lib/demo-drivers.ts`).

## Étapes

### 1. Push GitHub (par Randy / Ruby, comme pour la v1)

Pousser le contenu de `~/workspace/stacks-drive-v2/` sur
`BVDMANN/Stacks-Drive`, branche `main` (écrase la v1).
Vercel redéploie automatiquement à chaque push sur `main`.

### 2. Exécuter migration-v2.sql dans Supabase (UNE fois)

Dashboard Supabase → projet « stacks-drive » → SQL Editor → coller le
contenu complet de `supabase/migration-v2.sql` → Run.

Le script est additif et protégé (`if not exists`, `on conflict`) :
- colonnes de vérification sur `profiles` (+ alignement des chauffeurs
  déjà vérifiés en v1) ;
- `rides` requalifiée en demandes (suppression des 6 courses démo,
  renommages, nouveaux statuts, `share_token`, `loyalty_free`) ;
- table `bookings` **supprimée** (concept abandonné) ;
- table `ride_proposals` + fonction `expire_proposals()` ;
- fonction `get_public_ride()` (suivi partagé sans compte) ;
- trigger de synchro du badge « vérifié » + anti-escalade renforcé ;
- nouvelles politiques RLS (demandes, propositions) ;
- bucket privé `driver-documents` + politiques Storage.

Vérifications après exécution (requêtes en bas du script) :
- `select count(*) from public.rides;` → **0** (démos supprimées) ;
- `select count(*) from public.ride_proposals;` → **0** ;
- bucket `driver-documents` présent, `public = false` ;
- fonctions `expire_proposals` et `get_public_ride` présentes.

### 3. Vérifier le déploiement Vercel

- Build « Ready » (le correctif `npm install --legacy-peer-deps` ne
  doit PAS être nécessaire : la v2 utilise `leaflet` vanilla, pas
  `react-leaflet`).
- Les variables d'environnement Supabase sont inchangées (même projet).
- Aucun changement côté Supabase Auth (Site URL + redirect déjà réglés).

### 4. Tests à faire (parcours complet)

1. **Accueil** : carte de Libreville centrée, 6 marqueurs chauffeurs
   (démo), compteur « N chauffeurs autour de toi ».
2. **Estimation** : Centre-ville → Aéroport Léon-Mba, Groupe = 2 500 FCFA,
   Solo = 5 000 FCFA. Glass → Nzeng-Ayong, Groupe = 1 200 FCFA.
3. **Demande (sans compte)** : Commander → redirection /connexion,
   brouillon restauré après connexion.
4. **Compte passager** : carte fidélité (0/10), progression visible.
5. **Compte chauffeur** : vérification (selfie + pièce) → statut
   « en attente » → **admin** (/admin) : voir les documents, Valider →
   badge « Vérifié », mise en ligne possible.
6. **Pop-up chauffeur** : demande → proposition (prix, places, 1er arrêt)
   → côté passager, proposition visible avec compte à rebours 60 s →
   Accepter → course confirmée (chauffeur, véhicule, plaque) → SOS +
   Partager (lien `/suivi/[token]`) → page de suivi publique.
7. **Annulation** avant acceptation + élargissement après 30 s sans
   proposition (« on élargit la recherche »).
8. **Après course** : terminer (chauffeur) → noter (passager + chauffeur).

### 5. Quand les vrais chauffeurs arrivent

- Retirer les chauffeurs démo : supprimer `DEMO_DRIVERS` de
  `lib/demo-drivers.ts` (ou le vider) et retirer son import de
  `app/page.tsx`. La carte n'affichera plus que les chauffeurs réels
  en ligne.
- Nommer Randy admin (déjà fait en v1 si son compte existe, sinon :
  `update profiles set is_admin = true where email = '...' ;`).

## Notes

- `lib/commission.ts` n'a PAS été touché (5 % puis 8 %, plafond 10 %).
  Son commentaire mentionne encore la table `bookings` pour le snapshot
  — le snapshot est désormais dans `rides` (platform_fee / driver_share).
- Les profils restent lisibles publiquement (noms des chauffeurs) ; les
  documents de vérification sont dans un bucket **privé** (liens signés
  1 h côté admin uniquement).
- Aucun paiement réel : le règlement se fait directement entre passager
  et chauffeur (espèces, Airtel Money, Moov Money).
- Options NON implémentées (à activer plus tard) : parrainage (code
  de parrainage, course offerte / commission réduite), chauffeur favori
  (re-commander son chauffeur préféré).
