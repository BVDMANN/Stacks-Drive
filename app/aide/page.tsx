import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Faq } from '@/components/shared/Faq';
import { getSessionUser, hasDriverAccount } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Aide / FAQ (v2.24) : les questions courantes sont répondues ici,
 *  en libre-service — elles ne remontent pas à l'administrateur.
 *  Seuls les litiges (depuis la course) et les cas ambigus
 *  (renvoyés vers le litige ou l'administrateur) demandent un humain. */
export default async function AidePage() {
  const sessionUser = await getSessionUser();
  const user = sessionUser
    ? {
        id: sessionUser.id,
        email: sessionUser.email,
        role: sessionUser.profile?.role ?? 'passager',
        isAdmin: sessionUser.profile?.is_admin ?? false,
        canSwitchToDriver: hasDriverAccount(sessionUser.profile),
      }
    : null;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header user={user} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-black tracking-tight text-stacks-navy">Aide — questions courantes</h1>
          <p className="text-slate-500 leading-relaxed">
            Prix, code PIN, paiement, annulation, Solo ou Groupe : la réponse est ici,
            tout de suite. Si ta question n&apos;y est pas, tu seras dirigé vers
            l&apos;ouverture d&apos;un litige ou vers l&apos;administrateur.
          </p>
        </header>
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
