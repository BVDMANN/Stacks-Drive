'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LIBREVILLE_CENTER, NEIGHBORHOOD_COORDS, NEIGHBORHOOD_LABEL_OFFSET, NEIGHBORHOOD_LABEL_TIER, NEIGHBORHOOD_NO_LABEL, NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM, NEIGHBORHOOD_OSM_LABEL_MAX_ZOOM, type Neighborhood } from '@/lib/neighborhoods';
import { DRIVERS_AROUND_RADIUS_KM, MAP_INITIAL_ZOOM, MAP_MIN_ZOOM, SERVICE_BOUNDS } from '@/lib/geo';
import { POIS, POI_CATEGORY_LABELS, poiIconMinZoom, poiLabelMinZoom, type Poi, type PoiCategory } from '@/lib/pois';
import { DEMO_ROUTES, type DemoRoutePoint } from '@/lib/demo-routes';
import { DRIVE_CAR_MARKER_SVG, DRIVE_MOTO_MARKER_SVG, DRIVE_PIN_MARKER_SVG } from '@/components/icons/DriveCar';
import { DRIVE_POI_SVG } from '@/components/icons/DrivePoi';
import { DRIVE_TRAFFIC_SVG, DrivePin } from '@/components/icons/DriveUi';

export interface MapDriver {
  id: string;
  name: string;
  lat: number;
  lng: number;
  vehicleLabel: string;
  vehicleType: string;
  rating: number | null;
  isDemo: boolean;
}

export interface MapPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface UserLocationPoint {
  lat: number;
  lng: number;
  label: string;
}

/** Point d'un itinéraire routier (géométrie OSRM — `lib/routing.ts`). */
export interface RouteGeometryPoint {
  lat: number;
  lng: number;
}

/** Signalement trafic affiché sur la carte (v2.27) : type, position,
 *  mise en évidence si confirmé par plusieurs chauffeurs. Aucune
 *  donnée personnelle (ni auteur, ni téléphone). */
export interface TrafficMapMarker {
  id: string;
  type: 'embouteillage' | 'accident' | 'travaux' | 'route_fermee';
  lat: number;
  lng: number;
  confirmed: boolean;
  expiresAt: string;
}

export const TRAFFIC_MARKER_LABELS: Record<TrafficMapMarker['type'], string> = {
  embouteillage: 'Embouteillage',
  accident: 'Accident',
  travaux: 'Travaux',
  route_fermee: 'Route fermée',
};

/* Marqueurs de signalement trafic (v2.52) : icônes dessinées Drive —
 *  les pictogrammes emoji (voiture, collision, travaux, route barrée)
 *  faisaient « sticker » au milieu d'une carte
 *  100 % SVG, et le formulaire de signalement utilise déjà des icônes.
 *  Même objet, même langage partout. */
export const TRAFFIC_MARKER_SVG: Record<TrafficMapMarker['type'], string> = DRIVE_TRAFFIC_SVG;

export interface FocusPoint {
  lat: number;
  lng: number;
  zoom: number;
  /** Incrémenté à chaque demande de recentrage : un même point peut
   *  être demandé plusieurs fois (bouton « Recentrer »). */
  nonce: number;
}

/** Glyphs dessinés Drive (v2.52) — voir `components/icons/DriveCar.tsx`
 *  et `components/icons/DrivePoi.tsx` : voitures détaillées (carrosserie,
 *  vitres avec reflet, phare, jantes à branches), lieux dessinés
 *  (fenêtres allumées, liquide, vapeur, vagues…). Les anciennes chaînes
 *  Lucide plates sont supprimées. Les chaînes sont autonomes (aucun
 *  `url(#…)` dedans) : répétables dans des dizaines de marqueurs. */
const CAR_SVG = DRIVE_CAR_MARKER_SVG;
const MOTO_SVG = DRIVE_MOTO_MARKER_SVG;
const PIN_SVG = DRIVE_PIN_MARKER_SVG;
const POI_SVG = DRIVE_POI_SVG;

/** Chauffeurs démo : ils ROULENT le long de leur trajet routier
 *  (`lib/demo-routes.ts`, géométrie OSRM — chaque point est sur une
 *  vraie route de Libreville), en aller-retour à vitesse urbaine
 *  (~29 km/h, 8 m/s). L'ancienne dérive en orbite sinusoïdale (~180 m
 *  d'amplitude autour du quartier) les faisait traverser les maisons
 *  et les parcs : c'est le bug signalé le 14/11/2026 (« les véhicules
 *  se balancent même sur les maisons »). Les vrais chauffeurs ne
 *  passent jamais ici : leur position vient de leur GPS et leur
 *  marqueur reste fixe entre deux mises à jour serveur. */
const DEMO_SPEED_MPS = 8;

function haversineM(a: DemoRoutePoint, b: DemoRoutePoint): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Longueurs cumulées le long d'un trajet (mètres), point 0 = 0. */
function routeCumLengths(route: DemoRoutePoint[]): number[] {
  const cum: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cum.push(cum[i - 1] + haversineM(route[i - 1], route[i]));
  }
  return cum;
}

