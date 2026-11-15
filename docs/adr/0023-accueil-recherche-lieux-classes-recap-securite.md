# ADR 0023 — Accueil repensé : recherche par lieu, lieux avec ETA, cartes de classe, récap, sécurité — et navigation chauffeur réparée

- **Statut :** acceptée (15/11/2026, lot v2.48 — local, en attente de push).
- **Contexte :** suite de l'ADR 0022. Le propriétaire élargit la demande (15/11 ~09h09) : « copier AUSSI tout le reste de ce qui se passe dans Yango (navigation, etc.), pas seulement le pickup précis », puis envoie deux captures (15/11 ~09h12) : l'accueil Yango (grandes cartes de classe Confort/Éco avec illustration de voiture, lieux enregistrés avec ETA, cartes promo) et le profil Yango. La précision du propriétaire (15/11 ~09h19) : « tout le consort qui vient avec, les mécanismes etc. » — chaque écran doit fonctionner de bout en bout, pas en façade. Et le changement de cap (15/11 ~09h20) : « Ne copie pas textuellement, innove, mets des effets, anticipe, prévois ». Ce lot applique donc les deux : mécanismes réels partout, identité Drive propre, effets et anticipations.

## Décision

1. **Recherche de destination par lieu (typeahead).** `DestinationSearch` : vraie recherche sur les 59 POI (`POIS`, `lib/pois.ts`) + les 70 quartiers — nom ET catégorie (ex. « pharmacie » trouve les pharmacies), score nom > catégorie > quartier, distance/temps depuis le départ (haversine), section « Mes lieux » (favoris + ETA) sans requête, liste complète des quartiers (69, triée) sans requête, état vide guidé. Choisir un résultat déplace l'épingle dessus et remplit la destination (point exact + adresse). Clavier AZERTY avec `enterKeyHint="search"` et bouton « Rechercher » qui ferme le clavier ; la feuille monte au cran 58 quand le champ prend le focus (le clavier ne la masque pas). La destination n'est plus seulement un quartier.
2. **Lieux favoris avec ETA réelle sur l'accueil.** Maison/Travail existent depuis la v2.30 — `FavoritePlaceRow` affiche à côté de chaque lieu son temps de trajet estimé depuis le départ courant, calculé par OSRM (`useRoadRoute`, repli haversine, squelette pendant le calcul, masqué sans départ). L'ETA est mise à jour quand le départ change. Comme Yango (« École 15 min »), mais avec le vrai temps routier Drive, pas une valeur figée.
3. **Barre « Vers où ? » en haut de l'accueil.** Entrée principale vers la recherche de destination, wording Drive (pas « Où allons-nous ? »). Elle affiche la destination choisie quand il y en a une, sinon l'invite.
4. **Cartes de classe visuelles (`RideClassCards`).** Les trois classes en grandes cartes, composition propre à Drive (deux cartes côte à côte Groupe/Solo + Confort en pleine largeur dessous — pas la mise en page Yango) : illustrations SVG dessinées pour Drive (berline rose pour Solo/Confort, citadine sarcelle pour Groupe, palette « Nuit violette », jamais de photo Yango ni d'image copiée), badge « LE MOINS CHER » conservé sur Groupe, prix = estimations indicatives animées (`AnimatedPrice`, squelette pendant le calcul), ETA du chauffeur le plus proche conservée, Confort = clim + 4,5★, même prix que Solo (v2.34). Micro-interactions : carte sélectionnée = anneau rose + ombre + illustration qui monte de 2 px + pastille de validation ; au toucher, la carte se tasse. Les helpers de prix (`AnimatedPrice`, `PriceSkeleton`) sont déplacés de `HomeScreen` vers `components/home/PriceDisplay.tsx` (module partagé, sans import circulaire).
5. **Feuille récapitulative avant commande.** Départ → Destination (adresses exactes quand elles existent), durée routière OSRM, classe choisie, estimation affichée — que des vraies données. **État vide réel quand aucun chauffeur n'est trouvé :** en idle, « 0 chauffeurs autour » + bouton « Planifier pour plus tard » (active la planification + focus sur le champ date/heure) ; en recherche, après 30 s sans proposition, le message d'élargissement + le même bouton (qui ouvre l'annulation puis active la planification). Aucune impasse sans sortie.
6. **Carte « Ta sécurité » sur l'accueil.** SOS 112 (`tel:112`), « Mes contacts de confiance » (→ /compte), « Aide & questions » (→ /aide), note sur le partage automatique + PIN. Que des liens réels, rien de réinventé.
7. **Navigation guidée chauffeur — trou corrigé (G).** `DriverNavigation` (v2.28) affichait « Calcul de l'itinéraire… » indéfiniment quand la position du chauffeur était inconnue (`driverPos` null) ou qu'OSRM ne répondait pas — le `loading` du hook n'était pas transmis. Corrigé : trois états distincts — position inconnue (« Ta position est inconnue — active la géolocalisation pour le guidage pas à pas », bouton Cartes toujours visible, Google Maps part alors de la position de l'appareil), calcul en cours (« Calcul de l'itinéraire vers {cible}… »), échec (« Itinéraire routier indisponible pour le moment — suis le trait sur la carte, ou ouvre l'itinéraire dans l'app Cartes »). Le bouton « Ouvrir dans l'app Cartes » était déjà toujours visible (vérifié). L'ETA et la navigation partent désormais des coordonnées exactes du pickup (v2.47) : le `navTarget` est le point exact, pas le centre du quartier.
8. **Non copié :** les cartes promo Yango (« 1RE FOIS ? FACILE », « YANGO EST ARRIVÉ — courses à partir de 600 FCFA ») — aucun contenu promotionnel inventé, aucun prix d'appel. Le tutoriel passager existant (v2.21, carte d'accueil non bloquante) suffit comme guide « première fois ». Ni les prix fixes de Yango (le modèle Drive reste estimation indicative + négociation), ni la marque / le rouge Yango (palette « Nuit violette »).

## Ce qui vient de Yango, ce qui est propre à Drive

| Écran / mécanisme | Inspiration Yango | Innovation Drive |
|---|---|---|
| Recherche destination | Taper un nom/catégorie → résultats, clavier + « Rechercher » | Recherche sur les POI + quartiers réels avec distance/temps ; sélection qui déplace l'épingle ; section « Mes lieux » intégrée |
| Lieux avec ETA | Lieux enregistrés avec temps de trajet | ETA OSRM réelle depuis le départ courant, recalculée, repli haversine, squelette pendant le calcul |
| Barre d'accueil | « Où allons-nous ? » bien visible | « Vers où ? » — wording Drive, affiche la destination choisie |
| Cartes de classe | Grandes cartes visuelles avec illustration de voiture | Composition Drive (2 + 1 pleine largeur), illustrations SVG propres, micro-interactions (soulèvement, pastille, tassement), prix animés |
| Feuille récap | Départ → Destination + durée + classes + estimation | État vide guidé (planifier / réessayer / élargir) au lieu d'une impasse ; estimation indicative, jamais de prix fixe |
| Sécurité | Carte « Outils de sécurité » sur l'accueil | « Ta sécurité » — wording Drive, regroupe l'existant (SOS, contacts, aide, PIN) sans rien réinventer |
| Navigation chauffeur | Guidage virage par virage | Trois états explicites (inconnu / calcul / échec) au lieu d'un « Calcul… » infini ; bouton Cartes toujours visible |

## Effets et anticipations

- **Effets :** prix qui glissent et font un « pop » à chaque changement d'estimation ; cartes de classe qui se soulèvent et se tassent ; transitions de phase de la feuille (0,28 s) ; squelettes (prix, ETA des lieux, adresse) au lieu de spinners bruts.
- **Anticipations :** aucun chauffeur autour (état vide guidé + planification) ; clavier qui masque la feuille (montée au cran 58) ; recherche sans résultat (état vide guidé, pas d'écran blanc) ; GPS chauffeur inconnu (message distinct + bouton Cartes) ; OSRM indisponible (repli ligne droite + message explicite) ; rotation d'écran (`invalidateSize`, v2.47).
- **Cohérence designer :** un seul style de carte (arrondis 3xl, bordure blanche/10, fond blanc/5), un seul style de bouton (pilule, `active:scale-95`), texte sombre sur rose #FF4D8D (jamais de blanc sur rose), espacements réguliers.

## Preuves et limites de vérification

- `npm run build` exit 0 (43 pages) ; `npm run docs:check` OK (35 blocs) ; rendus mobiles Playwright 390×844 (serveur dev port 3100) : cartes de classe, recherche destination, lieux avec ETA, feuille récap, carte sécurité ; greps de propreté passés (0 nom personnel, 0 mention d'origine artificielle du contenu, 0 clé secrète) ; les 2 règles vérifiées intactes.
- **Non prouvé en local :** l'ETA OSRM réelle des lieux favoris et la durée routière du récap (réseau VM bloqué — repli haversine vérifié par le code) ; la navigation chauffeur de bout en bout avec un vrai GPS (vérifiée par lecture de code : manœuvres OSRM en français + bouton Cartes + ETA vers le pickup exact) — à tester en live avec une course réelle.

## Conséquences

- Aucune migration, aucun nouveau cron, `lib/commission.ts` intouchée.
- `AnimatedPrice` / `PriceSkeleton` vivent désormais dans `components/home/PriceDisplay.tsx` (partagé entre `HomeScreen` et `RideClassCards`).

## Alternatives écartées

- **Copier la mise en page Yango à l'identique (deux grandes cartes Confort/Éco empilées, cartes promo en dessous)** : écarté par le changement de cap du propriétaire (15/11 ~09h20) — composition Drive, pas de copie littérale.
- **Photos de voitures (banque d'images ou captures Yango)** : écarté — illustrations SVG propres, jamais d'image copiée.
- **Champ « code promotionnel » sur l'accueil** : écarté — aucun code n'existe, pas d'UI morte (la fidélité réelle arrive en v2.49, ADR 0024).
