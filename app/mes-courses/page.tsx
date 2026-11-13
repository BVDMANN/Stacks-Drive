import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { BookingStatusBadge } from '@/components/shared/StatusBadge';
import { CancelBookingButton } from '@/components/rides/BookingActions';
import { formatDepartureTime } from '@/components/rides/RideCard';
import { getSessionUser } from '@/lib/supabase/server';
import { getMyBookings } from '@/lib/rides';
import { formatFcfa } from '@/lib/commission';
import { PAYMENT_LABELS } from '@/lib/neighborhoods';

export const dynamic = 'force-dynamic';

export default async function MesCoursesPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/mes-courses');

  const bookings = await getMyBookings(sessionUser.id);

  return (
    <PageShell
      title="Mes courses"
      subtitle="Tes réservations, passées et à venir."
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full shadow-lg shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors"
        >
          Trouver une course
        </Link>
      }
    >
      {bookings.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-3">
          <p className="text-lg font-black text-slate-900">Aucune course réservée pour le moment</p>
          <p className="text-sm text-slate-500">
            Parcours les courses du jour à Libreville et réserve ta place — le
            prix est fixe et affiché avant de monter.
          </p>
          <Link href="/" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
            Voir les courses
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {bookings.map((b) => {
            const ride = b.rides;
            if (!ride) return null;
            const { date, time } = formatDepartureTime(ride.departure_time);
            return (
              <article key={b.id} className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/courses/${ride.id}`} className="font-black text-slate-900 text-lg hover:text-stacks-green transition-colors">
                      {ride.departure} → {ride.destination}
                    </Link>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {date} · {time} · {ride.ride_type === 'partagee' ? 'Partagée' : 'Solo'} · {ride.vehicle_type}
                      {ride.vehicle_label ? ` · ${ride.vehicle_label}` : ''}
                    </p>
                    <p className="text-sm text-slate-500">
                      Chauffeur : {ride.driver_name} · Paiement : {PAYMENT_LABELS[b.payment_method]}
                    </p>
                    {b.message && (
                      <p className="text-sm text-slate-500 mt-1">« {b.message} »</p>
                    )}
                  </div>
                  <BookingStatusBadge status={b.status} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <div className="text-sm">
                    <span className="font-black text-slate-900">{formatFcfa(b.total_price)}</span>
                    <span className="text-slate-500">
                      {' '}· {b.seats} place{b.seats > 1 ? 's' : ''} · dont{' '}
                      {formatFcfa(b.driver_share)} pour le chauffeur et{' '}
                      {formatFcfa(b.platform_fee)} de frais Stacks Drive
                    </span>
                  </div>
                  <CancelBookingButton bookingId={b.id} currentStatus={b.status} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
