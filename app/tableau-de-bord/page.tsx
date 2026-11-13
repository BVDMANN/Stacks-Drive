import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { ModeToggle } from '@/components/shared/ModeToggle';
import { DriverDashboard } from '@/components/driver/DriverDashboard';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Tableau de bord chauffeur : en ligne, demandes entrantes, propositions,
 *  course en cours, gains, historique. Le chauffeur ne publie rien. */
export default async function TableauDeBordPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/tableau-de-bord');

  if (sessionUser.profile?.role !== 'chauffeur') {
    return (
      <PageShell title="Tableau de bord chauffeur" subtitle="Reçois des demandes et propose tes prix.">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Cette page est réservée aux chauffeurs. Ton compte actuel est en
            mode passager — bascule en mode Chauffeur (en haut de page) pour
            te mettre en ligne, ou inscris-toi en chauffeur.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ModeToggle currentRole="passager" />
            <Link href="/inscription" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
              Créer un compte chauffeur
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Tableau de bord chauffeur"
      subtitle={`Bonjour ${sessionUser.profile?.full_name ?? ''} — mets-toi en ligne et reçois des demandes.`}
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-white border border-slate-200 text-stacks-navy font-bold rounded-full hover:border-stacks-green/40 transition-colors"
        >
          ← Voir la carte
        </Link>
      }
    >
      <DriverDashboard profile={sessionUser.profile} />
    </PageShell>
  );
}
