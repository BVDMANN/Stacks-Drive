'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LIBREVILLE_CENTER, NEIGHBORHOOD_COORDS, NEIGHBORHOOD_LABEL_OFFSET, NEIGHBORHOOD_LABEL_TIER, NEIGHBORHOOD_NO_LABEL, type Neighborhood } from '@/lib/neighborhoods';
import { DRIVERS_AROUND_RADIUS_KM, MAP_INITIAL_ZOOM, MAP_MIN_ZOOM, SERVICE_BOUNDS } from '@/lib/geo';
import { POIS, POI_CATEGORY_LABELS, type Poi, type PoiCategory } from '@/lib/pois';
import { DEMO_ROUTES, type DemoRoutePoint } from '@/lib/demo-routes';

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

export const TRAFFIC_MARKER_EMOJIS: Record<TrafficMapMarker['type'], string> = {
  embouteillage: '🚗',
  accident: '💥',
  travaux: '🚧',
  route_fermee: '⛔',
};

export interface FocusPoint {
  lat: number;
  lng: number;
  zoom: number;
  /** Incrémenté à chaque demande de recentrage : un même point peut
   *  être demandé plusieurs fois (bouton « Recentrer »). */
  nonce: number;
}

/** Glyphs « Nuit dorée » (v2.5) : trait sombre #070B16 sur pastille or.
 *  La moto a son propre glyph (lucide « bike ») — visible d'un coup
 *  d'œil, contrairement à l'ancienne voiture blanche unique. */
const CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#070B16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;

const MOTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#070B16" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="6" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>`;

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#FFD60A" stroke="#FFD60A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#0B1020"/></svg>`;

/** Pictogrammes des points d'intérêt (v2.6) — traits fins, couleur or
 *  héritée du CSS (.map-poi-icon). Un pictogramme par catégorie. */
