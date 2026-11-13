import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { ProfileForm } from '@/components/compte/ProfileForm';
import { VerificationForm } from '@/components/driver/VerificationForm';
import { getSessionUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ComptePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !sessionUser.profile) redirect('/connexion?next=/compte');

  const profile = sessionUser.profile;
  const isDriver = profile.role === 'chauffeur';

  return (
    <PageShell
      title="Mon compte"
      subtitle={`Bonjour ${profile.full_name ?? ''} — tes informations${isDriver ? ' et ton véhicule' : ''}.`}
      user={{ id: sessionUser.id, email: sessionUser.email }}
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-white border border-slate-200 text-stacks-navy font-bold rounded-full hover:border-stacks-green/40 transition-colors"
        >
          ← Retour à la carte
        </Link>
      }
    >
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        <ProfileForm profile={profile} />
      </div>

      {isDriver && (
        <div id="verification" className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm scroll-mt-24">
          <VerificationForm
            verificationStatus={
              (profile.verification_status ?? 'non_verifie') as
                | 'non_verifie'
                | 'en_attente'
                | 'verifie'
                | 'refuse'
            }
            verificationNote={profile.verification_note}
            accountName={profile.full_name}
          />
        </div>
      )}
    </PageShell>
  );
}
