'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { fetchRoadRouteViaApi, type RoadRoute, type RoutePoint } from '@/lib/routing';

/** Fond Plan CARTO dark_all — la même tuile que la carte Drive
 *  (v2.46), clé publique éventuelle comme dans LibrevilleMap.
 *  Sans clé, CARTO sert une tuile filigranée (comportement
 *  existant de la carte principale, jamais une fausse carte). */
const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY ?? '';
const CARTO_DARK_ALL_URL = `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png${CARTO_API_KEY ? `?key=${CARTO_API_KEY}` : ''}`;
const CARTO_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>';

/** Marqueur étiqueté : pastille de couleur + libellé « Départ /
 *  Arrivée · quartier » au-dessus — départ et arrivée ne sont
 *  jamais confondus (zéro ambiguïté). */
function labeledIcon(label: string, sub: string, color: string): L.DivIcon {
  return L.divIcon({
    className: 'hero-map-marker',
    html:
      `<div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:3px">` +
      `<span style="background:#17112E;border:1px solid rgba(255,255,255,0.3);color:#fff;font-size:10px;font-weight:800;line-height:1.2;padding:3px 8px;border-radius:9999px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.55)">${label} · ${sub}</span>` +
      `<span style="width:14px;height:14px;border-radius:9999px;background:${color};border:2.5px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.6)"></span>` +
      `</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** Mini-carte réelle Drive (v2.51) : fond CARTO dark_all, itinéraire
 *  routier OSRM via /api/route quand il est disponible, sinon ligne
 *  droite entre départ et destination — jamais de fausse carte.
 *  Non interactive : ni glisser, ni zoom, ni molette, ni clavier.
 *  La pastille « X km · Y min » est rendue par le parent, en
 *  surcouche (chiffres réels uniquement, voir HeroRideCard). */
export function HeroMiniMap({
  from,
  to,
  fromLabel,
  toLabel,
  className,
}: {
  from: RoutePoint;
  to: RoutePoint;
  fromLabel: string;
  toLabel: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);

  // Itinéraire routier OSRM via /api/route — appel direct (sans le
  // garde-fou « déjà récupéré » du hook partagé, qui jette le
  // résultat quand l'effet est rejoué en dev : la mini-carte ne
  // doit jamais rester sur la ligne droite quand la route existe).
  useEffect(() => {
    let cancelled = false;
    fetchRoadRouteViaApi(from, to).then((r) => {
      if (!cancelled && r) setRoadRoute(r);
    });
    return () => {
      cancelled = true;
    };
    // from/to stables pour une course donnée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      zoomSnap: 0.5,
    });
    L.tileLayer(CARTO_DARK_ALL_URL, {
      attribution: CARTO_ATTRIBUTION,
      maxZoom: 19,
    }).addTo(map);
    map.fitBounds(
      L.latLngBounds([from.lat, from.lng], [to.lat, to.lng]),
      { padding: [36, 36] }
    );
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
    // from/to stables pour une course donnée (la carte héro ne
    // change pas de trajet pendant sa vie).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracé : itinéraire routier OSRM quand il est là, sinon ligne
  // droite — les deux entre les vrais points, jamais inventés.
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();
    const geometry =
      roadRoute && roadRoute.geometry.length >= 2
        ? roadRoute.geometry.map((p) => [p.lat, p.lng] as [number, number])
        : ([[from.lat, from.lng], [to.lat, to.lng]] as [number, number][]);
    L.polyline(geometry, {
      color: '#FF4D8D',
      weight: 4,
      opacity: 0.95,
    }).addTo(layers);
    L.marker([from.lat, from.lng], {
      icon: labeledIcon('Départ', fromLabel, '#2FD6C8'),
      interactive: false,
    }).addTo(layers);
    L.marker([to.lat, to.lng], {
      icon: labeledIcon('Arrivée', toLabel, '#FF4D8D'),
      interactive: false,
    }).addTo(layers);
  }, [roadRoute, from, to, fromLabel, toLabel]);

  return <div ref={containerRef} className={className} aria-label="Mini-carte du trajet" />;
}
