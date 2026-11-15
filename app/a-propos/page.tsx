import Link from 'next/link';
import { DriveCheckBadge, DrivePin, DriveShield, DriveUsers } from '@/components/icons/DriveUi';
import { DriveCarMini } from '@/components/icons/DriveCar';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';

export const dynamic = 'force-dynamic';

/** À propos : comment ça marche CÔTÉ PASSAGER, sécurité, prix garanti —
 *  les infos qui ne sont PAS sur l'accueil (carte + réservation).
 *  Le côté chauffeur vit sur sa propre page : /devenir-chauffeur —
 *  les deux côtés ne sont jamais mélangés dans une même page. */
export default function AProposPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header user={null} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">
        <header className="space-y-3">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-stacks-green bg-green-50 border border-green-200 rounded-full px-4 py-2">
            <DriveCarMini variant="sedan" size={14} tone="dark" /> Libreville — la solution du peuple
          </p>
          <h1 className="text-4xl font-black tracking-tight text-stacks-navy">
            Comment marche Stacks Drive ?
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed max-w-2xl">
            Pas de négociation au bord de la route, pas de prix qui double la nuit :
            tu demandes ta course, les chauffeurs vérifiés autour de toi proposent
            leur prix, tu choisis — et tu montes.
          </p>
        </header>

        {/* Passager */}
        <section className="space-y-5">
          <h2 className="text-2xl font-black text-stacks-navy">Côté passager</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                step: '1',
                title: 'Tu demandes ta course',
                desc: 'Départ, destination, Solo ou Groupe : une estimation indicative s’affiche avant de commander — le prix final se décide avec ton chauffeur.',
              },
              {
                step: '2',
                title: 'Les chauffeurs proposent',
                desc: 'Les chauffeurs en ligne autour de toi reçoivent ta demande et proposent leur prix, leurs places et leur premier arrêt. Tu compares.',
              },
              {
                step: '3',
                title: 'Tu choisis, tu montes',
                desc: 'Tu acceptes la proposition qui te convient : photo, véhicule et plaque du chauffeur affichés avant la montée. Tu paies directement avec lui.',
              },
            ].map((s) => (
              <div key={s.step} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                <span className="inline-flex w-10 h-10 rounded-full bg-stacks-green text-white font-black items-center justify-center">
                  {s.step}
                </span>
                <h3 className="font-black text-lg text-slate-900">{s.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sécurité */}
        <section className="space-y-5">
          <h2 className="text-2xl font-black text-stacks-navy flex items-center gap-2">
            <DriveShield size={26} className="text-stacks-green" /> La sécurité d’abord
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: DriveCheckBadge, title: 'Chauffeurs vérifiés', desc: 'Selfie + pièce contrôlés avant activation. Badge « Vérifié » visible sur chaque course.' },
              { icon: DrivePin, title: 'Plaque avant de monter', desc: 'Photo, véhicule et plaque affichés avant la montée — vérifie la plaque, puis monte.' },
              { icon: DriveUsers, title: 'Course partagée en direct', desc: 'Un proche suit ta course en direct sur une page de suivi : trajet, chauffeur, plaque.' },
              { icon: DriveShield, title: 'Bouton SOS', desc: 'Pendant la course, le bouton SOS appelle les urgences (112) et partage ta course en direct.' },
            ].map((f) => (
              <div key={f.title} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
                <f.icon size={22} className="text-stacks-green" />
                <h3 className="font-black text-slate-900">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Prix */}
        <section className="bg-stacks-navy text-white rounded-3xl p-6 sm:p-8 space-y-3">
          <h2 className="text-2xl font-black">Le prix accepté est le prix payé</h2>
          <p className="text-slate-300 leading-relaxed">
            Tu vois une estimation indicative avant de commander, puis les
            chauffeurs proposent leur prix — tu peux aussi proposer le tien
            directement, et contre-proposer. Une fois que vous vous êtes
            mis d’accord et que tu as accepté, le prix est figé : il ne
            bouge pas, ni aux heures de pointe, ni la nuit.
          </p>
          <p className="text-slate-300 leading-relaxed">
            Le mode Groupe, comme le taxi partagé, divise le prix par passager.
          </p>
          <p className="text-slate-300 leading-relaxed">
            Paiement en espèces, Airtel Money ou Moov Money, directement avec
            ton chauffeur.
          </p>
          <Link href="/" className="inline-flex items-center gap-2 bg-stacks-amber text-stacks-navy font-black px-6 py-3.5 rounded-full shadow-md hover:bg-amber-400 transition-colors">
            Commander une course
          </Link>
        </section>

        {/* Chauffeur ? Une page rien que pour toi — pas ici. */}
        <Link
          href="/devenir-chauffeur"
          className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:border-stacks-green/50 transition-colors"
        >
          <span className="flex items-center gap-2 font-black text-lg text-slate-900">
            <DriveCarMini variant="sedan" size={20} tone="dark" /> Vous avez une voiture ?
          </span>
          <span className="text-sm text-slate-500">
            Conduisez quand vous voulez. Opter pour la liberté financière, à votre rythme.
          </span>
          <span className="sm:ml-auto font-black text-stacks-green whitespace-nowrap">
            Devenir chauffeur →
          </span>
        </Link>
      </main>
      <Footer />
    </div>
  );
}
