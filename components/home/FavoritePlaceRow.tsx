'use client';

import { DriveBriefcase, DriveHome } from '@/components/icons/DriveUi';

import { NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import { estimateTripFromCoords } from '@/lib/pricing';
import { useRoadRoute } from '@/lib/use-road-route';

/** Lieu enregistré du passager (v2.30 : Maison / Travail — quartier
 *  + précision libre, modifiables dans « Mon compte »). */
export interface FavoritePlace {
  key: 'home' | 'work';
  label: string;
  icon: string;
  neighborhood: Neighborhood;
  detail: string | null;
}

function formatKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Un lieu enregistré, avec son temps de trajet estimé (v2.48).
 *
 *  L'ETA est VRAI : durée routière OSRM depuis le point de départ
 *  courant (le trajet est calculé, pas affiché au hasard) — avec
 *  repli sur la durée estimée à vol d'oiseau si OSRM ne répond pas
 *  (même formule que l'estimation du trajet). Sans point de départ
 *  connu, pas de chiffre inventé : l'ETA est masquée.
 *
 *  L'ETA se met à jour quand le départ change (le hook refait
 *  l'appel OSRM — cache partagé 5 min, déduplication) : déplacer
 *  l'épingle du départ met à jour les temps de tes lieux.
 *
 *  1 tap = définir le lieu comme départ ou comme destination (le
 *  point de départ/destination devient le centre du quartier du
 *  lieu — le lieu n'a pas de coordonnées plus précises). */
export function FavoritePlaceRow({
  place,
  origin,
  onSetPickup,
  onSetDestination,
}: {
  place: FavoritePlace;
  /** Point de départ courant (épingle ou GPS) — null = pas encore
   *  connu, l'ETA est alors masquée. */
  origin: { lat: number; lng: number } | null;
  onSetPickup: (neighborhood: Neighborhood) => void;
  onSetDestination: (neighborhood: Neighborhood) => void;
}) {
  const point = NEIGHBORHOOD_COORDS[place.neighborhood];
  const { route, loading } = useRoadRoute(origin, point, { enabled: !!origin });
  const fallback = origin ? estimateTripFromCoords(origin, point) : null;
  const durationMin = route?.durationMin ?? fallback?.durationMin ?? null;
  const distanceKm = route?.distanceKm ?? fallback?.distanceKm ?? null;

  return (
    <span
      className="inline-flex items-center gap-1 bg-white/5 border border-white/10 rounded-full pl-3 pr-1 py-1 text-xs font-bold text-white"
      title={`${place.label} : ${place.neighborhood}${place.detail ? ` — ${place.detail}` : ''}`}
    >
      {place.key === 'home' ? <DriveHome size={14} className="shrink-0" /> : <DriveBriefcase size={14} className="shrink-0" />} {place.label} · {place.neighborhood}
      {/* ETA réelle (OSRM) — squelette élégant pendant le calcul,
          jamais un spinner brut ni un chiffre inventé. */}
      {origin && durationMin !== null && distanceKm !== null ? (
        <span className="text-sarcelle font-black whitespace-nowrap">
          ~{durationMin} min · {formatKm(distanceKm)}
        </span>
      ) : origin && loading ? (
        <span
          className="price-skeleton inline-block h-2.5 w-14 rounded-full"
          role="status"
          aria-label="Calcul du temps de trajet…"
        />
      ) : null}
      <button
        type="button"
        onClick={() => onSetPickup(place.neighborhood)}
        className="ml-1 px-2 py-1 rounded-full bg-sarcelle/20 text-sarcelle hover:bg-sarcelle/30 active:scale-95 transition-all"
      >
        Départ
      </button>
      <button
        type="button"
        onClick={() => onSetDestination(place.neighborhood)}
        className="px-2 py-1 rounded-full bg-corail/20 text-corail hover:bg-corail/30 active:scale-95 transition-all"
      >
        Destination
      </button>
    </span>
  );
}