const POI_SVG: Record<PoiCategory, string> = {
  supermarche: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
  marche: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 2 3 4H3l3-4Z" fill="none"/><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  station: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="15" y1="22" y2="22"/><line x1="4" x2="14" y1="9" y2="9"/><path d="M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0V9.83a2 2 0 0 0-.59-1.42L18 5"/></svg>`,
  pharmacie: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/></svg>`,
  hotel: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>`,
  sante: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>`,
  lieu: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
  aeroport: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>`,
  port: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" x2="12" y1="22" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`,
  stade: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`,
  musee: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  plage: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`,
  gare: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="13" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>`,
};

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
      ? `<span class="map-driver-badge">★ ${d.rating.toFixed(1)}</span>`
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

/** Zooms de la carte (v2.18 — correctif « satellite en zoom fort »,
 *  v2.39 — plafond 20 → 18, v2.41 — fond Plan OpenStreetMap, zoom 19).
 *  Cause trouvée par curl le 14/11/2026 (tuiles Esri servies en
 *  HTTP 200, JPEG 256×256, Centre-ville 0,3901/9,4544 + Akanda,
 *  Owendo, Melen, Nzeng-Ayong, Aéroport) :
 *  - World Imagery (satellite) : tuiles RÉELLES jusqu'au zoom 18
 *    (z18 Centre-ville : 13 551 o, 17 218 couleurs ; grille 3×3
 *    autour du centre : 9 tuiles distinctes). Au zoom 19 et au-delà,
 *    Esri renvoie partout la MÊME tuile grise « pas de données »
 *    (2 521 o, md5 f27d9de7f8, 123 couleurs, gris 205 — identique
 *    en z19 et z20, au Centre-ville comme à Akanda) : c'est elle que
 *    l'utilisateur voyait (« on ne voit plus rien en zoomant »).
 *    Zoom natif max satellite à Libreville : 18 — INCHANGÉ en v2.41.
 *  - World Street Map (plan Esri, remplacé en v2.41) : z19 réelle au
 *    Centre-ville seulement (6 005 o, 2 394 couleurs) ; à Akanda
 *    c'est la même tuile grise « pas de données », à Melen /
 *    Nzeng-Ayong une tuile beige uniforme sans rue. Le zoom 18
 *    était réel partout : natif max plan retenu : 18 aussi, pour
 *    qu'aucun des deux modes n'affiche de vide au zoom max.
 *  Correctif Leaflet (v2.18) : `maxNativeZoom: 18` sur la couche
 *  (au-delà, Leaflet agrandit les tuiles z18 au lieu de demander
 *  des tuiles z19+ inexistantes) et `maxZoom: 20` sur la carte
 *  comme sur la couche — à z19 les tuiles sont agrandies ×2, à z20
 *  ×4 : les bâtiments restent visibles, jamais de fond vide. Ne pas
 *  remonter `maxNativeZoom` sans re-vérifier les tuiles par curl
 *  d'abord.
 *  v2.39 (14/11, observation live sur mobile) : le plafond 20 a été
 *  ramené à 18 — l'agrandissement ×2/×4 ne « garde » rien : à z19-20
 *  les contours des rues deviennent flous et mous, le réseau
 *  secondaire disparaît (Plan : 2 à 4 artères floues, 1 seul libellé
 *  minuscule ; Satellite : image pixelisée, coutures visibles).
 *  18 est le dernier zoom RÉEL des deux modes : le bouton + s'y
 *  grise, l'utilisateur ne peut plus zoomer dans le flou.
 *  v2.41 (14/11) : le fond Plan passe à OpenStreetMap standard
 *  (tuiles `tile.openstreetmap.org/{z}/{x}/{y}.png` — ordre
 *  {z}/{x}/{y}, inverse de l'ordre ArcGIS {z}/{y}/{x}).
 *  Vérifié par curl le 14/11/2026 (Centre-ville 0,39/9,45,
 *  tuile z18 137953/130788, tuile z19 275906/261576) : z19 RÉELLE
 *  partout dans la zone de service — grille 3×3 au Centre-ville :
 *  9 tuiles HTTP 200, 4 157 à 10 812 o, 9 md5 distincts, 67 à
 *  256 couleurs chacune ; Akanda (5 428 o, 27 couleurs, vert
 *  végétal dominant), Owendo (2 177 o, 13 couleurs) et Melen
 *  (1 408 o, 30 couleurs) : HTTP 200 aussi — les faibles nombres
 *  de couleurs sont le rendu réel OSM d'une zone peu dense
 *  (couvert végétal / bâti clairsemé), pas une tuile « pas de
 *  données » (OSM ne sert pas de tuile d'erreur : il rend les
 *  données, même clairsemées). Plafond Plan : 19 (natif 19).
 *  Le plafond est désormais PAR MODE : Plan 19, Satellite 18 —
 *  la carte règle son `maxZoom` à chaque bascule (`setMaxZoom`
 *  dans l'effet `basemap`) pour que le Satellite ne zoome jamais
 *  dans l'agrandissement flou de la v2.39. Le bouton + se grise
 *  à 19 en Plan, à 18 en Satellite. */
const PLAN_MAX_ZOOM = 19;
const SATELLITE_MAX_ZOOM = 18;
const SATELLITE_MAX_NATIVE_ZOOM = 18;
const PLAN_MAX_NATIVE_ZOOM = 19;
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
  basemap,
  onPoiClick,
  onMapClick,
  selectedPoi,
  routeGeometry,
  trafficReports,
  perimeterCenter,
  className,
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
  /** Fond de carte (v2.13, v2.41) : 'plan' (OpenStreetMap + filtre
   *  sombre) ou 'satellite' (Esri World Imagery, sans filtre). */
  basemap?: 'plan' | 'satellite';
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
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const poiMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const perimeterRef = useRef<L.Circle | null>(null);

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      // Vue d'ouverture = zoom quartier (v2.31, `MAP_INITIAL_ZOOM` =
      // 14) centrée sur l'ancre (Centre-ville par défaut — le parent
      // vole ensuite vers la position GPS ou le départ choisi, voir
      // `focusPoint`) : jamais toute la ville au premier chargement.
      // La vue ville (zoom 12, 12 libellés) reste accessible en
      // dézoomant — `minZoom` l'autorise, et rien en dessous.
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
      // Zoom max 19 en Plan, 18 en Satellite (v2.41, remplace le 18
      // unique de la v2.39) : 19 est le dernier zoom réel du fond
      // Plan OpenStreetMap (tuiles natives jusqu'à 19, vérifié par
      // curl le 14/11 — voir constantes ci-dessus), 18 celui du
      // Satellite Esri. Le plafond est PAR MODE : la bascule
      // Plan/Satellite règle `map.setMaxZoom` (effet `basemap`) —
      // sans ça, le Satellite zoomerait à 19 dans l'agrandissement
      // flou des tuiles z18 (bug v2.39). Le bouton + se grise à 19
      // en Plan, à 18 en Satellite. La carte s'ouvre en Plan :
      // plafond initial = 19.
      maxZoom: PLAN_MAX_ZOOM,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });
    // Fond de carte « vivant » (v2.7, fond Plan remplacé en v2.41) :
    // OpenStreetMap standard — rues, eau, parcs et noms de rues
    // réels à Libreville. Le fond « World Dark Gray » précédent
    // était quasi vide : 3 grands axes, aucun libellé, pas d'eau
    // ni de parcs visibles. Le filtre sombre CSS (`.map-tiles-dark` :
    // inversion + rotation de teinte) a été RETIRÉ le 14/11 ~21h58,
    // décision du propriétaire (« Retire le thème sombre là-dessus ») :
    // la carte Plan est désormais CLAIRE, comme celle de Skatta.
    // Gratuites, sans clé.
    // CARTO dark_all a été écarté : il exige désormais une clé API
    // (vérifié par curl 14/11 : tuile « API KEY REQUIRED ») ;
    // Stadia exige aussi une clé (401). Le fond Plan Esri World
    // Street Map a été remplacé en v2.41 (ADR 0016) : ses tuiles
    // z19 n'étaient réelles qu'au Centre-ville (tuile grise « pas
    // de données » à Akanda, beige uniforme à Melen / Nzeng-Ayong)
    // et le filtre sombre lavait ses détails — OSM sert des tuiles
    // z19 réelles partout dans la zone de service (vérifié par
    // curl le 14/11, voir constantes en tête de fichier) et garde
    // des détails nets, sans filtre (le filtre sombre a été retiré
    // le 14/11 ~21h58, voir ci-dessus). La mention « OSM direct
    // bloqué par la politique d'usage (403) » de la v2.7 n'est plus
    // reproduite le 14/11 au soir : curl obtient HTTP 200 sur les
    // tuiles z18 et z19 (avec ou sans User-Agent explicite — les
    // requêtes Leaflet partent du navigateur, avec un vrai
    // User-Agent). Politique d'usage OSM : attribution obligatoire
    // (texte exact ci-dessous), tuiles directes OK pour le
    // lancement mais trafic de production lourd déconseillé —
    // prévoir un fournisseur de tuiles ou l'auto-hébergement au
    // lancement (même logique que le serveur OSRM démo de la
    // v2.27, voir ADR 0016). ATTENTION à l'ordre des paramètres
    // OSM : {z}/{x}/{y} — l'ordre ArcGIS du fond Satellite est
    // {z}/{y}/{x}, ne pas les confondre. Tuiles vérifiées par curl
    // (z=18-19, Libreville : HTTP 200, PNG 256×256, rues +
    // libellés + eau + parcs, puis simulation du filtre sombre
    // vérifiée visuellement). Attribution OSM obligatoire (texte
    // exact du service : « © OpenStreetMap contributors »).
    // La couche de référence « World Dark Gray » est supprimée : le
    // fond Plan porte déjà ses propres libellés (la doubler
    // surchargerait la carte).
    tileLayerRef.current = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        // v2.41 : maxZoom 19 + maxNativeZoom 19 en Plan — sans
        // maxNativeZoom, Leaflet demanderait des tuiles au zoom
        // affiché, donc des tuiles z20 inexistantes (tuile grise
        // vide) ; sans le plafond 19, il agrandirait les tuiles
        // z19 et les contours se perdraient (observation live
        // 14/11, v2.39). Le plafond Satellite reste 18 (voir
        // l'effet `basemap` : il règle maxZoom/maxNativeZoom
        // et le maxZoom de la carte à chaque bascule).
        maxZoom: PLAN_MAX_ZOOM,
        maxNativeZoom: PLAN_MAX_NATIVE_ZOOM,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }
    ).addTo(map);
    L.control.attribution({ position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    routeLayersRef.current = L.layerGroup().addTo(map);
    driverLayerRef.current = L.layerGroup().addTo(map);
    trafficLayerRef.current = L.layerGroup().addTo(map);
    // Libellés de quartiers (v2.5, 3 tiers depuis la v2.8) : permanents,
    // discrets, non interactifs, sous les marqueurs chauffeurs
    // (zIndexOffset négatif). Tier 1 dès le zoom 11, tier 2 dès le
    // zoom 13, tier 3 seulement à partir du zoom 14 — aux zooms bas,
    // les petits quartiers sont masqués pour ne pas surcharger la
    // carte. La vue d'ouverture est le zoom 14 (v2.31) : les 69
    // libellés sont donc visibles dès l'arrivée ; en dézoomant vers
    // la vue ville (zoom 12), seuls les 12 du tier 1 restent.
    // 'Autre' n'est pas un lieu : pas de libellé.
    const labelMajor = L.layerGroup().addTo(map);
    const labelMid = L.layerGroup();
    const labelMinor = L.layerGroup();
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
      L.marker([c.lat, c.lng], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: -500,
      }).addTo(tier === 1 ? labelMajor : tier === 2 ? labelMid : labelMinor);
    });
    // Points d'intérêt (v2.6, cliquables depuis la v2.13) : pictogramme
    // de catégorie + petit libellé, sous les marqueurs chauffeurs. Le
    // clic ouvre la mini-carte d'info du lieu (nom, distance,
    // estimation, « Y aller ») ; il ne se propage pas au fond de carte
    // (sinon la carte se refermerait aussitôt). Le survol garde
    // l'infobulle nom · catégorie · quartier.
    const poiLayer = L.layerGroup();
    POIS.forEach((poi) => {
      const icon = L.divIcon({
        className: 'map-poi-icon',
        html: `<div class="map-poi-marker cat-${poi.category}"><span class="map-poi-glyph">${POI_SVG[poi.category]}</span><span class="map-poi-label">${poi.name}</span></div>`,
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
      marker.addTo(poiLayer);
      poiMarkersRef.current.set(poi.name, marker);
    });
    const updateLabels = () => {
      const z = map.getZoom();
      if (z >= 11) labelMajor.addTo(map);
      else map.removeLayer(labelMajor);
      if (z >= 13) labelMid.addTo(map);
      else map.removeLayer(labelMid);
      if (z >= 14) labelMinor.addTo(map);
      else map.removeLayer(labelMinor);
      // Points d'intérêt (v2.6, seuil relevé en v2.14) : à partir
      // du zoom 14 seulement — standard « arrivée Google Maps » : à
      // l'arrivée (zoom 12) et en vue d'ensemble (zoom 13), la carte
      // ne montre que les quartiers ; les lieux apparaissent en
      // zoomant. Libellés seulement à partir du zoom 15 (à 14,
      // pictogrammes seuls : les libellés du Centre-ville se
      // chevauchaient).
      if (z >= 14) poiLayer.addTo(map);
      else map.removeLayer(poiLayer);
      map.getContainer().classList.toggle('map-poi-labels-on', z >= 15);
    };
    map.on('zoomend', updateLabels);
    // Clic sur le fond de carte (pas sur un marqueur) : ferme la
    // mini-carte d'info d'un lieu. Le clic sur un POI ne passe pas
    // ici (stopPropagation dans son gestionnaire).
    map.on('click', () => onMapClickRef.current?.());
    updateLabels();
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      driverMarkersRef.current.clear();
      poiMarkersRef.current.clear();
    };
  }, []);

  // Lieu sélectionné (v2.13) : anneau or autour de son pictogramme.
  useEffect(() => {
    poiMarkersRef.current.forEach((marker, name) => {
      marker
        .getElement()
        ?.querySelector('.map-poi-marker')
        ?.classList.toggle('selected', selectedPoi?.name === name);
    });
  }, [selectedPoi]);

  // Fond de carte (v2.13, v2.41) : Plan (OpenStreetMap + filtre
  // sombre) ou Satellite (Esri World Imagery, sans filtre — images
  // gratuites, sans clé). Seule la couche de tuiles change :
  // marqueurs, POI, radar, itinéraire et libellés restent.
  // Retirer / remettre la couche rafraîchit l'attribution et les tuiles.
  useEffect(() => {
    const map = mapRef.current;
    const layer = tileLayerRef.current;
    if (!map || !layer) return;
    const satellite = basemap === 'satellite';
    layer.setUrl(
      satellite
        ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    );
    // v2.18 + v2.41 : le zoom natif ET le plafond dépendent du fond
    // (Plan OSM : natif 19, plafond 19 ; Satellite Esri : natif 18,
    // plafond 18 — voir constantes en tête de fichier). Leaflet
    // relit `options.maxNativeZoom` à chaque demande de tuile, donc
    // la mise à jour ici suffit ; retirer / remettre la couche
    // force le rechargement des tuiles au bon niveau natif. Le
    // plafond de la CARTE suit aussi le mode (`setMaxZoom`) : sans
    // ça, le Satellite pourrait zoomer à 19 et n'afficher que des
    // tuiles z18 agrandies et floues (bug v2.39) ; en Plan, le
    // bouton + se grise à 19, en Satellite à 18.
    layer.options.maxNativeZoom = satellite ? SATELLITE_MAX_NATIVE_ZOOM : PLAN_MAX_NATIVE_ZOOM;
    layer.options.maxZoom = satellite ? SATELLITE_MAX_ZOOM : PLAN_MAX_ZOOM;
    map.setMaxZoom(satellite ? SATELLITE_MAX_ZOOM : PLAN_MAX_ZOOM);
    layer.options.attribution = satellite
      ? 'Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      : '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    layer.remove();
    layer.addTo(map);
    // Contraste des libellés en Satellite : l'image est variée
    // (sable, végétation, toits), les libellés ont besoin d'un halo
    // plus fort (classe sur le conteneur, voir globals.css).
    map.getContainer().classList.toggle('map-satellite', satellite);
  }, [basemap]);

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
      L.polyline(line, { color: '#FFC700', weight: 9, opacity: 0.18 }).addTo(layers);
      L.polyline(line, {
        color: '#ffd60a',
        weight: 4,
        dashArray: '2 10',
        lineCap: 'round',
        opacity: 0.95,
        className: 'route-animated',
      }).addTo(layers);
    }

    // « Vous êtes ici » (géolocalisation) : pastille cyan pulsante.
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
          className: 'map-tooltip',
        })
        .addTo(layers);
    }

    // Point de départ (pastille orange pulsante) — masqué quand il se
    // confond avec « Vous êtes ici » (même position : géolocalisation).
    if (pickup) {
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
          .bindTooltip(`Départ : ${pickup.label}`, { direction: 'top', offset: [0, -12] })
          .addTo(layers);
      }
    }

    // Destination (épingle or).
    if (destination) {
      const icon = L.divIcon({
        className: 'map-dest-icon',
        html: `<div class="map-dest-marker">${PIN_SVG}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 34],
      });
      L.marker([destination.lat, destination.lng], { icon })
        .bindTooltip(`Destination : ${destination.label}`, { direction: 'top', offset: [0, -32] })
        .addTo(layers);
    }

    // Cadrage : départ + destination visibles, sinon on ne touche pas à la vue.
    if (pickup && destination) {
      map.fitBounds(
        L.latLngBounds([pickup.lat, pickup.lng], [destination.lat, destination.lng]).pad(0.35),
        { animate: true }
      );
    }
  }, [pickup, destination, userLocation, routeGeometry]);

  // Signalements trafic (v2.27) : marqueurs sur la carte des
  // passagers ET des chauffeurs. Un signalement confirmé par plusieurs
  // chauffeurs est mis en évidence (anneau doré + libellé « Confirmé ») ;
  // les autres restent discrets jusqu'à expiration (30–60 min).
  useEffect(() => {
    const layer = trafficLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    (trafficReports ?? []).forEach((r) => {
      const icon = L.divIcon({
        className: 'map-traffic-icon',
        html: `<div class="map-traffic-marker${r.confirmed ? ' confirmed' : ''}">${TRAFFIC_MARKER_EMOJIS[r.type]}</div>`,
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
      color: '#22D3EE',
      weight: 2,
      fillColor: '#22D3EE',
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
  // « Nuit dorée » (trait or pointillé, remplissage or très léger),
  // autour de l'ancre — il visualise la zone « chauffeurs autour de
  // toi » (rayon de matching, `DRIVERS_AROUND_RADIUS_KM`). Il suit
  // l'ancre quand elle change (position GPS → quartier de départ
  // choisi manuellement). À ne pas confondre avec le radar ci-dessus :
  // le radar est cyan, pulsé (100 → 1 600 m en boucle) et actif
  // seulement pendant la recherche ; le périmètre est or, fixe, et
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
      color: '#FFD60A',
      weight: 1.5,
      dashArray: '6 6',
      opacity: 0.55,
      fillColor: '#FFD60A',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(map);
    perimeterRef.current = circle;
    return () => {
      circle.remove();
      perimeterRef.current = null;
    };
  }, [perimeterCenter]);

  return <div ref={containerRef} className={className ?? 'h-full w-full'} aria-label="Carte de Libreville" />;
}
