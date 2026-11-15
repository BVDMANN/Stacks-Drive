import Link from 'next/link';
import { DriveGift } from '@/components/icons/DriveUi';
import { DriveCarMini } from '@/components/icons/DriveCar';
import { RideStatusBadge } from '@/components/shared/StatusBadge';
import { formatFcfa } from '@/lib/commission';
import { PAYMENT_LABELS } from '@/lib/neighborhoods';
import { formatDepartureTime } from '@/lib/dates';
import { ScheduledRideActions } from '@/components/rides/ScheduledRideActions';
import { FavoriteButton } from '@/components/rides/FavoriteButton';
import type { Ride } from '@/types';
import { displayPrice } from './ride-format';

/** Carte de course de l'écran Activité (v2.51) : mêmes données et
 *  même logique que /mes-courses, dans le langage v2.52 (verre
 *  nuit à liseré, faisceau, voiture dessinée DriveCarMini).
 *  Départ et arrivée affichés avec leurs quartiers, plus date et
 *  prix — deux courses homonymes se distinguent toujours. */
export function ActivityRideCard({
  ride,
  driverName,
  variant,
}: {
  ride: Ride;
  driverName: string | null;
  variant: 'active' | 'scheduled' | 'past';
}) {
  const { date, time } = formatDepartureTime(
    variant === 'scheduled' && ride.scheduledAt ? ride.scheduledAt : ride.createdAt
  );
  const typeLabel =
    ride.vehiclePreference === 'moto'
      ? 'Moto'
      : ride.rideType === 'groupe'
        ? 'Groupe · 1 place'
        : 'Solo · véhicule entier';

  return (
    // Le padding est DANS la carte : `.ride-card` porte `p-0` en CSS
    // non stratifié, qui écrase les utilitaires `p-5` posés dessus.
    <article className="ride-card">
      <div className="p-5 sm:p-6 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/courses/${ride.id}`}
            className="flex items-center gap-2 min-w-0 font-black text-white text-lg hover:text-sarcelle transition-colors"
          >
            <DriveCarMini variant="sedan" size={18} tone="light" className="shrink-0" />
            <span className="min-w-0 truncate">
              {ride.pickup} → {ride.destination}
            </span>
          </Link>
          <p className="text-sm text-slate-400 mt-0.5">
            {variant === 'scheduled' && ride.status === 'planifiee' && ride.scheduledAt
              ? `Prévue ${date} à ${time} · envoi aux chauffeurs ~15 min avant`
              : variant === 'scheduled'
                ? 'Heure prévue passée sans chauffeur disponible'
                : `${date} · ${time}`}
            {' · '}
            {typeLabel}
            {ride.comfort ? ' · Confort' : ''}
            {' · '}Paiement : {PAYMENT_LABELS[ride.paymentMethod]}
            {driverName ? ` · Chauffeur : ${driverName}` : ''}
            {ride.ratingDriver ? ` · Ta note : ${ride.ratingDriver}/5` : ''}
            {ride.status === 'terminee' && (
              <>
                {ride.distanceKm !== null ? ` · ~${Math.max(1, Math.round(ride.distanceKm))} km` : ''}
                {ride.durationMin !== null ? ` · ~${ride.durationMin} min` : ''}
                {!ride.loyaltyFree && ride.proposedPrice !== null
                  ? ` · commission ${formatFcfa(ride.platformFee)}`
                  : ''}
              </>
            )}
            {ride.status === 'annulee' && ride.cancelReason
              ? ` · Annulée — ${ride.cancelReason}`
              : ''}
          </p>
        </div>
        <RideStatusBadge status={ride.status} />
      </div>

      {variant === 'scheduled' ? (
        <div className="border-t border-white/10 pt-3">
          <p className="text-sm text-slate-400 mb-3">
            Estimation {formatFcfa(ride.estimatedPrice)}
          </p>
          <ScheduledRideActions rideId={ride.id} status={ride.status as 'planifiee' | 'expiree'} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
          <p className="text-sm">
            {variant === 'active' && ride.proposedPrice === null && !ride.loyaltyFree ? (
              <span className="text-slate-400">
                En attente des propositions (estimation : {formatFcfa(ride.estimatedPrice)})
              </span>
            ) : (
              <>
                <span className="font-black text-white">{displayPrice(ride)}</span>
                {ride.loyaltyFree && (
                  <span className="inline-flex items-center gap-1 text-xs font-black text-rose-300 ml-2">
                    <DriveGift size={13} /> Offerte
                  </span>
                )}
                {variant === 'active' &&
                  ride.proposedPrice !== null &&
                  !ride.loyaltyFree && (
                    <span className="text-slate-400">
                      {' '}
                      · dont {formatFcfa(ride.driverShare)} pour le chauffeur et{' '}
                      {formatFcfa(ride.platformFee)} de frais Stacks Drive
                    </span>
                  )}
              </>
            )}
          </p>
          <span className="flex flex-wrap items-center gap-2">
            {variant === 'active' && (
              <Link
                href={`/courses/${ride.id}`}
                className="px-4 py-2 rounded-full text-xs font-black bg-sarcelle text-night-900 hover:bg-emerald-300 transition-colors"
              >
                Suivre ma course
              </Link>
            )}
            {variant === 'past' && ride.status === 'terminee' && (
              <>
                <Link
                  href={`/courses/${ride.id}?print=1`}
                  className="px-4 py-2 rounded-full text-xs font-black bg-white/10 border border-white/15 text-slate-100 hover:border-sarcelle/50 transition-colors"
                >
                  Imprimer / Exporter le reçu
                </Link>
                {ride.driverId && (
                  <FavoriteButton driverId={ride.driverId} driverName={driverName} />
                )}
              </>
            )}
          </span>
        </div>
      )}
      </div>
    </article>
  );
}
