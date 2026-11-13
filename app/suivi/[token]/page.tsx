import Link from 'next/link';
import { BadgeCheck, Car, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import { getRideByShareToken } from '@/lib/rides';
import { formatFcfa } from '@/lib/commission';
import { formatDepartureTime, timeAgo } from '@/lib/dates';
import { TrackingMap } from '@/components/rides/TrackingMap';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import { RideStatusBadge } from '@/components/shared/StatusBadge';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

/** Suivi public d'une course (lien partagé par le passager) : trajet,
 *  chauffeur, plaque et statut en direct — sans compte. */
export default async function SuiviPage({ params }: Ctx) {
  const { token } = await params;
  const found = await getRideByShareToken(token);

  if (!found) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12 text-center">
        <p className="text-lg font-black text-slate-900">Course introuvable</p>
        <p className="text-sm text-slate-500 mt-1">
          Ce lien de suivi n’existe plus ou a expiré.
        </p>
        <Link href="/" className="mt-4 text-stacks-green font-bold hover:underline">
          Aller sur Stacks Drive
        </Link>
      </div>
    );
  }

  const { ride, driver } = found;
  const { date, time } = formatDepartureTime(ride.createdAt);
  const pickupCoords = NEIGHBORHOOD_COORDS[ride.pickup as Neighborhood];
  const destCoords = NEIGHBORHOOD_COORDS[ride.destination as Neighborhood];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="glass-dark sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-stacks-green flex items-center justify-center text-white shadow-md">
            <Car size={20} />
          </span>
          <span className="leading-none">
            <span className="block text-base font-black text-stacks-navy tracking-tight">Stacks Drive</span>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-stacks-green">Suivi en direct</span>
          </span>
          <Link
            href={`/suivi/${token}`}
            className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-stacks-green"
          >
            <RefreshCw size={15} /> Actualiser
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stacks-navy tracking-tight">
              {ride.pickup} → {ride.destination}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Course partagée par un proche · demandée {date} · {time} ({timeAgo(ride.createdAt)})
            </p>
          </div>
          <RideStatusBadge status={ride.status} />
        </div>

        <div className="h-[380px] sm:h-[440px] rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
          <TrackingMap
            pickup={pickupCoords ? { ...pickupCoords, label: ride.pickup } : null}
            destination={destCoords ? { ...destCoords, label: ride.destination } : null}
            driver={
              driver && driver.lat !== null && driver.lng !== null
                ? {
                    id: driver.id,
                    name: driver.name,
                    lat: driver.lat,
                    lng: driver.lng,
                    vehicleLabel: driver.vehicleLabel,
                    vehicleType: driver.vehicleType ?? '',
                    rating: driver.rating,
                    isDemo: driver.isDemo,
                  }
                : null
            }
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
            <h2 className="font-black text-lg text-slate-900">Le chauffeur</h2>
            {driver ? (
              <>
                <p className="font-black text-slate-900 text-lg flex flex-wrap items-center gap-1.5">
                  {driver.name}
                  {driver.isVerified && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-black text-stacks-green">
                      <BadgeCheck size={14} /> Vérifié
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate-500 flex items-center gap-2">
                  <Car size={16} className="text-slate-400" /> {driver.vehicleLabel}
                </p>
                <p className="text-sm">
                  Plaque :{' '}
                  <strong className="font-black text-stacks-navy tracking-widest bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                    {driver.plate ?? '—'}
                  </strong>
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Aucun chauffeur assigné pour le moment — la course est encore en recherche.
              </p>
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
            <h2 className="font-black text-lg text-slate-900">La course</h2>
            <p className="text-sm text-slate-600 flex items-center gap-2">
              <MapPin size={16} className="text-stacks-green" />
              {ride.pickup} → {ride.destination}
            </p>
            <p className="text-sm text-slate-600">
              {ride.rideType === 'groupe' ? `Groupe · ${ride.seats} passager${ride.seats > 1 ? 's' : ''}` : 'Solo · course privée'}
              {ride.firstStop ? ` · 1er arrêt : ${ride.firstStop}` : ''}
            </p>
            <p className="text-sm text-slate-600">
              Prix : <strong className="text-slate-900">{formatFcfa(ride.proposedPrice ?? ride.estimatedPrice)}</strong> · prix fixe
            </p>
            <p className="text-xs text-slate-400 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-stacks-green" />
              Suivi partagé par le passager — actualise la page pour voir l’avancée.
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center">
          Stacks Drive — Libreville · Prix fixe, jamais de surge ·{' '}
          <Link href="/" className="underline hover:text-stacks-green">Commander une course</Link>
        </p>
      </main>
    </div>
  );
}
