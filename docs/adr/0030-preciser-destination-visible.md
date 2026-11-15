# ADR 0030 — Préciser la destination aussi visiblement que le départ (bouton en en-tête + bannière « adresse approximative »)

- **Statut :** acceptée (15/11/2026, lot v2.54 — local, en attente de push).
- **Contexte :** le propriétaire signale qu'on peut préciser le lieu exact du DÉPART avec l'épingle, mais pas la zone d'ARRIVÉE. En réalité le mécanisme existe déjà pour les deux depuis la v2.47 ([ADR 0022](0022-pickup-precis-epingle-adresse.md)) : `adjusting` accepte `'pickup' | 'destination'`, `openAdjust('destination')`, `handleMapCenterChange` met à jour `destExact`, `confirmAdjust` / `cancelAdjust` gèrent les deux, et un bouton « Préciser sur la carte » existe sous le champ destination (affiché quand `destination !== ''`). Mais côté départ, le bouton « Préciser » est bien visible (à côté de « Me localiser », plus bannière ambre quand le GPS est imprécis) alors que côté destination il est discret et enterré sous la recherche — le propriétaire ne l'a jamais vu. Ce lot ne reconstruit pas le mécanisme : il le rend visible. Précision du propriétaire intégrée au lot : pouvoir préciser le départ ET l'arrivée, c'est aussi pour commander une course POUR QUELQU'UN D'AUTRE — les deux épingles doivent pouvoir être posées n'importe où dans la zone, sans être liées à sa propre position GPS (voir « Commander pour quelqu'un d'autre » ci-dessous).

## Diagnostic (mesuré en DOM, mobile 390×844, départ Nzeng-Ayong, destination Glass)

Le contenu de la feuille (phase idle) est, dans l'ordre : titre « Où allez-vous ? », les 2 grandes cartes Trajets / Trajets planifiés, le départ (+ adresse + bannière GPS), puis la carte destination (en-tête + `DestinationSearch` + bouton « Préciser sur la carte » + adresse). Sous la recherche, la liste complète des quartiers (75, sans requête) allonge la feuille (`scrollHeight` 2 519 px) et pousse le bouton très bas.

| Cran | Feuille | Bouton destination (avant) | Bouton départ (avant) |
|---|---|---|---|
| 30 dvh (~253 px, haut 591 px) | 253 px | 1 296–1 330 px → **452 px sous le pli** | 804–838 px, visible (à moitié masqué par la navigation basse) |
| 58 dvh (~490 px, haut 354 px) | 490 px | 1 059–1 093 px → **215 px sous le pli** | 568–602 px, visible |
| 88 dvh (~743 px, haut 101 px) | 743 px | 806–840 px, visible (ras du bas) | 315–349 px, visible |

L'estimation initiale du coordinateur (« à 58, juste au ras du pli ») était optimiste : à 58 le bouton est 215 px sous le bas du viewport, pas au ras. Le bouton n'est visible sans scroller qu'au cran 88 — et encore au ras du bas. De plus, quand la destination est un simple quartier (source `'neighborhood'`, point = centre du quartier), AUCUNE ligne ne signale que l'adresse est approximative : la ligne d'adresse ne s'affiche que pour un point exact (source ≠ `'neighborhood'`), donc rien n'invite à préciser. Côté départ, la même situation est signalée (bannière ambre GPS imprécis + lien « Préciser »).

## Décision

