import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { LiveAdmin } from '@/components/admin/LiveAdmin';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Vue admin en direct (v2.40) : ce qui se passe sur la plateforme
 *  en ce moment — chauffeurs en ligne, courses actives, flux
 *  d'événements, recherche de personnes, traces de courses. */
export default async function AdminLivePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/admin/live');

  if (!sessionUser.profile?.is_admin) {
    return (
      <PageShell title="En direct" subtitle="Ce qui se passe sur la plateforme en ce moment." user={{ id: sessionUser.id, email: sessionUser.email }}>
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Cette page est réservée à l’administrateur de la plateforme.
          </p>
          <Link href="/" className="inline-block text-stacks-green font-bold hover:underline">
            Retour à la carte
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="En direct"
      subtitle="Ce qui se passe sur la plateforme en ce moment."
      user={{ id: sessionUser.id, email: sessionUser.email }}
      actions={
        <Link
          href="/admin"
          className="text-sm font-bold text-slate-500 hover:text-stacks-green"
        >
          ← Administration
        </Link>
      }
    >
      <LiveAdmin />
    </PageShell>
  );
}
