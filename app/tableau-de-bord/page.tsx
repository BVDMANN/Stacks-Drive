import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { RideStatusBadge, BookingStatusBadge } from '@/components/shared/StatusBadge';
import { RideStatusToggle } from '@/components/rides/RideStatusToggle';
import { BookingStatusSelect } from '@/components/rides/BookingActions';
import { getSessionUser } from '@/lib/supabase/server';
import { getBookingsForDriver, getMyRides } from '@/lib/rides';
import { formatFcfa } from '@/lib/commission';
import { formatDepartureTime } from '@/components/rides/RideCard';
import { PAYMENT_LABELS } from '@/lib/neighborhoods';

export const dynamic = 'force-dynamic';

export default async function TableauDeBordPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/tableau-de-bord');

  if (sessionUser.profile?.role !== 'chauffeur') {
    return (
      <PageShell title="Tableau de bord chauffeur" subtitle="Publie des courses et suis tes réservations.">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Cette page est réservée aux chauffeurs. Ton compte actuel est un
            compte passager.
          </p>
          <p className="text-slate-600">
            Pour publier des courses, crée un compte chauffeur (gratuit) ou
            contacte-nous :{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-stacks-green font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>
          </p>
          <Link href="/inscription" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
            Créer un compte chauffeur
          </Link>
        </div>
      </PageShell>
    );
  }

  const [rides, bookings] = await Promise.all([
    getMyRides(sessionUser.id),
    getBookingsForDriver(sessionUser.id),
  ]);

  const publishedCount = rides.filter((r) => r.status === 'published').length;
  const pendingCount = bookings.filter((b) => b.status === 'pending').length;
  const paidBookings = bookings.filter((b) => b.status === 'confirmed' || b.status === 'completed');
  const earnings = paidBookings.reduce((sum, b) => sum + (b.driver_share ?? 0), 0);
  const platformFees = paidBookings.reduce((sum, b) => sum + (b.platform_fee ?? 0), 0);

  const bookingsByRide = new Map<string, typeof bookings>();
  bookings.forEach((b) => {
    const list = bookingsByRide.get(b.ride_id) ?? [];
    list.push(b);
    bookingsByRide.set(b.ride_id, list);
  });

  return (
    <PageShell
      title="Tableau de bord chauffeur"
      subtitle={`Bonjour ${sessionUser.profile?.full_name ?? ''} — voici tes courses et tes réservations.`}
      actions={
        <Link
          href="/tableau-de-bord/publier"
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full shadow-lg shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors"
        >
          + Publier une course
        </Link>
      }
    >
      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { value: rides.length, label: 'Courses créées' },
          { value: publishedCount, label: 'Courses publiées' },
          { value: `${bookings.length} (${pendingCount} en attente)`, label: 'Réservations' },
          { value: formatFcfa(earnings), label: 'Tes gains (confirmées)' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <p className="text-2xl sm:text-3xl font-black text-stacks-navy">{s.value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm text-sm text-slate-600">
        Frais Stacks Drive sur tes courses confirmées :{' '}
        <strong className="text-slate-900">{formatFcfa(platformFees)}</strong>{' '}
        (commission de lancement de 5 %, puis 8 % — plafonnée à 10 %).
      </div>

      {rides.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-3">
          <p className="text-lg font-black text-slate-900">Aucune course publiée pour le moment</p>
          <p className="text-sm text-slate-500">
            Publie ta première course : départ, destination, heure, prix par
            place — et les passagers de Libreville te trouveront.
          </p>
          <Link href="/tableau-de-bord/publier" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
            Publier ma première course
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {rides.map((ride) => {
            const rideBookings = bookingsByRide.get(ride.id) ?? [];
            const { date, time } = formatDepartureTime(ride.departure_time);
            return (
              <article key={ride.id} className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900 text-lg">
                      {ride.departure} → {ride.destination}
                    </p>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {date} · {time} · {formatFcfa(ride.price)} par place ·{' '}
                      {ride.seats_available}/{ride.seats_total} places restantes ·{' '}
                      {ride.ride_type === 'partagee' ? 'Partagée' : 'Solo'} · {ride.vehicle_type}
                    </p>
                  </div>
                  <RideStatusBadge status={ride.status} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/courses/${ride.id}`}
                    className="px-4 py-2 rounded-full text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Voir la course
                  </Link>
                  <Link
                    href={`/tableau-de-bord/courses/${ride.id}/modifier`}
                    className="px-4 py-2 rounded-full text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  >
                    Modifier
                  </Link>
                  <RideStatusToggle rideId={ride.id} currentStatus={ride.status} />
                </div>

                {/* Réservations de cette course */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <p className="text-sm font-black text-slate-900">
                    {rideBookings.length} réservation{rideBookings.length > 1 ? 's' : ''} reçue{rideBookings.length > 1 ? 's' : ''}
                  </p>
                  {rideBookings.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Aucune réservation pour le moment — partage ta course autour de toi.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {rideBookings.map((b) => (
                        <li key={b.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-bold text-slate-900 text-sm">
                              {b.profiles?.full_name ?? 'Passager'} · {b.seats} place{b.seats > 1 ? 's' : ''} ·{' '}
                              {formatFcfa(b.total_price)}
                              <span className="text-slate-500 font-semibold">
                                {' '}({formatFcfa(b.driver_share)} pour toi · {formatFcfa(b.platform_fee)} frais)
                              </span>
                            </p>
                            <BookingStatusBadge status={b.status} />
                          </div>
                          <p className="text-sm text-slate-500">
                            Tél :{' '}
                            <a href={`tel:${(b.profiles?.phone ?? '').replace(/[^+0-9]/g, '')}`} className="text-stacks-green font-bold hover:underline">
                              {b.profiles?.phone ?? '—'}
                            </a>
                            {' '}· Paiement : {PAYMENT_LABELS[b.payment_method]}
                            {b.message ? ` · « ${b.message} »` : ''}
                          </p>
                          <BookingStatusSelect bookingId={b.id} currentStatus={b.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
