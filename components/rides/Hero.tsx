import Link from 'next/link';
import { ArrowRight, BadgeCheck, Banknote, Car, ShieldCheck, Users } from 'lucide-react';
import { COMMISSION_RATE } from '@/lib/commission';

/** Hero de la page d'accueil (visiteurs non connectés). */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-stacks-navy text-white">
      <div className="absolute inset-0 bg-gradient-to-br from-stacks-navy via-stacks-navy to-stacks-green/50" />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-stacks-amber bg-white/10 border border-white/15 rounded-full px-4 py-2">
          <Car size={14} /> Libreville — la solution du peuple
        </p>
        <h1 className="mt-6 text-4xl sm:text-6xl font-black tracking-tighter leading-[1.02] max-w-3xl">
          Ta course, au prix affiché.
          <span className="text-stacks-amber"> Jamais de surge.</span>
        </h1>
        <p className="mt-5 text-lg text-slate-300 max-w-2xl leading-relaxed">
          Stacks Drive met en relation passagers et chauffeurs de Libreville :
          prix fixe connu avant de monter, chauffeurs vérifiés, paiement en
          espèces ou Mobile Money — même la nuit.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="#courses"
            className="inline-flex items-center gap-2 bg-stacks-amber text-stacks-navy font-black px-7 py-4 rounded-full shadow-xl hover:bg-amber-400 transition-colors"
          >
            Trouver une course <ArrowRight size={18} />
          </Link>
          <Link
            href="/inscription"
            className="inline-flex items-center gap-2 bg-white/10 border border-white/25 text-white font-black px-7 py-4 rounded-full hover:bg-white/20 transition-colors"
          >
            Devenir chauffeur
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
          {[
            { icon: Banknote, title: 'Prix fixe', desc: 'Affiché avant la course' },
            { icon: ShieldCheck, title: 'Chauffeurs vérifiés', desc: 'Pièces contrôlées' },
            { icon: Users, title: 'Courses partagées', desc: 'Le prix divisé' },
            {
              icon: BadgeCheck,
              title: `Commission ${Math.round(COMMISSION_RATE * 100)} %`,
              desc: 'Au lancement, pour les chauffeurs',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white/10 border border-white/15 rounded-2xl px-4 py-4"
            >
              <f.icon size={20} className="text-stacks-amber" />
              <p className="mt-2 font-black text-sm">{f.title}</p>
              <p className="text-xs text-slate-300 mt-0.5">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
