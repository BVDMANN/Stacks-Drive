import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Gift } from 'lucide-react';
import { PageShell } from '@/components/shared/PageShell';
import { ProfileForm } from '@/components/compte/ProfileForm';
import { VerificationForm } from '@/components/driver/VerificationForm';
import { getSessionUser } from '@/lib/supabase/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export const dynamic = 'force-dynamic';

export default async function ComptePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !sessionUser.profile) redirect('/connexion?next=/compte');

  const profile = sessionUser.profile;
  const isDriver = profile.role === 'chauffeur';

  // Fidélité : progression vers la 10e course offerte.
  let completedRides = 0;
  if (!isDriver && isSupabaseConfigured()) {
    const supabase = await createClient();
    const { count } = await supabase
      .from('rides')
      .select('id', { count: 'exact', head: true })
      .eq('passenger_id', sessionUser.id)
      .eq('status', 'terminee');
    completedRides = count ?? 0;
  }
  const ridesUntilFree = 10 - (completedRides % 10);
  const progress = completedRides % 10;

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
      {!isDriver && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
            <Gift size={20} className="text-stacks-amber" /> Fidélité — 10e course offerte
          </h2>
          <p className="text-sm text-slate-500">
            {ridesUntilFree === 1
              ? 'Ta prochaine course est OFFERTE — c’est la 10e !'
              : `Plus que ${ridesUntilFree} course${ridesUntilFree > 1 ? 's' : ''} terminée${ridesUntilFree > 1 ? 's' : ''} avant ta course offerte.`}
          </p>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={10}>
            <div className="h-full bg-stacks-green rounded-full transition-all" style={{ width: `${progress * 10}%` }} />
          </div>
          <p className="text-xs text-slate-400">
            {progress}/10 courses terminées · {completedRides} au total. La course offerte est payée par la plateforme — ton chauffeur touche tout son tarif.
          </p>
        </div>
      )}

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
          />
        </div>
      )}
    </PageShell>
  );
}
