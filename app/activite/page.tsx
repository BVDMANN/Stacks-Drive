import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DriveCarMini } from '@/components/icons/DriveCar';
import { PageShell } from '@/components/shared/PageShell';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { getMyRideRequests } from '@/lib/rides';
import { HeroRideCard } from '@/components/activite/HeroRideCard';
import { ActivityRideCard } from '@/components/activite/ActivityRideCard';

export const dynamic = 'force-dynamic';

/** Activité (v2.51) : la dernière course en carte héro (mini-carte
 *  réelle Drive + « Ajouter une note » + « Réserver »), puis En
 *  cours, Planifiées et Historique — mêmes données et même logique
 *  que /mes-courses (qui redirige ici). La carte héro est la
 *  course la plus récente ; elle n'est pas répétée dans les
 *  sections ci-dessous. */
export default async function ActivitePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/activite');

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

  const hero = rides[0] ?? null;
  const rest = hero ? rides.slice(1) : [];
  const active = rest.filter((r) =>
    ['recherche', 'propositions', 'acceptee', 'en_cours'].includes(r.status)
  );
  // Courses planifiées (v2.30) : pas encore envoyées — annulables
  // avant l'envoi ; expirées : heure passée sans chauffeur,
  // relançables en 1 tap.
  const scheduled = rest.filter((r) => r.status === 'planifiee' || r.status === 'expiree');
  const past = rest.filter((r) => ['terminee', 'annulee'].includes(r.status));

  return (
    <PageShell
      dark
      title="Activité"
      subtitle="Ta dernière course, tes courses en cours, planifiées et passées."
      user={{ id: sessionUser.id, email: sessionUser.email }}
      actions={
        <Link
          href="/"
          className="btn-action !py-3 !px-6 text-sm"
        >
          Commander une course
        </Link>
      }
    >
      {/* Place pour la navigation basse (mobile). */}
      <div className="pb-28 sm:pb-8 space-y-6">
        {rides.length === 0 ? (
          <div className="ride-card p-8 text-center space-y-3">
            <p className="flex justify-center">
              <DriveCarMini variant="sedan" size={40} tone="light" />
            </p>
            <p className="text-lg font-black text-white">Aucune course pour le moment</p>
            <p className="text-sm text-slate-400">
              Choisis ton départ et ta destination sur la carte — le prix est fixe
              et affiché avant de commander.
            </p>
            <Link href="/" className="btn-action inline-flex !py-3 !px-6 text-sm">
              Commander ma première course
            </Link>
          </div>
        ) : (
          <>
            {hero && (
              <HeroRideCard ride={hero} driverName={hero.driverId ? (drivers.get(hero.driverId) ?? null) : null} />
            )}

            {active.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-black text-lg text-white">En cours ({active.length})</h2>
                {active.map((ride) => (
                  <ActivityRideCard
                    key={ride.id}
                    ride={ride}
                    driverName={ride.driverId ? (drivers.get(ride.driverId) ?? null) : null}
                    variant="active"
                  />
                ))}
              </section>
            )}

            {scheduled.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-black text-lg text-white">Planifiées ({scheduled.length})</h2>
                {scheduled.map((ride) => (
                  <ActivityRideCard
                    key={ride.id}
                    ride={ride}
                    driverName={ride.driverId ? (drivers.get(ride.driverId) ?? null) : null}
                    variant="scheduled"
                  />
                ))}
              </section>
            )}

            {past.length > 0 && (
              <section className="space-y-4">
                <h2 className="font-black text-lg text-white">Historique ({past.length})</h2>
                {past.map((ride) => (
                  <ActivityRideCard
                    key={ride.id}
                    ride={ride}
                    driverName={ride.driverId ? (drivers.get(ride.driverId) ?? null) : null}
                    variant="past"
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
