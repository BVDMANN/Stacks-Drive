# Tutoriels visuels réels — captures (v2.21)

Les 12 images du tutoriel passager (6 étapes) et de la formation
chauffeur (6 étapes). Chaque image est la capture d'un **vrai écran
de l'app** — jamais une illustration, jamais une maquette. Les
composants de la modale sont dans `components/tuto/` (étapes dans
`components/tuto/steps.ts`).

## Inventaire

| Fichier | Étape | Écran réel capturé |
|---|---|---|
| `passager-01-carte.png` | Passager 1 — La carte | Accueil `/` : carte + feuille dépliée |
| `passager-02-trajet.png` | Passager 2 — Ton trajet | Accueil : Aéroport Léon-Mba → Centre-ville |
| `passager-03-solo-groupe.png` | Passager 3 — Solo ou Groupe | Accueil : cartes Solo / Groupe (prix) |
| `passager-04-propositions.png` | Passager 4 — Propositions | Vrai `ProposalCard` (aperçu dev, données démo) |
| `passager-05-pin.png` | Passager 5 — Prix figé + PIN | Vrai `PinDisplay` (aperçu dev, code démo 4827) |
| `passager-06-paiement.png` | Passager 6 — Paiement direct | Accueil : sélecteur Espèces / Airtel / Moov |
| `chauffeur-01-mise-en-ligne.png` | Chauffeur 1 — Mise en ligne | Vrai `DriverHome` (aperçu dev, profil démo) |
| `chauffeur-02-demande.png` | Chauffeur 2 — Une demande | Vrai `RequestPopup` (aperçu dev, course démo) |
| `chauffeur-03-places.png` | Chauffeur 3 — Prix + places | Vrai `SeatsPopup` (aperçu dev) |
| `chauffeur-04-pin.png` | Chauffeur 4 — Code PIN | Vrai `PinEntry` (aperçu dev) |
| `chauffeur-05-commission.png` | Chauffeur 5 — Commission | Vraie page `/devenir-chauffeur` (5 % / 8 % / 10 %) |
| `chauffeur-06-reglement.png` | Chauffeur 6 — Règlement hebdo | Vraie page `/devenir-chauffeur` (dépôt 5 000 FCFA) |

## Refaire les captures

```bash
npm run dev -- -p 3100   # serveur de dev actif (ne pas le tuer)
npm run tuto:captures    # refait les 12 captures (écrase les PNG)
npm run tuto:verify      # vérifie le flux : ouverture auto, fermeture,
                         # drapeau « vu », relecture, 12 images qui chargent
```

Le script utilise `playwright-core` (devDependency) et le Chromium
déjà présent dans `~/.cache/ms-playwright/` (aucun téléchargement).
Surcharge : `PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chrome`,
`TUTO_BASE_URL=http://localhost:3100`.

**Si un écran change, refaire la capture correspondante** (relancer
le script suffit — il écrase tout), vérifier visuellement les PNG,
puis pousser. Les chiffres (commission, dépôt) ne sont jamais
recopiés à la main : ils viennent de `lib/commission.ts` et
`lib/gamification.ts`, dans le texte des étapes comme sur les écrans.

## D'où vient chaque capture

- **Accueil (`/`)** : le vrai accueil, piloté par Playwright
  (sélection d'un trajet réel Aéroport → Centre-ville). Le tutoriel
  est neutralisé pendant les captures (drapeaux « vu » posés en
  localStorage). Anneau or autour de l'élément important (destination,
  paiement) — pas de pastille, elle masquait le texte.
- **Page d'aperçu dev (`/tuto-apercu`, 404 en production)** : les
  écrans « propositions », « PIN », « demande », « places » et
  « accueil chauffeur » n'existent qu'avec une course / un compte
  connecté. La page rend les **vrais composants** avec des données
  démo étiquetées (chauffeur « Jean M. », course démo, code PIN démo
  4827 — comme les chauffeurs démo de la carte). Les pop-ups sont
  cadrées sur leur carte intérieure.
- **`/devenir-chauffeur`** : la vraie page (commission, dépôt).

## Limites connues — à refaire sur un vrai appareil après le push

- **Fond de carte gris** : les tuiles Esri ne chargent pas depuis la
  VM (proxy). L'interface, les libellés et les marqueurs sont les
  vrais ; le fond de carte devra être re-capturé sur un vrai
  téléphone si on veut les rues visibles (`passager-01/02/03/06`).
- **Gains « Chargement… »** (`chauffeur-01`) : sans Supabase en
  local, les gains et les points du `DriverHome` ne chargent pas.
  La mise en ligne (interrupteur + quartier) est bien visible ; les
  montants devront être re-capturés sur un vrai compte chauffeur.
- **Relevé hebdo** (`chauffeur-06`) : sans Supabase, le composant
  `WeeklySettlementCard` n'affiche que son état vide (« Pas encore
  de relevé… »). L'étape 6 montre donc la section dépôt / plafond
  de dette de `/devenir-chauffeur` à la place ; le vrai relevé
  devra être capturé sur un vrai compte chauffeur après le push.
- **Code PIN démo** (`passager-05`) : 4827 est un code démo, le
  vrai code est généré à l'acceptation de la course (mention
  visible sous la capture).
- **Session connectée réelle non vérifiable en local** : pas de
  `.env.local` (Supabase non configuré). L'ouverture auto de la
  formation juste après la création d'un compte chauffeur et le
  bouton « Revoir la formation » sur le vrai tableau de bord sont
  relus dans le code (`app/inscription/page.tsx`,
  `components/driver/DriverDashboard.tsx`) et devront être
  confirmés sur un vrai compte après le push.
