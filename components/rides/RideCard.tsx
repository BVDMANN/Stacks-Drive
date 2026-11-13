import Link from 'next/link';
import { ArrowRight, BadgeCheck, CalendarClock, Car, MapPin, Users, Wallet } from 'lucide-react';
import type { DriverProfile, Ride } from '@/types';
import { formatFcfa } from '@/lib/commission';
import { PAYMENT_LABELS } from '@/lib/neighborhoods';

export function formatDepartureTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  return { date, time };
}

/** Carte d'une course publiée (liste d'accueil). */
export function RideCard({ ride, driver }: { ride: Ride; driver: DriverProfile }) {
  const { date, time } = formatDepartureTime(ride.departureTime);
  const isPast = new Date(ride.departureTime).getTime() < Date.now();
  const almostFull = ride.seatsAvailable <= 1;

  return (
    <article className="ride-card flex flex-col">
      <div className="p-5 sm:p-6 flex flex-col gap-4 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className={`badge-ride ${ride.rideType === 'partagee' ? 'partagee' : 'solo'}`}>
              {ride.rideType === 'partagee' ? 'Partagée' : 'Solo'}
            </span>
            {ride.isDemo && (
              <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                Démo
              </span>
            )}
          </div>
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <CalendarClock size={14} /> {date} · {time}
          </span>
        </div>

        {/* Trajet */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 font-black text-lg text-slate-900 leading-tight">
            <MapPin size={18} className="text-stacks-green shrink-0" />
            <span className="truncate">{ride.departure}</span>
          </div>
          <div className="flex items-center gap-2.5 pl-1">
            <span className="w-[18px] flex flex-col items-center">
              <span className="w-px h-4 bg-slate-300" />
              <ArrowRight size={14} className="text-slate-400 rotate-90" />
            </span>
            <span className="font-black text-lg text-slate-900 leading-tight truncate">
              {ride.destination}
            </span>
          </div>
        </div>

        {/* Chauffeur + véhicule */}
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Car size={16} className="text-slate-400 shrink-0" />
          <span className="truncate">
            {driver.name}
            {driver.vehicleLabel ? ` · ${driver.vehicleLabel}` : ''}
            {driver.vehicleType ? ` (${driver.vehicleType})` : ''}
          </span>
          {driver.isVerified && (
            <span className="inline-flex items-center gap-1 text-xs font-black text-stacks-green shrink-0">
              <BadgeCheck size={14} /> Vérifié
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-bold text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Users size={14} />
            {ride.seatsAvailable > 0
              ? `${ride.seatsAvailable} place${ride.seatsAvailable > 1 ? 's' : ''} restante${ride.seatsAvailable > 1 ? 's' : ''}`
              : 'Complet'}
            {almostFull && ride.seatsAvailable > 0 && (
              <span className="text-amber-700">· presque complet</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wallet size={14} />
            {ride.paymentMethods.map((m) => PAYMENT_LABELS[m]).join(' · ')}
          </span>
        </div>

        {/* Prix + CTA */}
        <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between gap-3">
          <div>
            <p className="text-2xl font-black text-stacks-navy leading-none">
              {formatFcfa(ride.price)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {ride.rideType === 'partagee' ? 'par passager' : 'la course'} · prix fixe
            </p>
          </div>
          {isPast ? (
            <span className="text-sm font-bold text-slate-400">Passée</span>
          ) : ride.seatsAvailable <= 0 ? (
            <span className="text-sm font-bold text-slate-400">Complet</span>
          ) : (
            <Link
              href={`/courses/${ride.id}`}
              className="inline-flex items-center gap-1.5 bg-stacks-green text-white text-sm font-black px-5 py-3 rounded-full shadow-md shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors"
            >
              Réserver <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
