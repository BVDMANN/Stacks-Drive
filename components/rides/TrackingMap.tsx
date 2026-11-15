'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { MapDriver, MapPoint, RouteGeometryPoint, TrafficMapMarker } from '@/components/map/LibrevilleMap';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { fetchRoadRouteViaApi, type RoadRoute } from '@/lib/routing';
import type { TrafficReport } from '@/lib/traffic';

const LibrevilleMap = dynamic(
  () => import('@/components/map/LibrevilleMap').then((m) => m.LibrevilleMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-night-950 flex items-center justify-center">
        <LogoLoader size={64} label="Chargement de la carte…" />
      </div>
    ),
  }
);

/** Carte de suivi d'une course (itinéraire + chauffeur assigné).
 *  Itinéraire routier OSRM (v2.27) quand il est disponible, sinon
 *  ligne droite ; signalements trafic actifs (v2.27) affichés sur la
 *  carte — le chauffeur comme le passager voient les mêmes marqueurs.
 *
 *  Navigation guidée (P0b) : quand `navRoute` est fourni (côté
 *  chauffeur : chauffeur → pickup, puis chauffeur → destination), la
 *  carte trace CET itinéraire au lieu du trajet passager — c'est lui
 *  que le chauffeur doit suivre, avec sa position dessus. */
export function TrackingMap({
  pickup,
  destination,
  driver,
  navRoute,
}: {
  pickup: MapPoint | null;
  destination: MapPoint | null;
  driver: MapDriver | null;
  navRoute?: RoadRoute | null;
}) {
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const [traffic, setTraffic] = useState<TrafficMapMarker[]>([]);

  // Itinéraire routier du trajet suivi.
  useEffect(() => {
    if (!pickup || !destination) {
      setRoadRoute(null);
      return;
    }
    let cancelled = false;
    fetchRoadRouteViaApi(pickup, destination).then((r) => {
      if (!cancelled) setRoadRoute(r);
    });
    return () => {
      cancelled = true;
    };
  }, [pickup, destination]);

  // Signalements trafic actifs (rafraîchis toutes les 60 s).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/traffic');
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.ok) {
          setTraffic(
            ((data.reports ?? []) as TrafficReport[]).map((r) => ({
              id: r.id,
              type: r.type,
              lat: r.lat,
              lng: r.lng,
              confirmed: r.confirmed,
              expiresAt: r.expiresAt,
            }))
          );
        }
      } catch {
        // Carte sans trafic : on réessaie au prochain tour.
      }
    };
    load();
    const t = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  const routeGeometry: RouteGeometryPoint[] | null =
    navRoute && navRoute.geometry.length >= 2
      ? navRoute.geometry
      : roadRoute && roadRoute.geometry.length >= 2
        ? roadRoute.geometry
        : null;

  return (
    <LibrevilleMap
      className="h-full w-full"
      drivers={driver ? [driver] : []}
      pickup={pickup}
      destination={destination}
      radarActive={false}
      radarCenter={null}
      assignedDriverId={driver?.id ?? null}
      routeGeometry={routeGeometry}
      trafficReports={traffic}
    />
  );
}
