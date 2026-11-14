'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LIBREVILLE_CENTER, NEIGHBORHOOD_COORDS, NEIGHBORHOOD_LABEL_OFFSET, NEIGHBORHOOD_LABEL_TIER, type Neighborhood } from '@/lib/neighborhoods';
import { POIS, POI_CATEGORY_LABELS, type PoiCategory } from '@/lib/pois';

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
};

/** Dérive lente des chauffeurs démo : ils « roulent » autour de leur
 *  quartier (orbite sinusoïdale, ~150 m d'amplitude) pour donner une
 *  sensation de direct. Les vrais chauffeurs restent à leur position
 *  de base (mise à jour par le serveur). */
function demoDrift(
  baseLat: number,
  baseLng: number,
  t: number,
  phase: number,
  speed: number
): { lat: number; lng: number; heading: number } {
  const ampLat = 0.0016;
  const ampLng = 0.0016;
  const lat = baseLat + ampLat * Math.sin(t * speed + phase);
  const lng = baseLng + ampLng * Math.cos(t * speed * 0.85 + phase * 1.7);
  // Cap dérivé analytique → direction lisse, sans bruit d'échantillonnage.
  const dLat = ampLat * speed * Math.cos(t * speed + phase);
  const dLng = -ampLng * speed * 0.85 * Math.sin(t * speed * 0.85 + phase * 1.7);
  const heading = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  return { lat, lng, heading };
}