/** Position + cap à `s` mètres le long du trajet (0 <= s <= total). */
function routePointAt(
  route: DemoRoutePoint[],
  cum: number[],
  s: number
): { lat: number; lng: number; heading: number } {
  const total = cum[cum.length - 1];
  const clamped = Math.max(0, Math.min(total, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < clamped) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const f = (clamped - cum[i - 1]) / segLen;
  const a = route[i - 1];
  const b = route[i];
  const lat = a.lat + f * (b.lat - a.lat);
  const lng = a.lng + f * (b.lng - a.lng);
  // Cap : 0° = nord, 90° = est (même convention que l'ancienne dérive).
  const heading = (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;
  return { lat, lng, heading };
}

/** Distance le long du trajet en aller-retour (onde triangulaire) :
 *  0 → total → 0 → total… : le véhicule fait demi-tour aux deux bouts
 *  de son trajet au lieu de « sauter » d'un bout à l'autre. */
function pingPongDistance(distance: number, total: number): number {
  if (total <= 0) return 0;
  const cycle = 2 * total;
  const d = ((distance % cycle) + cycle) % cycle;
  return d <= total ? d : cycle - d;
}

function driverIcon(d: MapDriver, isAssigned: boolean, isSelected: boolean) {
  const isMoto = d.vehicleType === 'Moto';
  // Badge note (★ 4.8) : hors du glyph, il ne tourne pas avec le cap.
  // Confidentialité chauffeur (v2.20) : la note n'apparaît QUE pour le
  // chauffeur assigné (course acceptée) — jamais sur les marqueurs
  // anonymes avant le matching.
  const badge =
    isAssigned && d.rating != null
      ? `<span class="map-driver-badge"><svg width="9" height="9" viewBox="0 0 24 24" fill="#FF4D8D" aria-hidden="true"><path d="M12 2.5 L14.8 8.6 L21.3 9.4 L16.7 14 L18 20.5 L12 17.3 L6 20.5 L7.3 14 L2.7 9.4 L9.2 8.6 Z"/></svg> ${d.rating.toFixed(1)}</span>`
      : '';
  // Anneau qui s'étend (v2.7) : la carte respire. Décalage stable par
  // chauffeur (dérivé de l'id) pour que les 6 anneaux ne battent pas
  // en chœur.
  const hash = [...d.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const ringDelay = ((hash % 26) / 10).toFixed(1);
  return L.divIcon({
    className: 'map-driver-icon',
    html: `<div class="map-driver-marker${isMoto ? ' moto' : ''}${isAssigned ? ' assigned' : ''}${isSelected ? ' selected' : ''}"><span class="map-driver-ring" style="animation-delay:${ringDelay}s"></span><span class="map-driver-glyph">${isMoto ? MOTO_SVG : CAR_SVG}</span>${badge}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

/** Infobulle d'un marqueur chauffeur (v2.20 — confidentialité).
 *  Avant le matching, le marqueur reste ANONYME : ni nom, ni véhicule,
 *  ni note — juste « Chauffeur disponible » (et « Solo uniquement »
 *  pour la moto, dont le glyph est déjà distinctif). L'identité
 *  complète n'apparaît que pour le chauffeur assigné, une fois la
 *  course acceptée — le seul cas où le passager doit le reconnaître. */
function driverTooltip(d: MapDriver, isAssigned: boolean): string {
  if (isAssigned) {
    return `${d.name} · ${d.vehicleLabel}${d.vehicleType === 'Moto' ? ' · Solo uniquement' : ''}${d.rating ? ` · ★ ${d.rating.toFixed(1)}` : ''}${d.isDemo ? ' · Démo' : ''}`;
  }
  return d.vehicleType === 'Moto' ? 'Chauffeur disponible · Solo uniquement' : 'Chauffeur disponible';
}

interface DriverMarkerEntry {
  marker: L.Marker;
  baseLat: number;
  baseLng: number;
  /** Trajet routier du chauffeur démo (null = pas de trajet : marqueur
   *  fixe — cas des vrais chauffeurs et des démos sans trajet). */
  route: DemoRoutePoint[] | null;
  cum: number[];
  total: number;
  /** Décalage de départ le long du trajet (mètres, stable par id) pour
   *  que les 6 démos ne partent pas toutes du même bout. */
  offset: number;
  isDemo: boolean;
  lastIconKey: string;
}

/** Zooms de la carte — une seule carte, fond OpenStreetMap clair
 *  (v2.50, ADR 0026 : la bascule Plan/Satellite est RETIRÉE —
 *  Yango n'a pas de choix de fond de carte, Drive non plus ;
 *  v2.53, ADR 0029 : retour au fond clair — le fond sombre de la
 *  v2.46 rendait les noms de quartiers illisibles sur téléphone).
 *
 *  Historique des plafonds : v2.18 (satellite Esri : tuiles réelles
 *  jusqu'au zoom 18, au-delà une tuile grise « pas de données »),
 *  v2.39 (plafond 20 → 18 : l'agrandissement ×2/×4 rendait les
 *  contours flous), v2.41 (fond Plan OpenStreetMap, z19 réelle
 *  partout dans la zone), v2.46 (fond Plan sombre, plafond 19
 *  conservé — le plafond 19 est celui de la carte, pas une limite
 *  des tuiles).
 *
 *  Plafond unique : 19 (natif 19). Le bouton + s'y grise ;
 *  l'utilisateur ne peut plus zoomer dans le flou.
 *
 *  ⚠️ RÉSERVE (15/11/2026) sur les vérifications curl : le proxy
 *  de sortie de la VM intercepte désormais les tuiles et renvoie un
 *  contenu FIXE par hôte (OSM = toujours les mêmes 6 725 o /
 *  md5 8e8d1ff4, que ce soit Libreville ou Paris centre) — un HTTP
 *  200 ne prouve donc plus que l'hôte répond, JAMAIS le contenu
 *  d'une tuile. Les « 9 md5 distincts » de la v2.41 ont été mesurés
 *  AVANT ce constat, quand curl rapportait encore des contenus
 *  variés par tuile (tailles et nombres de couleurs différents
 *  selon la zone — un placeholder fixe n'aurait pas pu produire ces
 *  variations) : la vérification reste plausible, mais elle ne peut
 *  plus être REFAITE ni confirmée depuis cette VM. La preuve
 *  visuelle réelle du fond Plan actuel viendra de la vérification
 *  navigateur live après push et du téléphone du propriétaire —
 *  voir ADR 0029. Ne jamais présenter un résultat curl de cette VM
 *  comme une preuve de contenu de tuile. */
const PLAN_MAX_ZOOM = 19;
const PLAN_MAX_NATIVE_ZOOM = 19;

/** Fond Plan OpenStreetMap standard (v2.53, ADR 0029) — tuiles
 *  raster OSM, fond clair (terre claire, routes blanches, eau
 *  bleue, noms de quartiers et de rues en sombre — lisibles en
 *  plein jour, comme sur la v2.41). AUCUNE clé : les tuiles OSM
 *  standard se servent sans clé (`https://tile.openstreetmap.org/
 *  {z}/{x}/{y}.png`, ordre {z}/{x}/{y}). Aucun filtre CSS sombre
 *  sur les tuiles — le thème sombre avait été retiré le 14/11
 *  ~21h58 sur décision du propriétaire (« Retire le thème sombre
 *  là-dessus »), puis remis en sombre natif en v2.46 (15/11 ~07h44,
 *  « La carte à mes palettes de couleur demandées ») : c'est ce
 *  fond sombre que le propriétaire signale illisible le 15/11
 *  (noms de quartiers sombres sur fond noir), d'où ce retour au
 *  clair. La palette « Nuit violette » de l'APPLI ne change pas
 *  (fond #191432, accent #A134F5, rose #FF4D8D) : seuls les fonds
 *  de carte changent — la palette est portée par les surcouches
 *  (libellés Drive, POI, itinéraire, marqueurs) et par le fond du
 *  conteneur `.leaflet-container` (terre claire, voir
 *  `styles/globals.css`) — jamais par les tuiles.
 *  Politique d'usage OSM : attribution obligatoire (texte exact
 *  ci-dessous), tuiles directes OK pour le lancement mais trafic
 *  de production lourd déconseillé — prévoir un fournisseur de
 *  tuiles ou l'auto-hébergement au lancement (même logique que le
 *  serveur OSRM démo de la v2.27, voir ADR 0002).
 *  L'ancienne clé de fond de carte (variable Vercel posée en
 *  v2.46) n'est plus lue par le code : elle peut rester définie
 *  côté Vercel, elle est ignorée. */
const OSM_TILES_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
/** Mention d'attribution exigée par la licence OSM : « ©
 *  OpenStreetMap contributors », seule — plus de second
 *  contributeur depuis le retrait du fond sombre (v2.53). */
const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export function LibrevilleMap({
  drivers,
  pickup,
  destination,
  radarActive,
  radarCenter,
  selectedDriverId,
  assignedDriverId,
  userLocation,
  focusPoint,
  onDriverClick,
  onPoiClick,
  onMapClick,
  selectedPoi,
  routeGeometry,
  trafficReports,
  perimeterCenter,
  className,
  adjusting,
  onCenterChange,
  onCenterMoveStart,
  onCenterPinDragEnd,
  centerPinKey,
}: {
  drivers: MapDriver[];
  pickup: MapPoint | null;
  destination: MapPoint | null;
  radarActive: boolean;
  radarCenter: MapPoint | null;
  selectedDriverId?: string | null;
  assignedDriverId?: string | null;
  userLocation?: UserLocationPoint | null;
  focusPoint?: FocusPoint | null;
  onDriverClick?: (driverId: string) => void;
  /** Clic sur un lieu (POI) : ouvre sa mini-carte d'info. */
  onPoiClick?: (poi: Poi) => void;
  /** Clic sur le fond de carte (pas sur un marqueur) : sert à fermer
   *  la mini-carte d'info d'un lieu. */
  onMapClick?: () => void;
  /** Lieu sélectionné : son pictogramme est mis en surbrillance. */
  selectedPoi?: Poi | null;
  /** Itinéraire routier (v2.27) : géométrie OSRM entre le départ et
   *  la destination. Sans elle (chargement ou OSRM indisponible),
   *  la carte trace l'ancienne ligne droite. */
  routeGeometry?: RouteGeometryPoint[] | null;
  /** Signalements trafic actifs (v2.27) : marqueurs sur la carte des
   *  passagers ET des chauffeurs (suivi de course). */
  trafficReports?: TrafficMapMarker[] | null;
  /** Centre du cercle périmètre 5 km (v2.31) : l'ancre — position GPS
   *  de la personne par défaut, quartier de départ si elle le change
   *  manuellement. Null = pas de cercle (suivi de course, mode
   *  chauffeur). Rayon = `DRIVERS_AROUND_RADIUS_KM` (5 km, la même
   *  valeur que le matching) — jamais un second chiffre. */
  perimeterCenter?: MapPoint | null;
  className?: string;
  /** v2.47 — point en cours d'ajustement à l'épingle (pickup précis,
   *  inspiré Yango) : l'épingle fixe au centre de la carte règle le
   *  point ; le marqueur classique du point ajusté est masqué et la
   *  carte ne se recentre plus automatiquement (le recentrage
   *  combattrait le glisser de l'utilisateur). */
  adjusting?: 'pickup' | 'destination' | null;
  /** v2.47 — centre de la carte après chaque déplacement terminé
   *  (`moveend`) : le parent en déduit le point sous l'épingle. */
  onCenterChange?: (center: { lat: number; lng: number }) => void;
  /** v2.47 — déplacement de la carte commencé (`movestart`) : le
   *  parent affiche l'état de chargement de l'adresse. */
  onCenterMoveStart?: () => void;
  /** v2.47 — l'épingle centrale a été glissée du doigt puis relâchée :
   *  coordonnées du point sous l'épingle au relâcher. */
  onCenterPinDragEnd?: (lat: number, lng: number) => void;
  /** v2.47 — clé de l'épingle centrale : quand elle change, la
   *  surcouche est remontée et sa chute + son rebond sont rejoués
   *  (ouverture de l'ajustement, glisser terminé, confirmation). */
  centerPinKey?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const driverLayerRef = useRef<L.LayerGroup | null>(null);
  const trafficLayerRef = useRef<L.LayerGroup | null>(null);
  const driverMarkersRef = useRef<Map<string, DriverMarkerEntry>>(new Map());
  const radarRef = useRef<{ circle: L.Circle; timer: ReturnType<typeof setInterval> } | null>(null);
  const onDriverClickRef = useRef(onDriverClick);
  onDriverClickRef.current = onDriverClick;
  const onPoiClickRef = useRef(onPoiClick);
  onPoiClickRef.current = onPoiClick;
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;
  const onCenterChangeRef = useRef(onCenterChange);
  onCenterChangeRef.current = onCenterChange;
  const onCenterMoveStartRef = useRef(onCenterMoveStart);
  onCenterMoveStartRef.current = onCenterMoveStart;
  const onCenterPinDragEndRef = useRef(onCenterPinDragEnd);
  onCenterPinDragEndRef.current = onCenterPinDragEnd;
  /** v2.47 — élément DOM de l'épingle centrale (surcouche React) :
   *  le glisser du doigt y est attaché en natif (voir l'effet
   *  dédié) — les événements React arrivent trop tard pour empêcher
   *  le glisser de la carte (l'écouteur Leaflet est plus bas dans
   *  l'arbre). */
  const centerPinElRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const poiMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const perimeterRef = useRef<L.Circle | null>(null);
  // `updateLabels` (défini dans l'effet de création) est rappelé par
  // les effets qui changent les libellés visibles.
  const updateLabelsRef = useRef<(() => void) | null>(null);

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      // Vue d'ouverture = zoom quartier (v2.31, `MAP_INITIAL_ZOOM` =
      // 14) centrée sur l'ancre (Centre-ville par défaut — le parent
      // vole ensuite vers la position GPS ou le départ choisi, voir
      // `focusPoint`) : jamais toute la ville au premier chargement.
      // La vue ville (zoom 12) reste accessible en dézoomant —
      // `minZoom` l'autorise, et rien en dessous. À ce zoom, 6
      // libellés Drive restent visibles (v2.42 : les autres noms
      // sont déjà sur les tuiles OSM).
      center: [LIBREVILLE_CENTER.lat, LIBREVILLE_CENTER.lng],
      zoom: MAP_INITIAL_ZOOM,
      minZoom: MAP_MIN_ZOOM,
      // Bornes (v2.31) : on ne peut pas défiler hors de la zone de
      // service (`SERVICE_BOUNDS`, Grand Libreville) — `viscosity: 1`
      // = bornes fermes, la carte rebondit au lieu de glisser dehors.
      // Le centre reste dans le rectangle ; la vue ville (zoom 12)
      // y tient entièrement.
      maxBounds: L.latLngBounds(
        [SERVICE_BOUNDS.south, SERVICE_BOUNDS.west],
        [SERVICE_BOUNDS.north, SERVICE_BOUNDS.east]
      ),
      maxBoundsViscosity: 1.0,
      // Zoom max 19 (v2.41, conservé en v2.46, v2.50, v2.53) : 19 est
      // le plafond de la carte (tuiles OSM servies jusqu'au zoom
      // 19). Le bouton + s'y grise.
      maxZoom: PLAN_MAX_ZOOM,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });
    // Fond de carte « vivant » (v2.7, fond Plan remplacé en v2.41,
    // v2.46, puis en v2.53) : tuiles OpenStreetMap standard — rues,
    // eau, parcs et noms de rues réels à Libreville, en CLAIR. Le
    // fond « World Dark Gray » précédent était quasi vide : 3 grands
    // axes, aucun libellé, pas d'eau ni de parcs visibles. Le filtre
    // sombre CSS (`.map-tiles-dark` : inversion + rotation de
    // teinte) a été RETIRÉ le 14/11 ~21h58, décision du propriétaire
    // (« Retire le thème sombre là-dessus ») : la carte Plan était
    // alors CLAIRE, comme celle de Skatta. Le 15/11 ~07h44, le
    // propriétaire demande la carte aux couleurs de sa palette
    // (« La carte à mes palettes de couleur demandées ») : le fond
    // Plan repasse en sombre natif en v2.46, PAS par le filtre qui
    // lavait les détails et rendait la carte illisible (v2.41) —
    // aucun `filter` sur le panneau de tuiles, le fond sombre
    // portait ses propres couleurs. Le 15/11, le propriétaire
    // signale sur son téléphone que les noms de quartiers sont
    // sombres et illisibles sur ce fond noir : en v2.53, le fond
    // Plan redevient CLAIR (OSM standard, voir ADR 0029) — aucun
    // `filter` non plus, les tuiles portent leurs propres couleurs.
    // La teinte violette #191432 n'est PAS dans les tuiles (OSM
    // standard est clair) : elle est portée par les surcouches de
    // l'appli — libellés Drive, POI, ligne d'itinéraire rose,
    // marqueurs — voir ADR 0019. Un vrai fond violet demanderait
    // un style vectoriel personnalisé (lot ultérieur possible, non
    // implémenté ici).
    // AUCUNE CLÉ (voir `OSM_TILES_URL`) : les tuiles OSM standard
    // se servent sans clé. L'ancienne clé de fond de carte (variable
    // Vercel posée en v2.46) n'est plus lue par le code.
    // Politique d'usage OSM : attribution obligatoire (texte exact
    // ci-dessous), tuiles directes OK pour le lancement mais trafic
    // de production lourd déconseillé — prévoir un fournisseur de
    // tuiles ou l'auto-hébergement au lancement (même logique que
    // le serveur OSRM démo de la v2.27, voir ADR 0002).
    // Le fond sombre de la v2.46 a été écarté en v2.53 parce que
    // ses libellés étaient illisibles sur téléphone (voir ADR 0029)
    // — pas à cause de sa clé (elle avait été obtenue et posée).
    // Stadia exige aussi une clé (401, v2.41). Le fond Plan Esri
    // World Street Map a été remplacé en v2.41 (ADR 0016) : ses
    // tuiles z19 n'étaient réelles qu'au Centre-ville (tuile grise
    // « pas de données » à Akanda, beige uniforme à Melen /
    // Nzeng-Ayong). La mention « OSM direct bloqué par la politique
    // d'usage (403) » de la v2.7 n'est plus reproduite le 14/11 au
    // soir : curl obtient HTTP 200 sur les tuiles z18 et z19 (avec
    // ou sans User-Agent explicite — les requêtes Leaflet partent du
    // navigateur, avec un vrai User-Agent) — et la réserve sur les
    // vérifications curl depuis cette VM figure dans le bloc des
    // constantes ci-dessus (ADR 0029). Attribution OSM obligatoire
    // (texte exact : « © OpenStreetMap contributors »). La couche
    // de référence « World Dark Gray » est supprimée : le fond Plan
    // porte déjà ses propres libellés (la doubler surchargerait
    // la carte).
    tileLayerRef.current = L.tileLayer(OSM_TILES_URL, {
      // v2.41 / v2.53 : maxZoom 19 + maxNativeZoom 19 — sans
      // maxNativeZoom, Leaflet demanderait des tuiles au zoom
      // affiché, donc des tuiles z20 inexistantes (tuile grise
      // vide) ; sans le plafond 19, il agrandirait les tuiles z19
      // et les contours se perdraient (observation live 14/11,
      // v2.39).
      maxZoom: PLAN_MAX_ZOOM,
      maxNativeZoom: PLAN_MAX_NATIVE_ZOOM,
      attribution: OSM_ATTRIBUTION,
    }).addTo(map);
    L.control.attribution({ position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    routeLayersRef.current = L.layerGroup().addTo(map);
    driverLayerRef.current = L.layerGroup().addTo(map);
    trafficLayerRef.current = L.layerGroup().addTo(map);
    // Libellés de quartiers (v2.5, 3 tiers depuis la v2.8 ; v2.42 :
    // anti-double avec le fond Plan). Permanents, discrets, non
    // interactifs, sous les marqueurs chauffeurs (zIndexOffset
    // négatif). Tier 1 dès le zoom 11, tier 2 dès le zoom 13, tier 3
    // seulement à partir du zoom 14 — aux zooms bas, les petits
    // quartiers sont masqués pour ne pas surcharger la carte. La vue
    // d'ouverture est le zoom 14 (v2.31).
    // v2.42 — le fond Plan OpenStreetMap affichait DÉJÀ la plupart des
    // noms de quartiers sur ses tuiles (vérifié par curl le 14/11 :
    // tuiles z12 à z16, noms OSM de z12 à z16, plus rien à z17-18) :
    // afficher le libellé Drive par-dessus doublait chaque nom, à
    // une position légèrement différente. Les quartiers listés dans
    // `NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM` ont donc leur libellé Drive
    // masqué entre leur zoom minimum et leur borne haute
    // (16 par défaut, 14 pour Akanda — voir
    // `NEIGHBORHOOD_OSM_LABEL_MAX_ZOOM`) — le nom reste visible
    // UNE fois, via la tuile. Hors de cette plage (zoom < min, ou
    // zoom > borne haute : le fond ne labellise plus rien), le libellé
    // Drive s'affiche normalement. Les 13 quartiers que le fond ne
    // labellise jamais (PK5/6/8/9/11/12, Melen, Diba-Diba, Sogara,
    // Santa Clara, Barracuda, Cap Caravane, Bizango) gardent leur
    // libellé Drive à tous les zooms. Les données ne bougent pas :
    // seul l'affichage est filtré — listes, recherche, tarifs et
    // « Me localiser » utilisent les mêmes coordonnées.
    // v2.46 — le fond Plan était passé à un fond sombre : les
    // plages de masquage avaient été relues d'après la définition
    // publique de son style (pas d'après des tuiles vues — les
    // tuiles ne sont pas vérifiables depuis cette VM, voir
    // ADR 0021) : suburb / village / town z12–16, city z8–14,
    // neighbourhood z13–17, aucune règle pour `quarter` (PK5 n'est
    // donc plus masqué). Les zooms minimums v2.42 avaient été
    // conservés (mêmes données OSM sous ce fond) ; la borne haute
    // passe à 14 pour Akanda (`place=city`). En v2.53, le fond
    // redevient OSM standard : les plages redeviennent les
    // observations de tuiles OSM de la v2.42 (valeurs inchangées),
    // à confirmer en live après push — voir ADR 0029.
    // 'Autre' n'est pas un lieu : pas de libellé.
    const labelLayer = L.layerGroup().addTo(map);
    const labelEntries: { marker: L.Marker; tierMin: number; osmMin: number | null; osmMax: number }[] = [];
    (Object.keys(NEIGHBORHOOD_COORDS) as Neighborhood[]).forEach((n) => {
      if (n === 'Autre' || NEIGHBORHOOD_NO_LABEL.has(n)) return;
      const c = NEIGHBORHOOD_COORDS[n];
      const o = NEIGHBORHOOD_LABEL_OFFSET[n];
      const icon = L.divIcon({
        className: 'map-neighborhood-icon',
        html: o
          ? `<div class="map-neighborhood-label" style="transform: translate(calc(-50% + ${o.x}px), calc(-50% + ${o.y}px))">${n}</div>`
          : `<div class="map-neighborhood-label">${n}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const tier = NEIGHBORHOOD_LABEL_TIER[n];
      const marker = L.marker([c.lat, c.lng], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: -500,
      });
      labelEntries.push({
        marker,
        tierMin: tier === 1 ? 11 : tier === 2 ? 13 : 14,
        osmMin: NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM[n] ?? null,
        osmMax: NEIGHBORHOOD_OSM_LABEL_MAX_ZOOM[n] ?? 16,
      });
    });
    // Points d'intérêt (v2.6, cliquables depuis la v2.13) : pictogramme
    // de catégorie + petit libellé, sous les marqueurs chauffeurs. Le
    // clic ouvre la mini-carte d'info du lieu (nom, distance,
    // estimation, « Y aller ») ; il ne se propage pas au fond de carte
    // (sinon la carte se refermerait aussitôt). Le survol garde
    // l'infobulle nom · catégorie · quartier.
    // v2.43 : deux couches — les catégories denses (bars, restaurants)
    // ont leur propre couche, affichée un zoom plus tard (z15) pour ne
    // pas surcharger la carte dans les quartiers denses (Louis,
    // Corniche). Leurs libellés n'apparaissent qu'à z16 (classe
    // `dense`, voir `updateLabels` et le CSS).
    const poiLayer = L.layerGroup();
    const poiDenseLayer = L.layerGroup();
    // Clé stable = `poi.id ?? poi.name` (v2.51) : deux lieux au même
    // nom (ex. deux « Carrefour Market », deux « Épicerie » sans
    // nom) ont des marqueurs distincts — l'ancienne clé sur le nom
    // seul écrasait le premier dans la table.
    const poiByKey = new Map(POIS.map((p) => [p.id ?? p.name, p]));
    POIS.forEach((poi) => {
      const dense = poiIconMinZoom(poi.category) > 14;
      const icon = L.divIcon({
        className: 'map-poi-icon',
        html: `<div class="map-poi-marker cat-${poi.category}${dense ? ' dense' : ''}"><span class="map-poi-glyph">${POI_SVG[poi.category]}</span><span class="map-poi-label">${poi.name}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const marker = L.marker([poi.lat, poi.lng], {
        icon,
        keyboard: false,
        zIndexOffset: -400,
      });
      marker.bindTooltip(`${poi.name} · ${POI_CATEGORY_LABELS[poi.category]} · près de ${poi.neighborhood}`, {
        direction: 'top',
        offset: [0, -14],
        className: 'map-tooltip',
      });
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e.originalEvent);
        onPoiClickRef.current?.(poi);
      });
      marker.addTo(dense ? poiDenseLayer : poiLayer);
      poiMarkersRef.current.set(poi.id ?? poi.name, marker);
    });
    const updateLabels = () => {
      const z = map.getZoom();
      // Libellés de quartiers (v2.42, retour aux règles OSM en
      // v2.53) : visibles selon le tier ET selon le fond. Un
      // quartier que OSM labellise déjà (osmMin) n'affiche son
      // libellé Drive qu'en dehors de la plage [osmMin, osmMax] — à
      // l'intérieur, le nom est déjà sur la tuile, une fois suffit.
      labelEntries.forEach(({ marker, tierMin, osmMin, osmMax }) => {
        const visible =
          z >= tierMin && (osmMin == null || z < osmMin || z > osmMax);
        if (visible) marker.addTo(labelLayer);
        else labelLayer.removeLayer(marker);
      });
      // Points d'intérêt (v2.6, seuil relevé en v2.14) : à partir
      // du zoom 14 seulement — standard « arrivée Google Maps » : à
      // l'arrivée (zoom 12) et en vue d'ensemble (zoom 13), la carte
      // ne montre que les quartiers ; les lieux apparaissent en
      // zoomant. Libellés seulement à partir du zoom 15 (à 14,
      // pictogrammes seuls : les libellés du Centre-ville se
      // chevauchaient).
      // v2.43 : les catégories denses (bars, restaurants) n'apparaissent
      // qu'à partir du zoom 15 (pictogrammes) et leurs libellés qu'à
      // partir du zoom 16 (`map-poi-labels-dense-on`, marqueurs
      // `dense`) — sinon leurs marqueurs se touchent dans les
      // quartiers denses. Et la règle v2.42 s'applique aux lieux
      // (retour aux règles OSM en v2.53) : un lieu que OSM labellise
      // déjà (`osmLabelMinZoom`) n'affiche pas son libellé Drive
      // à partir de ce zoom (classe `label-osm` sur le marqueur —
      // le nom reste visible une fois, via la tuile). Sans
      // `osmLabelMinZoom`, le libellé Drive s'affiche à tous les
      // zooms de son tier.
      if (z >= 14) poiLayer.addTo(map);
      else map.removeLayer(poiLayer);
      if (z >= poiIconMinZoom('bar')) poiDenseLayer.addTo(map);
      else map.removeLayer(poiDenseLayer);
      map.getContainer().classList.toggle('map-poi-labels-on', z >= 15);
      map.getContainer().classList.toggle('map-poi-labels-dense-on', z >= poiLabelMinZoom('bar'));
      poiMarkersRef.current.forEach((marker, key) => {
        const poi = poiByKey.get(key);
        const hideLabel =
          poi?.osmLabelMinZoom != null && z >= poi.osmLabelMinZoom;
        marker
          .getElement()
          ?.querySelector('.map-poi-marker')
          ?.classList.toggle('label-osm', hideLabel);
      });
      // Déclutter des libellés POI (v2.51 — Centre-ville z16) : deux
      // libellés qui se chevaucheraient à l'écran (mêmes seuils que
      // le CSS : z15 non denses, z16 denses, hors règle `label-osm`)
      // — on garde le premier (ordre POIS) et on masque les suivants
      // trop proches (classe `label-hidden` : le pictogramme reste,
      // seul le texte disparaît ; la fiche reste au tap). Les
      // positions relatives ne changent pas au déplacement (translation
      // pure) : le `zoomend` suffit, pas besoin de `moveend`.
      const keptLabelPts: { x: number; y: number }[] = [];
      poiMarkersRef.current.forEach((marker, key) => {
        const el = marker.getElement()?.querySelector('.map-poi-marker');
        if (!el) return;
        const poi = poiByKey.get(key);
        const dense = poi ? poiIconMinZoom(poi.category) > 14 : false;
        const labelOn = dense ? z >= poiLabelMinZoom('bar') : z >= 15;
        const osmHidden = poi?.osmLabelMinZoom != null && z >= poi.osmLabelMinZoom;
        if (!labelOn || osmHidden) {
          el.classList.remove('label-hidden');
          return;
        }
        const pt = map.latLngToContainerPoint(marker.getLatLng());
        const clash = keptLabelPts.some((k) => Math.abs(k.x - pt.x) < 64 && Math.abs(k.y - pt.y) < 16);
        el.classList.toggle('label-hidden', clash);
        if (!clash) keptLabelPts.push({ x: pt.x, y: pt.y });
      });
    };
    map.on('zoomend', updateLabels);
    // Clic sur le fond de carte (pas sur un marqueur) : ferme la
    // mini-carte d'info d'un lieu. Le clic sur un POI ne passe pas
    // ici (stopPropagation dans son gestionnaire).
    map.on('click', () => onMapClickRef.current?.());
    // v2.47 — mouvements de la carte : le parent règle le point sous
    // l'épingle centrale (`moveend` = glisser terminé ; `movestart` =
    // état de chargement de l'adresse dès le premier mouvement).
    map.on('movestart', () => onCenterMoveStartRef.current?.());
    map.on('moveend', () => {
      const c = map.getCenter();
      onCenterChangeRef.current?.({ lat: c.lat, lng: c.lng });
    });
    // v2.42 : `updateLabels` est rappelé par les effets qui
    // changent les libellés visibles.
    updateLabelsRef.current = updateLabels;
    updateLabels();
    // v2.47 — rotation d'écran / clavier qui apparaît : la taille du
    // conteneur change, Leaflet doit recalculer la vue (sans ça, la
    // carte garde ses anciennes dimensions et les tuiles se décalent).
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    mapRef.current = map;
    return () => {
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      driverMarkersRef.current.clear();
      poiMarkersRef.current.clear();
    };
  }, []);

  // Lieu sélectionné (v2.13) : anneau rose autour de son pictogramme.
  useEffect(() => {
    const selectedKey = selectedPoi?.id ?? selectedPoi?.name;
    poiMarkersRef.current.forEach((marker, key) => {
      marker
        .getElement()
        ?.querySelector('.map-poi-marker')
        ?.classList.toggle('selected', selectedKey === key);
    });
  }, [selectedPoi]);

  // v2.50 (ADR 0026) : une seule carte, fond OpenStreetMap clair
  // depuis la v2.53 (ADR 0029) — la bascule Plan/Satellite est
  // retirée (plus de second fond, plus d'effet de bascule).
  // L'attribution reste « © OpenStreetMap contributors »
  // (voir la création de la couche).

  // Itinéraire + départ + destination + « Vous êtes ici ».
  useEffect(() => {
    const map = mapRef.current;
    const layers = routeLayersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    // Itinéraire : halo large discret + pointillés animés par-dessus.
    // Géométrie routière OSRM (v2.27) quand elle est là — sinon
    // l'ancienne ligne droite (repli : OSRM indisponible ou en cours
    // de chargement).
    if (pickup && destination) {
      const line: [number, number][] =
        routeGeometry && routeGeometry.length >= 2
          ? routeGeometry.map((p) => [p.lat, p.lng] as [number, number])
          : [
              [pickup.lat, pickup.lng],
              [destination.lat, destination.lng],
            ];
      L.polyline(line, { color: '#FF4D8D', weight: 9, opacity: 0.18 }).addTo(layers);
      // v2.47 — le tracé se « dessine » vers la destination quand
      // l'itinéraire apparaît ou change (classe `route-draw`) ; pas
      // pendant un ajustement à l'épingle (le tracé y est mis à jour
      // en continu — un dessin répété toutes les secondes serait
      // un clignotement, pas un effet).
      L.polyline(line, {
        color: '#FF4D8D',
        weight: 4,
        dashArray: '2 10',
        lineCap: 'round',
        opacity: 0.95,
        className: adjusting ? 'route-animated' : 'route-animated route-draw',
      }).addTo(layers);
    }

    // « Vous êtes ici » (géolocalisation) : pastille sarcelle pulsante.
    // Étiquette permanente (v2.51) : la position est toujours claire,
    // sans survol — « vous êtes ici » se lit d'un coup d'œil.
    if (userLocation) {
      const icon = L.divIcon({
        className: 'map-user-icon',
        html: `<div class="map-user-marker"></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      L.marker([userLocation.lat, userLocation.lng], { icon, zIndexOffset: 1000 })
        .bindTooltip(`Vous êtes ici · ${userLocation.label}`, {
          direction: 'top',
          offset: [0, -14],
          permanent: true,
          className: 'map-tooltip map-pin-label',
        })
        .addTo(layers);
    }

    // Point de départ (pastille roseange pulsante) — masqué quand il se
    // confond avec « Vous êtes ici » (même position : géolocalisation),
    // et masqué pendant l'ajustement à l'épingle (v2.47 : l'épingle
    // centrale fixe le remplace — un second marqueur au même endroit
    // serait un doublon qui bouge avec la carte).
    if (pickup && adjusting !== 'pickup') {
      const sameAsUser =
        userLocation &&
        Math.abs(userLocation.lat - pickup.lat) < 0.0005 &&
        Math.abs(userLocation.lng - pickup.lng) < 0.0005;
      if (!sameAsUser) {
        const icon = L.divIcon({
          className: 'map-pickup-icon',
          html: `<div class="map-pickup-marker"></div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        L.marker([pickup.lat, pickup.lng], { icon })
          // Étiquette permanente (v2.51) : l'épingle de départ est
          // distincte de celle de destination ET étiquetée — le
          // trajet se lit sans survol ni ambiguïté.
          .bindTooltip(`Départ : ${pickup.label}`, {
            direction: 'top',
            offset: [0, -12],
            permanent: true,
            className: 'map-tooltip map-pin-label',
          })
          .addTo(layers);
      }
    }

    // Destination (épingle rose) — masquée pendant son ajustement à
    // l'épingle (v2.47), comme le départ.
    if (destination && adjusting !== 'destination') {
      const icon = L.divIcon({
        className: 'map-dest-icon',
        html: `<div class="map-dest-marker">${PIN_SVG}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 34],
      });
      L.marker([destination.lat, destination.lng], { icon })
        // Étiquette permanente (v2.51), comme le départ.
        .bindTooltip(`Destination : ${destination.label}`, {
          direction: 'top',
          offset: [0, -32],
          permanent: true,
          className: 'map-tooltip map-pin-label',
        })
        .addTo(layers);
    }

    // Cadrage : départ + destination visibles, sinon on ne touche pas à la vue.
    // Jamais pendant un ajustement à l'épingle (v2.47) : le recentrage
    // combattrait le glisser de l'utilisateur (la carte doit glisser
    // librement sous l'épingle fixe).
    if (pickup && destination && !adjusting) {
      map.fitBounds(
        L.latLngBounds([pickup.lat, pickup.lng], [destination.lat, destination.lng]).pad(0.35),
        { animate: true }
      );
    }
  }, [pickup, destination, userLocation, routeGeometry, adjusting]);

  // Signalements trafic (v2.27) : marqueurs sur la carte des
  // passagers ET des chauffeurs. Un signalement confirmé par plusieurs
  // chauffeurs est mis en évidence (anneau rose + libellé « Confirmé ») ;
  // les autres restent discrets jusqu'à expiration (30–60 min).
  useEffect(() => {
    const layer = trafficLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    (trafficReports ?? []).forEach((r) => {
      const icon = L.divIcon({
        className: 'map-traffic-icon',
        html: `<div class="map-traffic-marker${r.confirmed ? ' confirmed' : ''}">${TRAFFIC_MARKER_SVG[r.type]}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      L.marker([r.lat, r.lng], { icon, keyboard: false, zIndexOffset: 500 })
        .bindTooltip(
          `${TRAFFIC_MARKER_LABELS[r.type]}${r.confirmed ? ' · Confirmé par plusieurs chauffeurs' : ' · Signalé par un chauffeur'}`,
          { direction: 'top', offset: [0, -16], className: 'map-tooltip' }
        )
        .addTo(layer);
    });
  }, [trafficReports]);

  // Marqueurs chauffeurs : synchronisés par id (création / suppression /
  // mise à jour d'icône), jamais recréés en boucle — l'animation de
  // déplacement se fait par setLatLng dans la boucle rAF ci-dessous.
  useEffect(() => {
    const layer = driverLayerRef.current;
    if (!layer) return;
    const entries = driverMarkersRef.current;
    const seen = new Set<string>();
    drivers.forEach((d) => {
      seen.add(d.id);
      const isAssigned = assignedDriverId === d.id;
      const isSelected = selectedDriverId === d.id;
      const iconKey = `${isAssigned ? 'a' : ''}${isSelected ? 's' : ''}`;
      const existing = entries.get(d.id);
      if (existing) {
        existing.baseLat = d.lat;
        existing.baseLng = d.lng;
        existing.isDemo = d.isDemo;
        if (existing.lastIconKey !== iconKey) {
          existing.marker.setIcon(driverIcon(d, isAssigned, isSelected));
          existing.lastIconKey = iconKey;
        }
        // L'infobulle suit le statut : anonyme avant le matching,
        // identité complète une fois le chauffeur assigné (v2.20).
        existing.marker.setTooltipContent(driverTooltip(d, isAssigned));
        return;
      }
      const marker = L.marker([d.lat, d.lng], {
        icon: driverIcon(d, isAssigned, isSelected),
      });
      marker.bindTooltip(driverTooltip(d, isAssigned), {
        direction: 'top',
        offset: [0, -24],
        className: 'map-tooltip',
      });
      marker.on('click', () => onDriverClickRef.current?.(d.id));
      marker.addTo(layer);
      // Trajet routier du chauffeur démo (géométrie OSRM) : le marqueur
      // roulera le long de ce trajet. Décalage de départ pseudo-aléatoire
      // mais stable par chauffeur (dérivé de l'id, pas de l'index : l'ordre
      // du tableau peut changer quand un vrai chauffeur se connecte, sans
      // faire « sauter » les démos d'un bout à l'autre de leur trajet).
      // Les vrais chauffeurs n'ont pas de trajet : marqueur fixe.
      const hash = [...d.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const route = d.isDemo ? (DEMO_ROUTES[d.id] ?? null) : null;
      const cum = route ? routeCumLengths(route) : [];
      const total = cum.length > 0 ? cum[cum.length - 1] : 0;
      entries.set(d.id, {
        marker,
        baseLat: d.lat,
        baseLng: d.lng,
        route: route && route.length >= 2 && total > 0 ? route : null,
        cum,
        total,
        offset: total > 0 ? ((hash % 100) / 100) * total : 0,
        isDemo: d.isDemo,
        lastIconKey: iconKey,
      });
    });
    entries.forEach((entry, id) => {
      if (!seen.has(id)) {
        entry.marker.remove();
        entries.delete(id);
      }
    });
  }, [drivers, selectedDriverId, assignedDriverId]);

  // Animation des chauffeurs démo : ils roulent le long de leur trajet
  // routier (aller-retour), cap = direction du tronçon. requestAnimationFrame
  // uniquement, pas de librairie. Les vrais chauffeurs restent fixes
  // entre deux mises à jour serveur.
  useEffect(() => {
    let raf = 0;
    let lastTick = 0;
    const step = (now: number) => {
      // ~30 images/s suffisent pour une conduite à 29 km/h : on saute des frames.
      if (now - lastTick > 66) {
        lastTick = now;
        const t = now / 1000;
        driverMarkersRef.current.forEach((entry) => {
          if (!entry.isDemo || !entry.route) return;
          const s = pingPongDistance(t * DEMO_SPEED_MPS + entry.offset, entry.total);
          const { lat, lng, heading } = routePointAt(entry.route, entry.cum, s);
          entry.marker.setLatLng([lat, lng]);
          // Rotation du glyph seul (le badge ★ reste droit).
          const el = entry.marker.getElement()?.querySelector('.map-driver-glyph') as HTMLElement | null;
          if (el) el.style.transform = `rotate(${heading.toFixed(0)}deg)`;
        });
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Recentrage demandé par le parent (« Me localiser », « Recentrer »).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusPoint) return;
    map.flyTo([focusPoint.lat, focusPoint.lng], focusPoint.zoom, { duration: 1.1 });
  }, [focusPoint]);

  // Radar : cercle qui s'étend en boucle autour du point de recherche.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (radarRef.current) {
      clearInterval(radarRef.current.timer);
      radarRef.current.circle.remove();
      radarRef.current = null;
    }
    if (!radarActive || !radarCenter) return;
    const circle = L.circle([radarCenter.lat, radarCenter.lng], {
      radius: 100,
      color: '#2FD6C8',
      weight: 2,
      fillColor: '#2FD6C8',
      fillOpacity: 0.12,
    }).addTo(map);
    let radius = 100;
    const timer = setInterval(() => {
      radius += 60;
      if (radius > 1600) radius = 100;
      circle.setRadius(radius);
      circle.setStyle({ fillOpacity: Math.max(0.03, 0.14 - radius / 12000) });
    }, 60);
    radarRef.current = { circle, timer };
    return () => {
      clearInterval(timer);
      circle.remove();
      radarRef.current = null;
    };
  }, [radarActive, radarCenter]);

  // Cercle périmètre 5 km (v2.31) : cercle STATIQUE et subtil, style
  // « Nuit violette » (trait rose pointillé, remplissage rose très léger),
  // autour de l'ancre — il visualise la zone « chauffeurs autour de
  // toi » (rayon de matching, `DRIVERS_AROUND_RADIUS_KM`). Il suit
  // l'ancre quand elle change (position GPS → quartier de départ
  // choisi manuellement). À ne pas confondre avec le radar ci-dessus :
  // le radar est sarcelle, pulsé (100 → 1 600 m en boucle) et actif
  // seulement pendant la recherche ; le périmètre est rose, fixe, et
  // visible en permanence sur l'accueil.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (perimeterRef.current) {
      perimeterRef.current.remove();
      perimeterRef.current = null;
    }
    if (!perimeterCenter) return;
    const circle = L.circle([perimeterCenter.lat, perimeterCenter.lng], {
      radius: DRIVERS_AROUND_RADIUS_KM * 1000,
      color: '#FF4D8D',
      weight: 1.5,
      dashArray: '6 6',
      opacity: 0.55,
      fillColor: '#FF4D8D',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(map);
    perimeterRef.current = circle;
    return () => {
      circle.remove();
      perimeterRef.current = null;
    };
  }, [perimeterCenter]);

  // v2.47 — glisser de l'épingle centrale du doigt (pickup précis).
  // Écouteurs NATIFS sur l'élément : les événements React arrivent
  // trop tard — Leaflet écoute le glisser (`mousedown` / `touchstart`)
  // sur le conteneur, plus bas dans l'arbre que le gestionnaire
  // React, donc il commencerait à déplacer la carte avant que React
  // ne puisse l'empêcher. Ici on coupe la propagation à la source
  // (pointeur, souris, tactile, clic) et on déplace l'épingle à la
  // main ; au relâcher, les coordonnées du point sous l'épingle sont
  // transmises au parent, qui recentre la carte dessus (la vue ne
  // bouge pas pendant le glisser — seule l'épingle bouge).
  useEffect(() => {
    const el = centerPinElRef.current;
    const map = mapRef.current;
    if (!el || !map || !adjusting) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;
    let dragging = false;
    let activePointerId: number | null = null;

    const stop = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    const onPointerDown = (e: PointerEvent) => {
      stop(e);
      dragging = true;
      activePointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dy = 0;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Capture indisponible (vieux navigateur) : le glisser reste
        // suivi tant que le pointeur reste sur l'épingle.
      }
      el.classList.add('map-center-pin-dragging');
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      el.style.transform = `translate(-50%, -100%) translate(${dx}px, ${dy}px)`;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!dragging || (activePointerId !== null && e.pointerId !== activePointerId)) return;
      dragging = false;
      activePointerId = null;
      el.classList.remove('map-center-pin-dragging');
      el.style.transform = '';
      const rect = map.getContainer().getBoundingClientRect();
      const ll = map.containerPointToLatLng([rect.width / 2 + dx, rect.height / 2 + dy]);
      onCenterPinDragEndRef.current?.(ll.lat, ll.lng);
    };
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('mousedown', stop as EventListener);
    el.addEventListener('touchstart', stop as EventListener);
    el.addEventListener('click', stop as EventListener);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('mousedown', stop as EventListener);
      el.removeEventListener('touchstart', stop as EventListener);
      el.removeEventListener('click', stop as EventListener);
    };
    // `centerPinKey` : l'épingle est remontée (chute rejouée) — les
    // écouteurs natifs doivent se rattacher au nouvel élément.
  }, [adjusting, centerPinKey]);

  return (
    <div ref={containerRef} className={className ?? 'h-full w-full'} aria-label="Carte de Libreville">
      {/* v2.47 — épingle centrale fixe (pickup précis, inspiré Yango) :
          la carte glisse dessous, la pointe de l'épingle est le point
          exact. Glissable du doigt (voir l'effet ci-dessus). La
          surcouche ne bloque pas les gestes de la carte : seul le
          pictogramme de l'épingle capte le pointeur. */}
      {adjusting ? (
        <div
          key={centerPinKey ?? 0}
          className="map-center-pin"
          ref={centerPinElRef}
          role="button"
          aria-label="Épingle du point — glissez-la pour préciser"
        >
          <span className="map-center-pin-graphic">
            <DrivePin size={44} className="text-rose-500" />
          </span>
          <span className="map-center-pin-shadow" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
}
