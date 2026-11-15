# ADR 0027 — Identité visuelle signature, logo officiel et chargement = le S qui se remplit

**Statut :** Acceptée (v2.52, local, en attente de push)
**Date :** 15/11/2026

## Contexte

Le 15/11, le propriétaire a jugé l'interface trop datée, en deux temps :

1. ~10h24 : « Change les icônes des voitures et tout ce qui colle vieux, mets des petits reflets brillants, des icônes modernes. Je veux du pro visuel et surpasser. »
2. ~10h25 : « Les icônes sont toutes moches, les logos de tout, trop simples, aucun détail, juste du "voilà prend ça". » puis « Ça fait pas moderne de nos temps, marquant et reconnaissable rien qu'à l'interface. »

Traduction : les icônes plates minimalistes (Lucide + quelques SVG unis) sont rejetées comme des bouche-trous. Il faut des icônes **riches en détails** (phares, calandre, rétroviseurs, jantes, vitres avec reflet, lumières, ombres) **et** une interface **instantanément reconnaissable** comme Drive au premier coup d'œil, sans lire le nom.

Le même matin, le propriétaire a fourni les deux références qui fixent l'identité :

- **~10h36 : le logo officiel** — un « S » blanc + violet traversé par une route (marquages jaune/vert/bleu), une voiture de face en bas, « StacksDrive® » (Stacks blanc, Drive violet), « VTC • GABON » en dessous, fond sombre, bordure carrée arrondie violette lumineuse. C'est LE logo désormais.
- **~10h43 : un GIF d'animation néon** — fond sombre, silhouette de voiture de profil au centre, arc néon violet qui balaie au-dessus d'elle, barre néon arrondie en dessous qui se remplit. C'est la référence du chargement pour le moment « recherche de chauffeur ».

Contrainte : la palette « Nuit violette » (ADR 0019) reste, le petit thème discret néon violet déjà en place est conservé, et rien ne doit renvoyer aux concurrents (pas leurs voitures 3D, pas leurs couleurs, pas leur marque) — on les dépasse avec notre propre langage.

## Décision

### 1. Trois éléments signature — « on reconnaît Drive rien qu'à l'interface »

1. **« Faisceau Drive »** — un trait de lumière diagonal rose → blanc → sarcelle. Il apparaît comme le faisceau du phare sur chaque voiture dessinée, comme la ligne lumineuse en haut de la feuille de course et des cartes, et comme la lueur de l'itinéraire. Un seul geste lumineux, répété aux endroits clés.
2. **« Voitures dessinées Drive »** — les voitures ne sont plus des pictogrammes plats mais des illustrations dessinées, dans un seul langage, en 3 tailles (XL sur les cartes de classes, M comme marqueurs sur la carte, S en miniatures) : carrosserie en dégradé + bande de reflet spéculaire, vitres avec reflets diagonaux, phare LED + faisceau, calandre à lamelles, rétroviseurs, poignées et lignes de portes, jantes détaillées à 5 branches avec moyeu rose, ombre portée + lueur rose au sol. Berline (Solo/Confort), citadine (Groupe), moto (Solo uniquement).
3. **« Verre nuit à liseré »** — les surfaces sont en verre violet nuit profond avec un liseré lumineux en haut (ligne 1–2 px en dégradé rose → blanc → sarcelle) et un léger reflet interne : feuille de course, cartes de classes, cartes de course, chips, toasts, cartes d'authentification. La feuille ne ressemble plus à une feuille générique : elle porte le faisceau en haut.

### 2. Le logo officiel est adopté partout

- Le fichier reçu est copié dans le dépôt : `public/logo-stacks-drive.png` (recadré sur le carré, sans les marges noires) et `app/icon.png` (favicon + apple-touch-icon automatiques de Next.js). `public/manifest.json` pointe sur l'icône locale (plus l'URL générique Flaticon) avec `theme_color` / `background_color` `#191432`.
- Le logo complet apparaît : en-tête (via le S seul, voir ci-dessous), écrans de connexion/inscription (140 px), pied de page (128 px), écran de chargement global (`app/loading.tsx`).
- **Version « S seul » en SVG** (`components/icons/DriveLogo.tsx`, `SPaths`, viewBox 0 0 570 400) : le S du logo est retracé fidèlement (3 barres + route avec marquages jaune/vert/bleu), simplifié pour les petites tailles — jamais un autre S. Vérifié visuellement en 3 itérations contre le recadrage du logo : lisible à 72, 36 et 20 px.

### 3. Le violet du logo devient la couleur de marque principale

Le violet du S est mesuré sur le fichier reçu : **#A134F5** au centre de la barre (valeur canonique retenue). Nouveaux jetons `brand` dans `tailwind.config.ts` : 300 #C78CFA, 400 #B45CF7, 500 #A134F5, 600 #7E22CE, 700 #6B21A8.

