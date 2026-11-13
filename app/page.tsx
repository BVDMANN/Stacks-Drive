import { Header } from '@/components/shared/Header';
import { HomeScreen } from '@/components/home/HomeScreen';
import { getSessionUser } from '@/lib/supabase/server';
import { getOnlineDrivers } from '@/lib/rides';
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

  const user = sessionUser
    ? {
        id: sessionUser.id,
        email: sessionUser.email,
        role: sessionUser.profile?.role ?? 'passager',
        isAdmin: sessionUser.profile?.is_admin ?? false,
      }
    : null;

  return (
    <div className="h-dvh flex flex-col bg-night-950 text-slate-100 overflow-hidden">
      <Header user={user} />
      <HomeScreen user={user} realDrivers={realDrivers} demoDrivers={DEMO_DRIVERS} />
    </div>
  );
}