1. **Bouton « Préciser » dans l'en-tête de la carte destination, à côté de « Plus tard »** — même style que le bouton « Préciser » du départ (`bg-white/10`, bordure `white/15`, icône `DriveMove`, texte `xs font-black`), même endroit logique (à côté du champ). L'ancien bouton sous la recherche est supprimé : une seule action claire par côté. `openAdjust('destination')` est appelé 2 fois (bouton d'en-tête + lien de la bannière), exactement comme `openAdjust('pickup')` (bouton du champ + lien de la bannière GPS) — parité des deux côtés.
2. **Bannière ambre quand l'adresse de destination est approximative** (source `'neighborhood'`) : « Adresse approximative — c'est le centre du quartier. Déplace l'épingle pour préciser le point exact. » + lien « Préciser » — mêmes classes que la bannière GPS imprécis côté départ (`text-amber-300`, `bg-amber-500/10`, `border-amber-500/30`). Elle est placée juste sous l'en-tête, AVANT la recherche (sous la recherche, la liste des quartiers la poussait sous le pli au cran 58) et disparaît dès que le point devient exact (épingle ou lieu choisi).
3. **« Annuler » (et confirmation hors zone) restaure le point d'avant, source comprise.** Correctif d'un défaut de la v2.47 découvert pendant le lot : `cancelAdjust()` remettait le point exact mais forçait la source à `'pin'` — un centre de quartier annulé devenait un point « épingle » (et la bannière ambre disparaissait à tort), et le NOM du quartier n'était pas restauré (glisser l'épingle change le quartier de rattachement : Glass → Acaé ; annuler laissait « Acaé » avec les coordonnées de Glass). Désormais `adjustStartRef` mémorise aussi le quartier, la source d'origine, l'adresse du lieu et la demande de piste ; `restoreAdjustStart()` (partagée par `cancelAdjust()` et la branche hors zone de `confirmAdjust()`) remet le tout — point exact effacé si le point d'avant était un centre de quartier.

## Mesures après correctif (mêmes conditions)

| Cran | Bouton « Préciser » destination | Bannière ambre | Bouton départ |
|---|---|---|---|
| 30 dvh | 895–925 px → **51 px sous le pli** (était 452 px) | 933–999 px, sous le pli | 804–838 px |
| 58 dvh | 658–688 px → **VISIBLE sans scroller** | 696–762 px → **VISIBLE sans scroller** | 568–602 px |
| 88 dvh | 405–435 px → **VISIBLE** | 443–509 px → **VISIBLE** | 315–349 px |

**Limite honnête (cran 30) :** au cran 30, le bouton reste 51 px sous le pli — il faudrait gagner ~90 px au-dessus (titre + cartes + bloc départ) pour le faire entrer, ce qui voudrait dire retailler l'accueil (v2.51) pour une métrique de pli. Ce n'est pas fait : au cran 30, le bouton du DÉPART lui-même n'est qu'à moitié visible (masqué par la navigation basse), ce cran n'est pas une hauteur de travail pour le formulaire — et le flux réel de choix d'une destination laisse la feuille au cran 58 (le focus du champ de recherche y monte la feuille, v2.47), où bouton et bannière sont visibles sans scroller. Le cran 30 reste donc documenté, pas atteint.

## Commander pour quelqu'un d'autre (vérifié, rien à construire)

Le départ par défaut est la position GPS (quartier le plus proche), mais les deux épingles sont libres : la géolocalisation silencieuse ne tourne qu'UNE fois au chargement (effet `[]`) et ne touche pas à un départ déjà choisi manuellement (`manualPickupRef`) ; l'effet de changement de phase ne touche que la hauteur de la feuille (aucun reset du départ ou de la destination) ; `POST /api/rides` ne connaît pas la position GPS de celui qui commande (0 mention) et ne valide les points exacts que sur la zone de service ; le bouton Commander n'exige que trajet valide + estimation. Vérifié en DOM avec un GPS simulé à l'Aéroport Léon-Mba : départ par défaut « Aéroport Léon-Mba », déplacé via la liste à Nzeng-Ayong (stable après 4 s, aucun retour GPS), départ déplacé à l'épingle puis confirmé (stable après 3 s), destination Glass → Acaé à l'épingle, et bouton « Se connecter pour commander » actif (non désactivé) avec les deux épingles loin de la position GPS, sans aucun message exigeant d'être au point de départ.

### Point ouvert : le PIN d'une course commandée pour quelqu'un d'autre