- **Violet = marque principale** : boutons primaires et CTA (dégradé verni `from-brand-300 via-brand-500 to-brand-600`, texte blanc), sélection Solo/Groupe (bordure + pastille de validation violettes), bouton « Connexion », bouton « Commander », chargement du bouton, S du chargeur.
- **Rose #FF4D8D = accent secondaire** : prix, itinéraire, marqueurs chauffeurs, pastille « chauffeurs autour », badge Solo. Il ne disparaît pas, il recule d'un cran.
- Contrastes mesurés : blanc sur #A134F5 = **4,9:1** (AA texte normal), blanc sur #7E22CE = **7,0:1**. Le rose #FF4D8D garde le texte sombre #17112E sur les CTA roses restants (5,8:1, voir ADR 0019).
- La direction néon violette discrète déjà en place est conservée ; aucune mention de ses références internes n'apparaît dans l'appli ni dans les docs.

### 4. Le chargement = le S qui se remplit (`LogoLoader`)

Tous les indicateurs de chargement de l'appli deviennent le S du logo qui se remplit, comme un assistant qui réfléchit :

- Composant réutilisable `LogoLoader` (`components/icons/DriveLogo.tsx`) : le S fantôme (opacité 0,16) + S rempli par clip `inset()` animé (boucle 1,6 s) ou piloté par une progression réelle `progress` (0–1) quand elle existe ; lueur violette ; reconnaissable même à 20 px.
- **Remplacé partout** : les 23 spinners `Loader2` restants (16 fichiers : ModeToggle, CancelRideDialog, TrustedContactsForm, PassengerPhotoForm, MapReportForm, LiveAdmin, MapReportsReview, ProposalCard, OutOfZoneScreen, VerificationForm, DriverDashboard, DriverEarnings, DriverHome, SeatsPopup, TrafficReport, SelfieRecheckCard), le squelette shimmer « Calcul du prix… » (`PriceDisplay`), les 3 shimmers de résolution d'adresse (HomeScreen), les spinners de géolocalisation / envoi / annulation (HomeScreen), le chargement du bouton (`PremiumButton`), les états « Chargement… » en texte seul (connexion, inscription, aperçu du tutoriel, carte de suivi, messages, dossiers admin, gains, zones de demande, photo de profil, carte de Libreville au chargement dynamique).
- **La règle n°1 reste** : un indicateur visible partout où il y a une attente — c'est désormais le S. Tailles : 16 px pour les petits spinners (11–13 px), 18 px pour les moyens (14–16 px), 20–28 px pour les gros, 32–72 px pour les écrans entiers.

### 5. L'animation voiture néon = l'attente de recherche de chauffeur (`NeonSearchLoader`)

Le GIF reçu est **recréé en CSS/SVG** (`components/icons/NeonSearchLoader.tsx`) — pas le GIF lui-même (propre, fluide, léger, boucle parfaite, sans image lourde) : arc néon violet qui balaie au-dessus de la silhouette de voiture (boucle 2,4 s synchronisée), voiture qui s'illumine au passage du balayage (50–62 %), barre néon en dessous qui se remplit. Mêmes violets que le logo et la palette.

**Répartition décidée** : le S qui se remplit = chargeur général (connexion, recherches, calcul du prix, mise en ligne, switch, admin). L'animation voiture néon = **l'attente de recherche de chauffeur uniquement** — le moment où le passager attend qu'un chauffeur accepte : la voiture et l'arc qui balaie, c'est exactement ce moment-là. Chaque chargement a UNE animation, pas deux en même temps. Le lancement de l'appli = le S (`app/loading.tsx`).

### 6. Icônes détaillées, langage unique, composants partagés

