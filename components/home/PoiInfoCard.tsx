'use client';

import { useEffect, useState } from 'react';
import { DriveNavigation, DrivePin, DriveUsers, DriveX } from '@/components/icons/DriveUi';
import { DriveCarMini } from '@/components/icons/DriveCar';
import { POI_CATEGORY_COLORS, POI_CATEGORY_LABELS, type Poi } from '@/lib/pois';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import { haversineKm } from '@/lib/geo';
import { estimateDurationMin, fetchEstimateViaApi, type EstimateApiResponse } from '@/lib/routing';
import { formatFcfa } from '@/lib/commission';

export type PoiOriginKind = 'user' | 'pickup' | 'center';

export interface PoiOrigin {
  lat: number;
  lng: number;
  /** Quartier du point de départ, ou « Centre-ville » par défaut. */
  label: string;
  kind: PoiOriginKind;
}

/** Mini-carte d'info d'un lieu (v2.13) : s'ouvre au clic sur son
 *  icône sur la carte — nom, catégorie, distance depuis toi (ou ton
 *  départ, ou le centre de Libreville), estimation indicative Solo +
 *  Groupe pour y aller, bouton « Y aller ». Estimation indicative
 *  uniquement : jamais un prix fixe, le prix final se négocie entre
 *  le passager et le chauffeur et est figé à l'acceptation.
 *  v2.50 : l'estimation vient du SERVEUR (`POST /api/estimate`,
 *  distance routière OSRM) — le client ne calcule plus de prix.
 *  Repli OSRM indisponible : estimation marquée approximative. */
export function PoiInfoCard({
  poi,
  origin,
  onClose,
  onGoTo,
}: {
  poi: Poi;
  origin: PoiOrigin;
  onClose: () => void;
  onGoTo: (poi: Poi) => void;
}) {
  // Quartier de départ : le libellé de l'origine, ou Centre-ville
  // si ce n'est pas un quartier connu (il détermine le supplément
  // aéroport et l'ancre, comme pour une course).
  const originNeighborhood: Neighborhood =
    origin.label in NEIGHBORHOOD_COORDS ? (origin.label as Neighborhood) : 'Centre-ville';
  const [serverEstimate, setServerEstimate] = useState<EstimateApiResponse | null>(null);
  const [estimating, setEstimating] = useState(false);
  useEffect(() => {
    setEstimating(true);
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      fetchEstimateViaApi(
        {
          fromLat: origin.lat,
          fromLng: origin.lng,
          toLat: poi.lat,
          toLng: poi.lng,
          fromNeighborhood: originNeighborhood,
          toNeighborhood: poi.neighborhood,
        },
        controller.signal
      ).then((res) => {
        if (controller.signal.aborted) return;
        setEstimating(false);
        if (res) setServerEstimate(res);
      });
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poi, origin.lat, origin.lng, origin.label]);

  // Distance affichée : routière quand le serveur a répondu, sinon
  // vol d'oiseau en attendant (affichage seulement — le prix, lui,
  // n'existe que quand le serveur a répondu).
  const straightKm = haversineKm(origin.lat, origin.lng, poi.lat, poi.lng);
  const distanceKm = serverEstimate?.route.distanceKm ?? straightKm;
  const durationMin = serverEstimate?.route.durationMin ?? estimateDurationMin(straightKm);
  const color = POI_CATEGORY_COLORS[poi.category];
  const kmFr = distanceKm.toFixed(1).replace('.', ',');
  const distanceLabel =
    origin.kind === 'user'
      ? `à ${kmFr} km de toi`
      : origin.kind === 'pickup'
        ? `à ${kmFr} km de ton départ (${origin.label})`
        : `à ${kmFr} km du centre de Libreville`;

  return (
    <div
      role="dialog"
      aria-label={`Informations : ${poi.name}`}
      className="absolute top-14 inset-x-3 sm:left-4 sm:right-auto sm:w-[440px] z-30 rise-in"
    >
      <div className="sheet-glass rounded-[28px] shadow-2xl shadow-black/60 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest"
              style={{ color }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
              />
              {POI_CATEGORY_LABELS[poi.category]}
            </p>
            <h2 className="text-lg font-black text-white leading-tight mt-0.5">{poi.name}</h2>
            <p className="text-xs font-bold text-slate-400 flex items-center gap-1 mt-0.5">
              <DrivePin size={12} className="shrink-0" /> près de {poi.neighborhood}
              {/* v2.51 — rue connue (épiceries OSM) : deux lieux au
                  même nom ne se confondent jamais — la rue distingue
                  la fiche, comme dans les résultats de recherche. */}
              {poi.detail ? ` · ${poi.detail}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night-800/90 border border-white/15 text-slate-300 hover:border-sarcelle/60 active:scale-90 transition-all"
            aria-label="Fermer la carte du lieu"
          >
            <DriveX size={16} />
          </button>
        </div>

        <p className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
          <DriveNavigation size={15} className="text-sarcelle shrink-0" />
          {distanceLabel} · ~{durationMin} min de trajet
        </p>

        <div className="space-y-1.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Estimation indicative pour y aller
          </p>
          {estimating && !serverEstimate ? (
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="h-5 w-16 bg-white/10 rounded-full animate-pulse" />
                <div className="h-6 w-20 bg-white/10 rounded-full animate-pulse mt-2" />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="h-5 w-16 bg-white/10 rounded-full animate-pulse" />
                <div className="h-6 w-20 bg-white/10 rounded-full animate-pulse mt-2" />
              </div>
            </div>
          ) : serverEstimate ? (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="flex items-center gap-1.5 font-black text-white text-sm">
                    <DriveUsers size={15} className="text-sarcelle" /> Groupe
                  </p>
                  <p className="font-black text-lg text-white leading-tight mt-1">
                    {formatFcfa(serverEstimate.groupe.price)}
                    <span className="text-xs font-bold text-slate-400"> / passager</span>
                  </p>
                  <p className="text-[11px] font-bold text-slate-400">1 place, prix par passager</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                  <p className="flex items-center gap-1.5 font-black text-white text-sm">
                    <DriveCarMini variant="sedan" size={15} tone="light" /> Solo
                  </p>
                  <p className="font-black text-lg text-white leading-tight mt-1">
                    {formatFcfa(serverEstimate.solo.price)}
                    <span className="text-xs font-bold text-slate-400"> la course</span>
                  </p>
                  <p className="text-[11px] font-bold text-slate-400">véhicule entier</p>
                </div>
              </div>
              {serverEstimate.approximate && (
                <p className="text-[11px] font-bold text-sunset">
                  Estimation approximative — itinéraire routier indisponible pour le moment.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm font-bold text-slate-300">
              Estimation indisponible pour le moment.
            </p>
          )}
          <p className="text-[11px] text-slate-500 leading-snug">
            Ce n’est pas le prix de la course : les chauffeurs proposent leur prix, tu choisis
            — le prix accepté est figé, jamais de surge.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onGoTo(poi)}
          className="w-full bg-rose-500 text-night-900 font-black text-base py-3.5 rounded-full shadow-lg shadow-rose-500/40 hover:bg-rose-300 active:scale-[0.98] transition-all"
        >
          Y aller →
        </button>
      </div>
    </div>
  );
}
