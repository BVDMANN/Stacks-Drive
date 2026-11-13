import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { RideStatusBadge, BookingStatusBadge } from '@/components/shared/StatusBadge';
import { VerifyDriverToggle } from '@/components/admin/VerifyDriverToggle';
import { formatDepartureTime } from '@/components/rides/RideCard';
import { getSessionUser } from '@/lib/supabase/server';
import { getAdminStats } from '@/lib/rides';
import { COMMISSION_RATE, formatFcfa } from '@/lib/commission';

export const dynamic = 'force-dynamic';

/** Tableau de bord administrateur (Randy) : statistiques de la plateforme,
 *  chauffeurs à vérifier, dernières courses et réservations.
 *  Accès réservé aux profils `is_admin` (défini en SQL, voir SETUP.md). */
export default async function AdminPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/admin');

  if (!sessionUser.profile?.is_admin) {
    return (
      <PageShell title="Administration" subtitle="Pilotage de la plateforme Stacks Drive.">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Cette page est réservée à l’administrateur de la plateforme.
          </p>
          <Link href="/" className="inline-block text-stacks-green font-bold hover:underline">
            Retour à l’accueil
          </Link>
        </div>
      </PageShell>
    );
  }

  const stats = await getAdminStats();

  return (
    <PageShell
      title="Administration"
      subtitle="Pilotage de la plateforme Stacks Drive."
    >
      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { value: stats.ridesCount, label: 'Courses publiées' },
          { value: stats.bookingsCount, label: 'Réservations' },
          { value: stats.driversCount, label: 'Chauffeurs inscrits' },
          { value: formatFcfa(stats.totalVolume), label: 'Volume des courses (confirmées)' },
          { value: formatFcfa(stats.totalCommission), label: `Commission Stacks Drive (${Math.round(COMMISSION_RATE * 100)} %)` },
          { value: formatFcfa(stats.totalDriverShare), label: 'Reversé aux chauffeurs' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <p className="text-2xl font-black text-stacks-navy break-words">{s.value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Chauffeurs */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Chauffeurs ({stats.drivers.length})</h2>
        {stats.drivers.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun chauffeur inscrit pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.drivers.map((d) => (
              <li key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">
                    {d.full_name ?? 'Sans nom'} · {d.phone ?? '—'}
                  </p>
                  <p className="text-slate-500">
                    {[d.vehicle_brand, d.vehicle_model, d.vehicle_color].filter(Boolean).join(' ') || 'Véhicule non renseigné'}
                    {d.vehicle_type ? ` · ${d.vehicle_type}` : ''}
                    {d.plate ? ` · ${d.plate}` : ''}
                    {d.is_online ? ' · En ligne' : ' · Hors ligne'}
                  </p>
                </div>
                <VerifyDriverToggle driverId={d.id} isVerified={d.is_verified} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dernières courses */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Dernières courses</h2>
        {stats.recentRides.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune course publiée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.recentRides.map((r) => {
              const { date, time } = formatDepartureTime(r.departure_time);
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/courses/${r.id}`} className="text-sm font-bold text-slate-900 hover:text-stacks-green">
                    {r.departure} → {r.destination} · {date} {time} · {formatFcfa(r.price)}
                  </Link>
                  <RideStatusBadge status={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Dernières réservations */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Dernières réservations</h2>
        {stats.recentBookings.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune réservation pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.recentBookings.map((b) => (
              <li key={b.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-700">
                  <strong className="text-slate-900">{b.profiles?.full_name ?? 'Passager'}</strong>
                  {' '}· {b.rides?.departure} → {b.rides?.destination} · {b.seats} place{b.seats > 1 ? 's' : ''} ·{' '}
                  {formatFcfa(b.total_price)} (frais {formatFcfa(b.platform_fee)})
                </p>
                <BookingStatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
