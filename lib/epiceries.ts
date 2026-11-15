/** Épiceries de Libreville (v2.51) — données OpenStreetMap,
 *  générées par `scripts/fetch-epiceries.mjs` (NE PAS ÉDITER À LA
 *  MAIN — relancer le script pour rafraîchir).
 *
 *  Source : Photon (REPLI PARTIEL, par noms — Overpass injoignable depuis la VM de dev ; pour la couverture complète, relancer le script depuis un poste avec accès Overpass).
 *  Date de génération : 2026-11-15 — 31 point(s).
 *  Déduplication : 1 point(s) écarté(s) car déjà
 *  présent(s) dans les POI (`lib/pois.ts`) — même lieu = une seule
 *  fois (voir le journal du script).
 *
 *  Chaque point vient d'OSM avec ses vraies coordonnées et son vrai
 *  nom ; sans nom → libellé générique « Épicerie » + rue si connue,
 *  jamais de nom inventé. La carte ne dépend pas d'Overpass à
 *  chaque chargement : ces données sont locales.
 */

export type EpicerieShop = 'supermarket' | 'convenience' | 'grocery';

/** Une épicerie OSM : nom réel (ou « Épicerie » générique), type de
 *  commerce, coordonnées exactes, rue si connue. Identifiant
 *  stable (osm_type + osm_id) — deux « Épicerie » sans nom ne se
 *  confondent pas. */
export interface Epicerie {
  id: string;
  name: string;
  shop: EpicerieShop;
  lat: number;
  lng: number;
  street: string | null;
}

export const EPICERIES: Epicerie[] = [
  { id: 'epicerie-N-4040655381', name: 'Carrefour Market', shop: 'supermarket', lat: 0.4320857, lng: 9.4379555, street: 'Avenue Jean Pierre AMBOUROUET DEMBA' },
  { id: 'epicerie-N-4648354091', name: 'Carrefour Market', shop: 'supermarket', lat: 0.4825782, lng: 9.399342, street: 'Boulevard Georges Rawiri' },
  { id: 'epicerie-N-12241024901', name: 'Carrefour Market', shop: 'supermarket', lat: 0.3638845, lng: 9.4726377, street: 'Voie Express' },
  { id: 'epicerie-W-1131700580', name: 'Carrefour Market', shop: 'supermarket', lat: 0.4239584, lng: 9.483025, street: 'Avenue du Stade' },
  { id: 'epicerie-N-4811101921', name: 'Carrefour Market', shop: 'supermarket', lat: 0.3987726, lng: 9.4394163, street: 'Rue Michel BIGOUNDOU' },
  { id: 'epicerie-W-1136962300', name: 'Carrefour Market', shop: 'supermarket', lat: 0.3866734, lng: 9.4767174, street: 'Avenue Jaques LIBIZANGOMO JOUMAS' },
  { id: 'epicerie-N-11195185446', name: 'Carrefour Market', shop: 'supermarket', lat: 0.4106548, lng: 9.5571918, street: 'Rond-Point Bikélé' },
  { id: 'epicerie-N-12293428273', name: 'Casino', shop: 'supermarket', lat: 0.3883173, lng: 9.4456955, street: 'Rue Lafond' },
  { id: 'epicerie-W-1102925893', name: 'Cecado', shop: 'supermarket', lat: 0.4252005, lng: 9.4693884, street: 'Avenue Aime MONDJOT' },
  { id: 'epicerie-N-6297338985', name: 'Cecado', shop: 'supermarket', lat: 0.3626376, lng: 9.4688578, street: 'Rue Bonaventure AWORET' },
  { id: 'epicerie-W-1350984608', name: 'Cecado', shop: 'supermarket', lat: 0.4093345, lng: 9.4909317, street: null },
  { id: 'epicerie-W-1350984609', name: 'Cecado', shop: 'supermarket', lat: 0.4084138, lng: 9.4889843, street: null },
  { id: 'epicerie-N-4280991200', name: 'Cecado', shop: 'supermarket', lat: 0.4013657, lng: 9.5231198, street: null },
  { id: 'epicerie-W-1137223625', name: 'Cecado', shop: 'supermarket', lat: 0.4369972, lng: 9.4407202, street: 'Echangeur des Charbonnages' },
  { id: 'epicerie-W-1198870207', name: 'Cecado', shop: 'supermarket', lat: 0.4173337, lng: 9.5033328, street: 'Rue Jean Baptiste Otoghe Ekomie' },
  { id: 'epicerie-W-1388922626', name: 'Cecado', shop: 'supermarket', lat: 0.3996469, lng: 9.4499869, street: 'Avenue Louis Edouard Bouet Willaumez' },
  { id: 'epicerie-W-1322844743', name: 'Cecado', shop: 'supermarket', lat: 0.3713533, lng: 9.4774738, street: 'Avenue Sophie Ntoutoume Emane' },
  { id: 'epicerie-N-11458059471', name: 'Cecado', shop: 'supermarket', lat: 0.4061108, lng: 9.4672181, street: null },
  { id: 'epicerie-W-1346843882', name: 'Cecado', shop: 'supermarket', lat: 0.3701709, lng: 9.4623505, street: 'Avenue Roi Denis Rapontchombo' },
  { id: 'epicerie-W-459149060', name: 'Cecado', shop: 'supermarket', lat: 0.3986926, lng: 9.4593956, street: 'Avenue Catherine Mistoul Yenga' },
  { id: 'epicerie-W-322017616', name: 'Cecado', shop: 'supermarket', lat: 0.3771807, lng: 9.4550552, street: 'Avenue Georges Damas Aleka' },
  { id: 'epicerie-W-251140672', name: 'Cecado', shop: 'supermarket', lat: 0.4588857, lng: 9.4087766, street: 'Boulevard Hassan II' },
  { id: 'epicerie-N-13433822324', name: 'Cecado', shop: 'supermarket', lat: 0.4825472, lng: 9.404775, street: 'Avenue Léopard Sédar Senghor' },
  { id: 'epicerie-N-3139943319', name: 'Cecado', shop: 'supermarket', lat: 0.4331244, lng: 9.4240434, street: 'Avenue Paul Moukambi' },
  { id: 'epicerie-N-8347219427', name: 'Epicerie ETS  et freres', shop: 'convenience', lat: 0.3807203, lng: 9.4976971, street: 'Rue Jean Robert NDONG EMANE' },
  { id: 'epicerie-N-11178391115', name: 'Epicerie Gondjala', shop: 'convenience', lat: 0.4229315, lng: 9.4733668, street: 'Avenue Jean Hilaire Aubame Eyeghe' },
  { id: 'epicerie-N-12247705655', name: 'Géant CKdo', shop: 'supermarket', lat: 0.4016436, lng: 9.437689, street: 'Boulevard Monseigneur Jean-Rémi Bessieux' },
  { id: 'epicerie-N-12082780560', name: 'Marina Market', shop: 'convenience', lat: 0.4229061, lng: 9.4287882, street: 'Avenue Félix Houphouet Boigny' },
  { id: 'epicerie-N-12541544219', name: 'MS Market', shop: 'convenience', lat: 0.4371645, lng: 9.4422338, street: 'Rue William OYONE' },
  { id: 'epicerie-N-12123522868', name: 'OKIRA Market', shop: 'supermarket', lat: 0.4031247, lng: 9.4420163, street: 'Boulevard Monseigneur Jean-Rémi Bessieux' },
  { id: 'epicerie-N-12503895250', name: 'Supermarché PK12', shop: 'convenience', lat: 0.4019981, lng: 9.5235197, street: 'Rond Point PK12' },
];
