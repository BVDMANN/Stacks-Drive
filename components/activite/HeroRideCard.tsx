'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { DriveStar } from '@/components/icons/DriveUi';
import { DriveCarMini } from '@/components/icons/DriveCar';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { RideStatusBadge } from '@/components/shared/StatusBadge';
import { formatDepartureTime } from '@/lib/dates';
import { PAYMENT_LABELS } from '@/lib/neighborhoods';
import { fetchEstimateViaApi } from '@/lib/routing';
import type { Ride } from '@/types';
import { RebookButton } from './RebookButton';
import { heroPriceLabel, rideAddress, ridePoint } from './ride-format';

/** Mini-carte Leaflet : chargée côté client uniquement (Leaflet
 *  touche `window` à l'import, comme LibrevilleMap). */
const HeroMiniMap = dynamic(() => import('./HeroMiniMap').then((m) => m.HeroMiniMap), {
  ssr: false,
  loading: () => (
    <div className="h-44 sm:h-52 w-full bg-night-950 flex items-center justify-center">
      <LogoLoader size={48} label="Chargement de la carte…" />
    </div>
  ),
});

/** Carte héro de la dernière course (v2.51) : mini-carte réelle
 *  Drive en haut, adresse de destination, prix réel, date, et les
 *  deux actions — « Ajouter une note » (vers la section d'avis de
 *  la course, ancre #avis) et « Réserver » (vraie nouvelle
 *  demande). Courses annulées : 0 FCFA, statut « Annulée ». */
export function HeroRideCard({
  ride,
  driverName,
}: {
  ride: Ride;
  driverName: string | null;
}) {
  const { date, time } = formatDepartureTime(ride.createdAt);
  const from = ridePoint(ride, 'pickup');
  const to = ridePoint(ride, 'destination');
  const [estimate, setEstimate] = useState<{ distanceKm: number; durationMin: number } | null>(
    null
  );

  // Pastille « X km · Y min » : distance et durée routières de la
  // course quand elles existent (v2.50, figées à la demande),
  // sinon estimées via l'API d'estimation (serveur) — jamais
  // inventées. Sans les deux, pas de pastille.
  useEffect(() => {
    if (ride.distanceKm !== null && ride.durationMin !== null) return;
    if (!from || !to) return;
    let cancelled = false;
    fetchEstimateViaApi({
      fromLat: from.lat,
      fromLng: from.lng,
      toLat: to.lat,
      toLng: to.lng,
      fromNeighborhood: ride.pickup,
      toNeighborhood: ride.destination,
      vehiclePreference: ride.vehiclePreference,
    }).then((res) => {
      if (!cancelled && res) {
        setEstimate({
          distanceKm: res.route.distanceKm,
          durationMin: res.route.durationMin,
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride.id]);

  const distanceKm = ride.distanceKm ?? estimate?.distanceKm ?? null;
  const durationMin = ride.durationMin ?? estimate?.durationMin ?? null;
  // « ≈ » quand le chiffre vient de l'estimation, pas de la course.
  const approximate = ride.distanceKm === null || ride.durationMin === null;

  const typeLabel =
    ride.vehiclePreference === 'moto'
      ? 'Moto'
      : ride.rideType === 'groupe'
        ? 'Groupe · 1 place'
        : 'Solo · véhicule entier';

  return (
    <article className="ride-card">
      {/* Mini-carte réelle du trajet. */}
      {from && to ? (
        <div className="relative h-44 sm:h-52 w-full overflow-hidden">
          <HeroMiniMap
            from={from}
            to={to}
            fromLabel={ride.pickup}
            toLabel={ride.destination}
            className="h-full w-full"
          />
          {distanceKm !== null && durationMin !== null && (
            <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/15 text-white text-xs font-black px-3 py-2 rounded-full shadow-xl shadow-black/40">
              {approximate ? '≈ ' : ''}
              {Math.max(1, Math.round(distanceKm))} km · {durationMin} min
            </span>
          )}
        </div>
      ) : (
        <div className="h-44 sm:h-52 w-full bg-night-950 flex items-center justify-center">
          <DriveCarMini variant="sedan" size={48} tone="light" />
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Dernière course · Destination
            </p>
            <Link
              href={`/courses/${ride.id}`}
              className="font-black text-white text-lg leading-snug hover:text-sarcelle transition-colors"
            >
              {rideAddress(ride, 'destination')}
            </Link>
            <p className="text-sm text-slate-400 mt-1">
              Départ : {rideAddress(ride, 'pickup')}
            </p>
            <p className="text-sm text-slate-400 mt-0.5">
              {date} · {time} · {typeLabel}
              {ride.comfort ? ' · Confort' : ''}
              {driverName ? ` · Chauffeur : ${driverName}` : ''}
              {ride.ratingDriver ? ` · Ta note : ${ride.ratingDriver}/5` : ''}
              {ride.status === 'annulee' && ride.cancelReason
                ? ` · Annulée — ${ride.cancelReason}`
                : ''}
            </p>
          </div>
          <div className="text-right shrink-0 space-y-2">
            <p className="font-black text-rose-300 text-xl">{heroPriceLabel(ride)}</p>
            <RideStatusBadge status={ride.status} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          {ride.status === 'terminee' ? (
            <>
              <Link
                href={`/courses/${ride.id}#avis`}
                className="btn-outline !py-3 !px-6 text-sm"
              >
                <DriveStar size={16} className="text-rose-300" /> Ajouter une note
              </Link>
              <RebookButton ride={ride} />
            </>
          ) : ride.status === 'annulee' ? (
            <RebookButton ride={ride} />
          ) : (
            <Link href={`/courses/${ride.id}`} className="btn-action !py-3 !px-6 text-sm">
              Suivre ma course
            </Link>
          )}
          <span className="text-xs text-slate-400">
            Paiement : {PAYMENT_LABELS[ride.paymentMethod]}
          </span>
        </div>
      </div>
    </article>
  );
}