function driverIcon(d: MapDriver, isAssigned: boolean, isSelected: boolean) {
  const isMoto = d.vehicleType === 'Moto';
  // Badge note (★ 4.8) : hors du glyph, il ne tourne pas avec le cap.
  const badge =
    d.rating != null ? `<span class="map-driver-badge">★ ${d.rating.toFixed(1)}</span>` : '';
  return L.divIcon({
    className: 'map-driver-icon',
    html: `<div class="map-driver-marker${isMoto ? ' moto' : ''}${isAssigned ? ' assigned' : ''}${isSelected ? ' selected' : ''}"><span class="map-driver-glyph">${isMoto ? MOTO_SVG : CAR_SVG}</span>${badge}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

interface DriverMarkerEntry {
  marker: L.Marker;
  baseLat: number;
  baseLng: number;
  phase: number;
  speed: number;
  isDemo: boolean;
  lastIconKey: string;
}

/** Carte de Libreville « la nuit » (Leaflet + tuiles sombres Esri World
 *  Dark Gray, gratuites, sans clé API). Composant client uniquement —
 *  importé avec `next/dynamic` + ssr:false, Leaflet ne tourne jamais
 *  côté serveur. Zoom initial 12 : à 13, le chauffeur d'Akanda (le plus
 *  au nord) sortait du champ et la carte n'affichait que 5 marqueurs. */
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
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayersRef = useRef<L.LayerGroup | null>(null);
  const driverLayerRef = useRef<L.LayerGroup | null>(null);
  const driverMarkersRef = useRef<Map<string, DriverMarkerEntry>>(new Map());
  const radarRef = useRef<{ circle: L.Circle; timer: ReturnType<typeof setInterval> } | null>(null);
  const onDriverClickRef = useRef(onDriverClick);
  onDriverClickRef.current = onDriverClick;

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [LIBREVILLE_CENTER.lat, LIBREVILLE_CENTER.lng],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });
    // Tuiles sombres Esri « World Dark Gray » : gratuites, sans clé —
    // l'identité « Libreville la nuit ». ATTENTION à l'ordre des
    // paramètres ArcGIS : level/row/col = {z}/{y}/{x} (et non {z}/{x}/{y}).
    // Une tuile a été vérifiée par curl (z=13, Libreville : HTTP 200,
    // JPEG 256×256, rues réelles sur fond sombre). Attribution Esri
    // obligatoire (texte exact du service : « Esri, HERE, Garmin,
    // (c) OpenStreetMap contributors, and the GIS user community »).
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution:
        'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    // Couche de référence « World Dark Gray » : noms de lieux et de rues
    // en clair sur le fond sombre (tuiles PNG transparentes, même ordre
    // de paramètres {z}/{y}/{x} que le fond). Vérifiée par curl autour
    // de Libreville (z12–13 : HTTP 200, PNG, contenu non uniforme —
    // libellés en gris clair sur fond transparent). Pas d'attribution
    // séparée : les sources sont les mêmes que le fond, déjà citées.
    // Limite connue : la couche est clairsemée à Libreville (peu de
    // libellés aux zooms 14–16 dans les quartiers) — les noms de rues
    // restent donc rares, la couche ajoute surtout les grands libellés.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
    }).addTo(map);
    L.control.attribution({ position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    routeLayersRef.current = L.layerGroup().addTo(map);
    driverLayerRef.current = L.layerGroup().addTo(map);
    // Libellés de quartiers (v2.5) : permanents, discrets, non
    // interactifs, sous les marqueurs chauffeurs (zIndexOffset négatif).
    // Tier 1 dès le zoom 11, tier 2 seulement à partir du zoom 14 —
    // aux zooms bas, les petits quartiers sont masqués pour ne pas
    // surcharger la carte. 'Autre' n'est pas un lieu : pas de libellé.
    const labelMajor = L.layerGroup().addTo(map);
    const labelMinor = L.layerGroup();
    (Object.keys(NEIGHBORHOOD_COORDS) as Neighborhood[]).forEach((n) => {
      if (n === 'Autre') return;
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
      L.marker([c.lat, c.lng], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: -500,
      }).addTo(NEIGHBORHOOD_LABEL_TIER[n] === 1 ? labelMajor : labelMinor);
    });
    // Points d'intérêt (v2.6) : magasins, marchés, stations, pharmacies,
    // hôtels, santé, lieux publics — pictogramme de catégorie + petit
    // libellé, discrets, non cliquables, sous les marqueurs chauffeurs.
    // (Créée avant updateLabels : la fonction est appelée aussitôt.)
    const poiLayer = L.layerGroup();
    POIS.forEach((poi) => {
      const icon = L.divIcon({
        className: 'map-poi-icon',
        html: `<div class="map-poi-marker"><span class="map-poi-glyph">${POI_SVG[poi.category]}</span><span class="map-poi-label">${poi.name}</span></div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      L.marker([poi.lat, poi.lng], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: -400,
      })
        .bindTooltip(`${poi.name} · ${POI_CATEGORY_LABELS[poi.category]} · près de ${poi.neighborhood}`, {
          direction: 'top',
          offset: [0, -14],
          className: 'map-tooltip',
        })
        .addTo(poiLayer);
    });
    const updateLabels = () => {
      const z = map.getZoom();
      if (z >= 11) labelMajor.addTo(map);
      else map.removeLayer(labelMajor);
      if (z >= 14) labelMinor.addTo(map);
      else map.removeLayer(labelMinor);
      // Points d'intérêt (v2.6) : à partir du zoom 13 seulement, pour
      // ne pas surcharger la vue d'ensemble ; libellés seulement à
      // partir du zoom 15 (à 13-14, pictogrammes seuls : les libellés
      // du Centre-ville se chevauchaient).
      if (z >= 13) poiLayer.addTo(map);
      else map.removeLayer(poiLayer);
      map.getContainer().classList.toggle('map-poi-labels-on', z >= 15);
    };
    map.on('zoomend', updateLabels);
    updateLabels();
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      driverMarkersRef.current.clear();
    };
  }, []);

  // Itinéraire + départ + destination + « Vous êtes ici ».
  useEffect(() => {
    const map = mapRef.current;
    const layers = routeLayersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    // Itinéraire : halo large discret + pointillés animés par-dessus.
    if (pickup && destination) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng],
        ],
        { color: '#FFC700', weight: 9, opacity: 0.18 }
      ).addTo(layers);
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng],
        ],
        {
          color: '#ffd60a',
          weight: 4,
          dashArray: '2 10',
          lineCap: 'round',
          opacity: 0.95,
          className: 'route-animated',
        }
      ).addTo(layers);
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
  }, [pickup, destination, userLocation]);

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
        return;
      }
      const marker = L.marker([d.lat, d.lng], {
        icon: driverIcon(d, isAssigned, isSelected),
      });
      marker.bindTooltip(
        `${d.name} · ${d.vehicleLabel}${d.vehicleType === 'Moto' ? ' · Solo uniquement' : ''}${d.rating ? ` · ★ ${d.rating.toFixed(1)}` : ''}${d.isDemo ? ' · Démo' : ''}`,
        { direction: 'top', offset: [0, -24], className: 'map-tooltip' }
      );
      marker.on('click', () => onDriverClickRef.current?.(d.id));
      marker.addTo(layer);
      // Phase et vitesse pseudo-aléatoires mais stables par chauffeur
      // (dérivées de l'id, pas de l'index : l'ordre du tableau peut
      // changer quand un vrai chauffeur se connecte, sans faire
      // « sauter » les démos d'une orbite à l'autre).
      const hash = [...d.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      entries.set(d.id, {
        marker,
        baseLat: d.lat,
        baseLng: d.lng,
        phase: ((hash % 628) / 100) % (Math.PI * 2),
        speed: 0.05 + ((hash * 37) % 10) / 100,
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

  // Animation des chauffeurs démo : dérive lente + rotation de la voiture
  // selon le cap. requestAnimationFrame uniquement, pas de librairie.
  useEffect(() => {
    let raf = 0;
    let lastTick = 0;
    const step = (now: number) => {
      // ~30 images/s suffisent pour une dérive lente : on saute des frames.
      if (now - lastTick > 66) {
        lastTick = now;
        const t = now / 1000;
        driverMarkersRef.current.forEach((entry) => {
          if (!entry.isDemo) return;
          const { lat, lng, heading } = demoDrift(
            entry.baseLat,
            entry.baseLng,
            t,
            entry.phase,
            entry.speed
          );
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

  return <div ref={containerRef} className={className ?? 'h-full w-full'} aria-label="Carte de Libreville" />;
}
