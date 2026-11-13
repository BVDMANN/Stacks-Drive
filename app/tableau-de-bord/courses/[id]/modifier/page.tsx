import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { RideForm } from '@/components/rides/RideForm';
import { getSessionUser } from '@/lib/supabase/server';
import { getRideById } from '@/lib/rides';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export default async function ModifierCoursePage({ params }: Ctx) {
  const { id } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect(`/connexion?next=/tableau-de-bord/courses/${id}/modifier`);

  const found = await getRideById(id, sessionUser.id);
  if (!found || found.row.driver_id !== sessionUser.id) {
    return (
      <PageShell title="Modifier la course" subtitle="Course introuvable ou non autorisée.">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <p className="text-slate-600">
            Cette course n’existe pas, ou tu n’en es pas le chauffeur.
          </p>
          <Link href="/tableau-de-bord" className="inline-block mt-4 text-stacks-green font-bold hover:underline">
            Retour au tableau de bord
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell title="Modifier la course" subtitle={`${found.ride.departure} → ${found.ride.destination}`}>
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        <RideForm ride={found.ride} />
      </div>
    </PageShell>
  );
}
