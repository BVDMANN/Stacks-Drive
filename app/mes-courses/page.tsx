import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Gift } from 'lucide-react';
import { PageShell } from '@/components/shared/PageShell';
import { RideStatusBadge } from '@/components/shared/StatusBadge';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { getMyRideRequests } from '@/lib/rides';
import { formatFcfa } from '@/lib/commission';
import { PAYMENT_LABELS } from '@/lib/neighborhoods';
import { formatDepartureTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** Mes courses : demandes du passager, actives puis historique. */
export default async function MesCoursesPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/mes-courses');

  const rides = await getMyRideRequests(sessionUser.id);

  // Noms des chauffeurs assignés.
  const driverIds = [...new Set(rides.map((r) => r.driverId).filter(Boolean))] as string[];
  const drivers = new Map<string, string>();
  if (driverIds.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', driverIds);
    (data ?? []).forEach((d: { id: string; full_name: string | null }) =>
      drivers.set(d.id, d.full_name ?? 'Chauffeur')
    );
  }

  const active = rides.filter((r) =>
    ['recherche', 'propositions', 'acceptee', 'en_cours'].includes(r.status)
  );
  const past = rides.filter((r) => ['terminee', 'annulee'].includes(r.status));

  return (
    <PageShell
      title="Mes courses"
      subtitle="Tes demandes de course, en cours et passées."
      user={{ id: sessionUser.id, email: sessionUser.email }}
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full shadow-lg shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors"
        >
          Commander une course
        </Link>
      }
    >
      {rides.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-3">
          <p className="text-lg font-black text-slate-900">Aucune course pour le moment</p>
          <p className="text-sm text-slate-500">
            Choisis ton départ et ta destination sur la carte — le prix est fixe
            et affiché avant de commander.
          </p>
          <Link href="/" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
            Commander ma première course
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-black text-lg text-slate-900">En cours ({active.length})</h2>
              {active.map((ride) => {
                const { date, time } = formatDepartureTime(ride.createdAt);
                return (
                  <article key={ride.id} className="bg-white border-2 border-stacks-green/40 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link href={`/courses/${ride.id}`} className="font-black text-slate-900 text-lg hover:text-stacks-green transition-colors">
                          {ride.pickup} → {ride.destination}
                        </Link>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {date} · {time} · {ride.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'} ·{' '}
                          Paiement : {PAYMENT_LABELS[ride.paymentMethod]}
                          {ride.driverId ? ` · Chauffeur : ${drivers.get(ride.driverId) ?? ''}` : ''}
                        </p>
                      </div>
                      <RideStatusBadge status={ride.status} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <p className="text-sm">
                        <span className="font-black text-slate-900">
                          {ride.loyaltyFree
                            ? '0 FCFA — 10e course offerte'
                            : ride.proposedPrice !== null
                              ? formatFcfa(ride.proposedPrice)
                              : `En attente des propositions (estimation : ${formatFcfa(ride.estimatedPrice)})`}
                        </span>
                        {ride.proposedPrice !== null && !ride.loyaltyFree && (
                          <span className="text-slate-500">
                            {' '}· dont {formatFcfa(ride.driverShare)} pour le chauffeur et{' '}
                            {formatFcfa(ride.platformFee)} de frais Stacks Drive
                          </span>
                        )}
                      </p>
                      <Link href={`/courses/${ride.id}`} className="px-4 py-2 rounded-full text-xs font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors">
                        Suivre ma course
                      </Link>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-black text-lg text-slate-900">Historique ({past.length})</h2>
              {past.map((ride) => {
                const { date, time } = formatDepartureTime(ride.createdAt);
                return (
                  <article key={ride.id} className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Link href={`/courses/${ride.id}`} className="font-black text-slate-900 text-lg hover:text-stacks-green transition-colors">
                          {ride.pickup} → {ride.destination}
                        </Link>
                        <p className="text-sm text-slate-500 mt-0.5">
                          {date} · {time} · {ride.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'}
                          {ride.driverId ? ` · Chauffeur : ${drivers.get(ride.driverId) ?? ''}` : ''}
                          {ride.ratingDriver ? ` · Ta note : ${ride.ratingDriver}/5` : ''}
                        </p>
                      </div>
                      <RideStatusBadge status={ride.status} />
                    </div>
                    <p className="text-sm border-t border-slate-100 pt-3">
                      <span className="font-black text-slate-900">
                        {ride.loyaltyFree
                          ? '0 FCFA — 10e course offerte'
                          : ride.proposedPrice !== null
                            ? formatFcfa(ride.proposedPrice)
                            : '—'}
                      </span>
                      {ride.loyaltyFree && (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-stacks-amber ml-2">
                          <Gift size={13} /> Offerte
                        </span>
                      )}
                    </p>
                  </article>
                );
              })}
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
