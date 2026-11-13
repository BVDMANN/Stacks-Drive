import Link from 'next/link';
import { Banknote, Car, ShieldCheck, Users } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Hero } from '@/components/rides/Hero';
import { RideDashboard } from '@/components/rides/RideFilters';
import { getPublishedRides } from '@/lib/rides';
import { getSessionUser } from '@/lib/supabase/server';
import { COMMISSION_RATE } from '@/lib/commission';

// Page d'accueil : courses lues depuis la base (rendu dynamique — les
// courses publiées apparaissent immédiatement, sans nouveau déploiement).
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [{ rides, drivers }, sessionUser] = await Promise.all([
    getPublishedRides(),
    getSessionUser(),
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
    <div id="top" className="relative min-h-screen bg-slate-50 text-slate-900">
      <Header user={user} />
      {!user && <Hero />}

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-12">
        <section id="courses" className="scroll-mt-24 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-3xl font-black text-stacks-navy tracking-tight">
                Courses du jour à Libreville
              </h2>
              <p className="text-slate-500 mt-1">
                Prix fixe affiché avant la course — jamais de surge, même la nuit.
              </p>
            </div>
            {user?.role === 'chauffeur' && (
              <Link
                href="/tableau-de-bord/publier"
                className="inline-flex items-center gap-2 bg-stacks-green text-white text-sm font-black px-5 py-3 rounded-full shadow-md shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors"
              >
                + Publier une course
              </Link>
            )}
          </div>
          <RideDashboard rides={rides} drivers={drivers} />
        </section>

        {/* Comment ça marche */}
        <section id="comment-ca-marche" className="scroll-mt-24 space-y-6">
          <h2 className="text-3xl font-black text-stacks-navy tracking-tight">
            Comment ça marche
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                step: '1',
                title: 'Tu trouves ta course',
                desc: 'Départ, destination, heure, prix par place : tout est affiché avant de réserver. Pas de négociation, pas de surprise.',
              },
              {
                step: '2',
                title: 'Tu réserves ta place',
                desc: 'Une réservation, un chauffeur vérifié, ses coordonnées. Tu paies directement avec lui, en espèces ou Mobile Money.',
              },
              {
                step: '3',
                title: 'Tu montes, c’est tout',
                desc: 'Le prix affiché est le prix payé. Et si vous êtes plusieurs dans la même direction, la course partagée divise le prix.',
              },
            ].map((s) => (
              <div
                key={s.step}
                className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3"
              >
                <span className="inline-flex w-10 h-10 rounded-full bg-stacks-green text-white font-black items-center justify-center">
                  {s.step}
                </span>
                <h3 className="font-black text-lg text-slate-900">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
            <h3 className="font-black text-lg text-slate-900">Tu as une voiture ? Deviens chauffeur</h3>
            <p className="text-sm text-slate-500 leading-relaxed mt-1">
              Inscris-toi en chauffeur, renseigne ton véhicule (type, places,
              plaque) et publie tes courses. Tu gardes{' '}
              {Math.round((1 - COMMISSION_RATE) * 100)} % de chaque course au
              lancement — la commission Stacks Drive est de{' '}
              {Math.round(COMMISSION_RATE * 100)} %, puis 8 % ensuite, plafonnée
              à 10 % pour toujours.
            </p>
            <Link
              href="/inscription"
              className="inline-flex mt-4 items-center gap-2 bg-stacks-green text-white text-sm font-black px-5 py-3 rounded-full shadow-md shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors"
            >
              <Car size={16} /> S’inscrire en chauffeur
            </Link>
          </div>
        </section>

        {/* Pourquoi Stacks Drive */}
        <section id="pourquoi" className="scroll-mt-24 space-y-6">
          <h2 className="text-3xl font-black text-stacks-navy tracking-tight">
            Pourquoi Stacks Drive
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Banknote,
                title: 'Prix fixe, jamais de surge',
                desc: 'Le tarif est annoncé avant la course et ne bouge pas — ni aux heures de pointe, ni la nuit.',
              },
              {
                icon: ShieldCheck,
                title: 'Chauffeurs vérifiés',
                desc: 'Pièces contrôlées avant activation, photo et plaque affichées avant la course, notes des passagers.',
              },
              {
                icon: Users,
                title: 'Courses partagées',
                desc: 'Plusieurs passagers dans la même direction partagent la course : le prix est divisé.',
              },
              {
                icon: Car,
                title: 'Commission basse, pour de bon',
                desc: `5 % au lancement, 8 % ensuite, 10 % maximum garanti. Les concurrents prennent 15 à 30 %.`,
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3"
              >
                <f.icon size={22} className="text-stacks-green" />
                <h3 className="font-black text-slate-900">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <Footer />
      </main>
    </div>
  );
}
