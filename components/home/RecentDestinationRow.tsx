'use client';

import { DriveClock } from '@/components/icons/DriveUi';
import { estimateTripFromCoords } from '@/lib/pricing';
import { useRoadRoute } from '@/lib/use-road-route';
import type { RecentDestination } from '@/lib/rides';

function formatKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Une adresse récente (v2.51, façon Bolt — historique RÉEL).
 *
 *  Icône horloge, nom + quartier, et ETA VRAIE : durée routière
 *  OSRM depuis le point de départ courant (même pattern que
 *  FavoritePlaceRow — `useRoadRoute` + repli à vol d'oiseau si OSRM
 *  ne répond pas ; sans départ connu, pas de chiffre inventé :
 *  l'ETA est masquée). 1 tap = définir comme destination (point
 *  exact + quartier de rattachement, comme un lieu choisi dans la
 *  recherche). Le compteur (×2, ×3…) dit combien de fois cette
 *  destination a déjà été demandée. */
export function RecentDestinationRow({
  destination,
  origin,
  onSelect,
}: {
  destination: RecentDestination;
  /** Point de départ courant (épingle ou GPS) — null = pas encore
   *  connu, l'ETA est alors masquée. */
  origin: { lat: number; lng: number } | null;
  onSelect: (destination: RecentDestination) => void;
}) {
  const point = { lat: destination.lat, lng: destination.lng };
  const { route, loading } = useRoadRoute(origin, point, { enabled: !!origin });
  const fallback = origin ? estimateTripFromCoords(origin, point) : null;
  const durationMin = route?.durationMin ?? fallback?.durationMin ?? null;
  const distanceKm = route?.distanceKm ?? fallback?.distanceKm ?? null;

  return (
    <button
      type="button"
      onClick={() => onSelect(destination)}
      className="w-full flex items-center gap-3 py-2.5 text-left active:bg-white/5 rounded-xl px-1 transition-colors"
      aria-label={`Aller à ${destination.label}`}
    >
      <span className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
        <DriveClock size={16} className="text-slate-300" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-bold text-white truncate">
          {destination.label}
          {destination.count > 1 && (
            <span className="ml-1.5 text-[11px] font-black text-slate-400">×{destination.count}</span>
          )}
        </span>
        <span className="block text-xs text-slate-400 truncate">{destination.neighborhood}</span>
      </span>
      {origin && durationMin !== null && distanceKm !== null ? (
        <span className="shrink-0 text-xs font-black text-sarcelle whitespace-nowrap">
          ~{durationMin} min · {formatKm(distanceKm)}
        </span>
      ) : origin && loading ? (
        <span
          className="price-skeleton inline-block h-2.5 w-14 rounded-full shrink-0"
          role="status"
          aria-label="Calcul du temps de trajet…"
        />
      ) : null}
    </button>
  );
}
