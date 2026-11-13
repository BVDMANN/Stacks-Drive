'use client';

import dynamic from 'next/dynamic';
import type { MapDriver, MapPoint } from '@/components/map/LibrevilleMap';

const LibrevilleMap = dynamic(
  () => import('@/components/map/LibrevilleMap').then((m) => m.LibrevilleMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-200 animate-pulse flex items-center justify-center">
        <p className="text-sm font-bold text-slate-500">Chargement de la carte…</p>
      </div>
    ),
  }
);

/** Carte de suivi d'une course (itinéraire + chauffeur assigné). */
export function TrackingMap({
  pickup,
  destination,
  driver,
}: {
  pickup: MapPoint | null;
  destination: MapPoint | null;
  driver: MapDriver | null;
}) {
  return (
    <LibrevilleMap
      className="h-full w-full"
      drivers={driver ? [driver] : []}
      pickup={pickup}
      destination={destination}
      radarActive={false}
      radarCenter={null}
      assignedDriverId={driver?.id ?? null}
    />
  );
}