- **Voitures** (`components/icons/DriveCar.tsx`) : `SedanIllustration`, `HatchIllustration`, `MotoIllustration`, `DriveCarIllustration`, `DriveCarMini` (ton clair sur fond nuit / ton sombre sur pastille rose), `DriveMark`, marqueurs carte en chaînes SVG (`DRIVE_CAR_MARKER_SVG`, `DRIVE_MOTO_MARKER_SVG`, `DRIVE_PIN_MARKER_SVG`).
- **Lieux** (`components/icons/DrivePoi.tsx`) : `DRIVE_POI_SVG` — 15 catégories (supermarché, marché, station, pharmacie, hôtel, santé, lieu, aéroport, port, stade, musée, plage, gare, bar, restaurant), chaque lieu est une petite scène dessinée, pas un pictogramme plat.
- **Interface** (`components/icons/DriveUi.tsx`) : 71 icônes `Drive*` détaillées (`currentColor` + accents, dégradés par `useId`) + `DRIVE_TRAFFIC_SVG` (remplace les emoji de trafic).
- **Balayage complet** : les icônes Lucide plates et les emoji sont remplacés par les icônes Drive dans ~23 fichiers du produit + 9 fichiers de l'admin (y compris l'emoji ⚠ de /admin) — **0 import `lucide-react` restant dans `app/` + `components/`**. 10 icônes Drive ajoutées pour fermer le balayage : `DrivePinOff`, `DriveLink`, `DriveFileCheck`, `DriveUpload`, `DriveMegaphone`, `DrivePlane`, `DriveUndo`, `DriveXCircle`, `DriveMessageWarning`, `DriveThumbsUp` (les autres remplacements réutilisent des icônes existantes : `DriveNavigation`, `DriveRefresh`, `DriveShield`, `DriveKey`, `DriveWallet`, `DrivePin`, `DriveCheck`, `DriveX`, `DrivePlay`, `DriveSearch`, `DriveStar`, `DriveAlert`, `DriveCheckBadge`, `DriveShieldAlert`).
- **Règles** : pas de remplissage générique, jamais d'emoji, jamais de photo piquée chez un concurrent, aucune nouvelle dépendance, SVG inline uniquement, mobile d'abord (390×844), performance (pas de flou lourd partout, pas d'images lourdes).
- **Correctifs d'hydratation** : toute coordonnée SVG calculée (trigonométrie, multiplications) est arrondie à 2 décimales, sinon le serveur et le client sérialisent le flottant différemment et React signale un défaut d'hydratation.

## Conséquences

- **Fichiers créés** : `components/icons/DriveCar.tsx`, `DrivePoi.tsx`, `DriveUi.tsx`, `DriveLogo.tsx`, `NeonSearchLoader.tsx`, `app/loading.tsx`, `public/logo-stacks-drive.png`, `app/icon.png`.
- **Fichiers modifiés** : `components/map/LibrevilleMap.tsx` (marqueurs + POI + badge note en étoile SVG ; correctif : l'épingle centrale rendait `{PIN_SVG}` comme texte brut — remplacée par `<DrivePin size={44} />`), `components/home/RideClassCards.tsx` (voitures dessinées, sélection violette), `components/home/HomeScreen.tsx` (balayage complet + NeonSearchLoader sur l'état vide de recherche de chauffeur), `components/shared/Header.tsx` (S SVG 24 px + bouton Connexion violet), `components/shared/Footer.tsx` (logo complet), `components/shared/PremiumButton.tsx` (dégradé violet verni + LogoLoader), `components/auth/AuthCard.tsx` (logo complet 140 px), `components/home/PriceDisplay.tsx` (LogoLoader), `styles/globals.css` (verre nuit à liseré, faisceau, keyframes `logo-fill` / `neon-*`), `tailwind.config.ts` (palette `brand`), `public/manifest.json`, + 16 fichiers du balayage des chargements + ~23 fichiers du balayage d'icônes.
- **Page temporaire** : `app/planche-v252/page.tsx` (planche de vérification visuelle : S, LogoLoader, NeonSearchLoader, voitures, 15 POI, 60 icônes UI) — **à supprimer avant le push**, elle ne doit pas partir en production.
- **Aucune fonctionnalité ne change** : lot 100 % visuel. Commission et prix intouchés. Les 2 règles vérifiées intactes.
- **Aucune migration, aucun nouveau cron.**
- **Reste daté / connu** : la pastille « chauffeurs autour » chevauche toujours l'attribution sur la carte (problème connu, lot ultérieur) ; boutons +/− Leaflet recouverts par la feuille en mobile 390 px (pré-existant) ; chevauchements de libellés au Centre-ville à z16 (pré-existant) ; la règle CSS `.price-skeleton` est conservée tant que `FavoritePlaceRow.tsx:71` l'utilise.

## Alternatives écartées

- **Garder les icônes Lucide plates** : rejetées par le propriétaire (« trop simples, aucun détail ») — le minimalisme plat est interdit pour ce lot.
- **Utiliser le GIF tel quel** : lourd, flou sur retina, pas de boucle parfaite, pas de thème — recréé en CSS/SVG.
- **Copier les visuels Yango/Bolt** (voitures 3D, rouge/marques) : interdit — on dépasse avec notre propre langage, dans notre palette.
- **Un seul chargeur pour tout** : rejeté — le S est le chargeur général, la voiture néon est réservée au moment « recherche de chauffeur », où elle a du sens.
- **Spinner CSS générique conservé quelque part** : rejeté — un seul langage de chargement, partout.
- **Un S redessiné différemment** : rejeté — le S seul est un retracé fidèle du S du logo, simplifié seulement pour les petites tailles.
