'use client';

import { DriveNavigation, DrivePin } from '@/components/icons/DriveUi';
import { formatStepDistance, type RoadRoute, type RoutePoint } from '@/lib/routing';
import { googleMapsDirectionsUrl } from '@/lib/use-road-route';

/** Navigation guidée du chauffeur (P0b) : itinéraire routier OSRM
 *  vers le pickup puis vers la destination, instructions virage par
 *  virage en texte, et repli « Ouvrir dans l'app Cartes » (lien
 *  Google Maps gratuit, sans compte — pas de navigation vocale
 *  native, pas de service payant).
 *
 *  La position du chauffeur sur l'itinéraire est visible sur la carte
 *  (marqueur chauffeur + géométrie chauffeur → cible, tracée par
 *  `TrackingMap` via `navRoute`). Ici : le texte du guidage.
 *  Sans étapes OSRM (repli ligne droite), on affiche l'ETA et le
 *  bouton Cartes — jamais d'écran vide. */
export function DriverNavigation({
  route,
  phase,
  from,
  to,
  toLabel,
  loading,
}: {
  /** Itinéraire chauffeur → cible (OSRM ou repli ligne droite). */
  route: RoadRoute | null;
  /** Étape de la course : vers le pickup, puis vers la destination. */
  phase: 'pickup' | 'destination';
  from: RoutePoint | null;
  to: RoutePoint;
  toLabel: string;
  /** Calcul OSRM en cours (v2.48) : distingue le vrai chargement
   *  de l'échec — sans ça, « Calcul de l'itinéraire… » restait
   *  affiché indéfiniment quand la position du chauffeur était
   *  inconnue ou qu'OSRM ne répondait pas. */
  loading?: boolean;
}) {
  const steps = route?.steps ?? [];
  const current = steps[0] ?? null;
  const following = steps.slice(1, 6);
  const mapsUrl = googleMapsDirectionsUrl(to, from);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
            <DriveNavigation size={18} className="text-stacks-green" />
            {phase === 'pickup' ? 'Direction le point de départ' : 'Direction la destination'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {route ? (
              <>
                ~{route.durationMin} min · {route.distanceKm.toFixed(1).replace('.', ',')} km
                {route.source === 'osrm' ? ' par la route' : ' (estimation — itinéraire routier indisponible)'}
                {' → '}
                {toLabel}
              </>
            ) : from === null ? (
              <>
                Ta position est inconnue — active la géolocalisation pour le guidage pas à pas.
                En attendant, le bouton « Ouvrir dans l’app Cartes » trace l’itinéraire vers{' '}
                {toLabel} depuis ta position.
              </>
            ) : loading ? (
              <>Calcul de l’itinéraire vers {toLabel}…</>
            ) : (
              <>
                Itinéraire routier indisponible pour le moment — suis le trait sur la carte, ou
                ouvre l’itinéraire dans l’app Cartes vers {toLabel}.
              </>
            )}
          </p>
        </div>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 bg-stacks-navy text-white text-sm font-black px-4 py-2.5 rounded-full hover:opacity-90"
        >
          <DrivePin size={16} /> Ouvrir dans l’app Cartes
        </a>
      </div>

      {route && steps.length === 0 && (
        <p className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-2xl p-3">
          Itinéraire routier indisponible pour le moment — suis le trait
          sur la carte, ou ouvre l’itinéraire dans l’app Cartes.
        </p>
      )}

      {current && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <p className="text-xs font-black uppercase tracking-widest text-green-700">Maintenant</p>
          <p className="font-black text-green-900 mt-1">
            {current.instruction}
            {current.distanceKm > 0 && (
              <span className="font-bold text-green-700"> — dans {formatStepDistance(current.distanceKm)}</span>
            )}
          </p>
        </div>
      )}

      {following.length > 0 && (
        <ol className="space-y-2">
          {following.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-600">
              <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-black flex items-center justify-center mt-0.5">
                {i + 2}
              </span>
              <span>
                {s.instruction}
                {s.distanceKm > 0 && (
                  <span className="text-slate-400"> — {formatStepDistance(s.distanceKm)}</span>
                )}
              </span>
            </li>
          ))}
          {steps.length > 6 && (
            <li className="text-xs text-slate-400 pl-9">
              + {steps.length - 6} étape{steps.length - 6 > 1 ? 's' : ''} ensuite — ouvre l’app Cartes pour le détail complet.
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
