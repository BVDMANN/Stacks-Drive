import { DriveChevronLeft } from '@/components/icons/DriveUi';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { ModeToggle } from '@/components/shared/ModeToggle';
import { DriverDashboard } from '@/components/driver/DriverDashboard';
import { TutoReplayButton } from '@/components/tuto/TutoReplayButton';
import { getSessionUser, hasDriverAccount } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Tableau de bord chauffeur : en ligne, demandes entrantes, propositions,
 *  course en cours, gains, historique. Le chauffeur ne publie rien. */
export default async function TableauDeBordPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/tableau-de-bord');

  // v2.45 — compte admin = admin uniquement : l'admin ne voit ni
  // le tableau de bord chauffeur, ni la bascule, ni le lien
  // « Devenir chauffeur » — il voit l'admin.
  if (sessionUser.profile?.is_admin === true) {
    return (
      <PageShell title="Tableau de bord chauffeur" subtitle="Reçois des demandes et propose tes prix." user={{ id: sessionUser.id, email: sessionUser.email }}>
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Ce compte est le compte administrateur : il ne peut pas être
            chauffeur. Pour conduire, crée un compte chauffeur séparé,
            avec une autre adresse e-mail.
          </p>
          <Link href="/admin" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
            Voir l’administration
          </Link>
        </div>
      </PageShell>
    );
  }

  if (sessionUser.profile?.role !== 'chauffeur') {
    return (
      <PageShell title="Tableau de bord chauffeur" subtitle="Reçois des demandes et propose tes prix." user={{ id: sessionUser.id, email: sessionUser.email }}>
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Cette page est réservée aux chauffeurs. Ton compte actuel est en
            mode passager — et passer en mode Chauffeur demande un compte
            chauffeur : crée-le, puis fais-le vérifier (selfie + pièce
            d’identité), et la bascule s’ouvrira.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ModeToggle currentRole="passager" canSwitchToDriver={hasDriverAccount(sessionUser.profile)} />
            <Link href="/devenir-chauffeur" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
              Devenir chauffeur
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
      user={{ id: sessionUser.id, email: sessionUser.email }}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {/* Formation chauffeur (v2.21) : rejouable depuis le tableau de bord. */}
          <TutoReplayButton kind="chauffeur" label="Revoir la formation" />
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-white border border-slate-200 text-stacks-navy font-bold rounded-full hover:border-stacks-green/40 transition-colors"
          >
            <DriveChevronLeft size={16} /> Voir la carte
          </Link>
        </div>
      }
    >
      <DriverDashboard profile={sessionUser.profile} />
    </PageShell>
  );
}