Non construit dans ce lot (décision à trancher avec le propriétaire après) : aujourd'hui le code PIN de la course s'affiche à celui qui commande — pour une course commandée pour une autre personne (au point X), il faudra que le PIN parvienne à la personne qui est au point X, pas seulement au commandeur. Ni le partage du PIN, ni la saisie du nom / téléphone du vrai passager ne sont construits ici : le lot se limite à rendre les deux épingles libres et visibles. La décision à prendre : comment le PIN arrive à la personne au point X (envoi par le commandeur ? saisie du passager dans la commande ? autre canal ?).

## Ce qui est conservé

- Mécanisme d'épingle v2.47 inchangé (`adjusting`, `openAdjust`, `handleMapCenterChange`, `confirmAdjust`, `cancelAdjust`, géocodage inverse serveur, validation serveur) ; estimation serveur OSRM recalculée sur le point exact (v2.50) ; envoi de `destinationPoint` dans `POST /api/rides` et affichage côté chauffeur (`/courses/[id]`, `destinationPoint.address`) — vérifiés, pas reconstruits.
- Bouton visible seulement quand une destination est choisie (`destination !== ''`), comme le départ.
- `lib/commission.ts` intouchée ; les 2 règles intactes (chargement = le S du logo partout ; switch passager → chauffeur impossible sans compte chauffeur) ; aucune migration, aucune nouvelle dépendance.

## Preuves et limites de vérification

- `npm run build` exit 0 ; `npx tsc --noEmit` 0 erreur ; `npm run docs:check` OK ; script `scripts/verify-lot-v254.mjs` : 0 échec, 0 avertissement (statique + DOM 390×844, GPS simulé à l'Aéroport).
- Flux épingle destination vérifié : Nzeng-Ayong → Glass = 1 600 FCFA / 9,5 km / ~11 min ; après déplacement de l'épingle d'environ 3 km (Glass → Acaé) = 1 800 FCFA / 11,2 km ; Annuler → retour à 1 600 FCFA + bannière ambre de retour + quartier Glass restauré ; rouvrir → déplacer → Confirmer → 1 800 FCFA conservés, bannière disparue, récap « Nzeng-Ayong → Acaé ».
- Rendus mobiles 390×844 dans `~/workspace/your_files/rendus-v254/` : avant/après du bouton destination (crans 30/58/88), mode épingle destination, confirmation avec adresse exacte.
- **Non prouvé en local :** la recherche de rue « rue du bord de mer » ne renvoie pas cette rue en tête via `/api/search-address` depuis la VM (Photon répond, mais les premiers résultats sont d'autres adresses — la rue n'apparaît pas dans les résultats affichés) ; le flux épingle couvre la précision de toute façon, et la recherche rue par rue (v2.51) reste disponible pour d'autres requêtes. Les tuiles ne chargent pas dans le navigateur de la VM (limitation connue) : les rendus montrent le fond du conteneur + les libellés DOM. La visibilité réelle sur téléphone reste à confirmer en live après push.

## Alternatives écartées

- **Bouton « Préciser » dans la barre flottante « Vers où ? »** : visible à tous les crans, y compris 15 — écarté : la barre est un champ de recherche (un tap ouvre la recherche), y ajouter un second bouton imbriqué complique le geste et charge l'élément le plus visible de la carte ; l'en-tête de la carte destination est l'endroit logique, au même niveau que le bouton départ.
- **Retailler les cartes Trajets / Trajets planifiés pour faire entrer le bouton au cran 30** : écarté — ce serait modifier le design de l'accueil (v2.51/v2.52) pour une métrique de pli, alors que le cran 30 n'est pas une hauteur de travail (le bouton départ y est lui-même à moitié masqué).
- **Défilement automatique de la feuille vers la carte destination à la sélection** : écarté — la feuille monte déjà au cran 58 au focus du champ ; un défilement imposé après chaque sélection serait un geste subi, et il ne résoudrait pas le cran 30 (un repli ultérieur à 30 remasquerait le bouton).
