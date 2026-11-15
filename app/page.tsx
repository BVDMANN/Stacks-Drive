import { redirect } from 'next/navigation';
import { Header } from '@/components/shared/Header';
import { HomeScreen } from '@/components/home/HomeScreen';
import { getSessionUser, hasDriverAccount } from '@/lib/supabase/server';
import { getMyRideRequests, getOnlineDrivers, recentDestinationsFromRides } from '@/lib/rides';
import { toAnonymousMapDriver } from '@/lib/db-types';
import { DEMO_DRIVERS } from '@/lib/demo-drivers';

// Page d'accueil map-first : carte plein écran + feuille de demande.
// Les chauffeurs réels en ligne viennent de la base ; les 6 chauffeurs
// démo (statiques) font vivre la carte tant qu'aucun vrai chauffeur
// n'est en ligne.
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [sessionUser, realDrivers] = await Promise.all([
    getSessionUser(),
    getOnlineDrivers(),
  ]);

  // v2.45 — compte admin = admin uniquement : l'admin ne voit pas
  // le flux passager (carte + feuille de demande) — il voit l'admin.
  if (sessionUser?.profile?.is_admin === true) redirect('/admin');

  const user = sessionUser
    ? {
        id: sessionUser.id,
        email: sessionUser.email,
        role: sessionUser.profile?.role ?? 'passager',
        isAdmin: sessionUser.profile?.is_admin ?? false,
        canSwitchToDriver: hasDriverAccount(sessionUser.profile),
      }
    : null;

  // v2.51 — accueil réorganisé (façon Bolt) : nombre RÉEL de courses
  // planifiées (statuts `planifiee` / `expiree`, v2.30) et adresses
  // récentes (historique réel, `lib/rides.ts`). Déconnecté : pas de
  // chiffre inventé — le compteur reste null et la section est
  // masquée (le composant ne montre rien sans données).
  let scheduledCount: number | null = null;
  let recentDestinations: Awaited<ReturnType<typeof recentDestinationsFromRides>> = [];
  if (sessionUser) {
    const myRides = await getMyRideRequests(sessionUser.id);
    scheduledCount = myRides.filter(
      (r) => r.status === 'planifiee' || r.status === 'expiree'
    ).length;
    recentDestinations = recentDestinationsFromRides(myRides, 5);
  }

  return (
    <div className="h-dvh flex flex-col bg-night-950 text-slate-100 overflow-hidden">
      <Header user={user} />
      <HomeScreen
        user={user}
        profile={sessionUser?.profile ?? null}
        scheduledCount={scheduledCount}
        recentDestinations={recentDestinations}
        // v2.20 : la carte passager ne reçoit que des marqueurs
        // anonymes (position + type de véhicule) — l'identité des
        // chauffeurs n'est jamais sérialisée avant une proposition.
        realDrivers={realDrivers.map(toAnonymousMapDriver)}
        demoDrivers={DEMO_DRIVERS.map(toAnonymousMapDriver)}
      />
    </div>
  );
}
