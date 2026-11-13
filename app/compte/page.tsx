import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { ProfileForm } from '@/components/compte/ProfileForm';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ComptePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !sessionUser.profile) redirect('/connexion?next=/compte');

  const profile = sessionUser.profile;

  return (
    <PageShell
      title="Mon compte"
      subtitle={`Bonjour ${profile.full_name ?? ''} — tes informations et ton véhicule.`}
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-white border border-slate-200 text-stacks-navy font-bold rounded-full hover:border-stacks-green/40 transition-colors"
        >
          ← Toutes les courses
        </Link>
      }
    >
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        <ProfileForm profile={profile} />
      </div>
    </PageShell>
  );
}
