'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LIBREVILLE_CENTER } from '@/lib/neighborhoods';

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

const CAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>`;

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#0B1F3A"/></svg>`;

/** Carte de Libreville (Leaflet + OpenStreetMap, gratuit, sans clé API).
 *  Composant client uniquement — importé avec `next/dynamic` + ssr:false,
 *  Leaflet ne tourne jamais côté serveur. */
export function LibrevilleMap({
  drivers,
  pickup,
  destination,
  radarActive,
  radarCenter,
  selectedDriverId,
  assignedDriverId,
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
  onDriverClick?: (driverId: string) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const radarRef = useRef<{ circle: L.Circle; timer: ReturnType<typeof setInterval> } | null>(null);
  const onDriverClickRef = useRef(onDriverClick);
  onDriverClickRef.current = onDriverClick;

  // Création de la carte (une seule fois).
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [LIBREVILLE_CENTER.lat, LIBREVILLE_CENTER.lng],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.control.attribution({ position: 'topright' }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    layersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Marqueurs + itinéraire + radar (à chaque changement de données).
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;
    layers.clearLayers();

    // Itinéraire (ligne pointillée entre départ et destination).
    if (pickup && destination) {
      L.polyline(
        [
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng],
        ],
        { color: '#0B6E4F', weight: 4, dashArray: '2 8', opacity: 0.9 }
      ).addTo(layers);
    }

    // Chauffeurs (marqueurs voiture).
    drivers.forEach((d) => {
      const isAssigned = assignedDriverId === d.id;
      const isSelected = selectedDriverId === d.id;
      const icon = L.divIcon({
        className: 'map-driver-icon',
        html: `<div class="map-driver-marker${isAssigned ? ' assigned' : ''}${isSelected ? ' selected' : ''}">${CAR_SVG}</div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker([d.lat, d.lng], { icon });
      marker.bindTooltip(
        `${d.name} · ${d.vehicleLabel}${d.rating ? ` · ★ ${d.rating.toFixed(1)}` : ''}${d.isDemo ? ' · Démo' : ''}`,
        { direction: 'top', offset: [0, -24], className: 'map-tooltip' }
      );
      marker.on('click', () => onDriverClickRef.current?.(d.id));
      marker.addTo(layers);
    });

    // Point de départ (pastille verte pulsante).
    if (pickup) {
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

    // Destination (épingle bleu nuit).
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
        L.latLngBounds(
          [pickup.lat, pickup.lng],
          [destination.lat, destination.lng]
        ).pad(0.35),
        { animate: true }
      );
    }
  }, [drivers, pickup, destination, selectedDriverId, assignedDriverId]);

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
      color: '#0B6E4F',
      weight: 2,
      fillColor: '#0B6E4F',
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
