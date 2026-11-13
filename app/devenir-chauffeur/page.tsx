import Link from 'next/link';
import { ArrowRight, BadgeCheck, Car, Gift, MapPin, ShieldCheck, Wallet } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { COMMISSION_RATE, COMMISSION_RATE_PERMANENT, COMMISSION_CAP } from '@/lib/commission';

/** Devenir chauffeur — page RIEN QUE pour les chauffeurs.
 *  L'accueil et « À propos » restent 100 % passager : c'est ici, et
 *  uniquement ici, qu'on parle de conduire. Ton soft, aucune promesse
 *  de revenu chiffrée — juste les règles du jeu, clairement. */
export default function DevenirChauffeurPage() {
  return (
    <div className="min-h-screen bg-night-950 text-slate-100">
      <Header user={null} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-12">
        <header className="space-y-4">
          <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-cyan bg-cyan/10 border border-cyan/30 rounded-full px-4 py-2">
            <Car size={14} /> Libreville — pour les chauffeurs
          </p>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Opter pour la liberté financière, à votre rythme.
          </h1>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl">
            Tu as une voiture ou une moto ? Conduis quand tu veux, reçois des
            demandes autour de toi, propose ton prix. Pas d’horaires imposés,
            pas de patron — juste tes courses, tes gains.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/inscription?role=chauffeur"
              className="inline-flex items-center gap-2 bg-or text-night-900 font-black px-7 py-4 rounded-full shadow-lg shadow-or/40 hover:bg-or-light active:scale-[0.98] transition-all"
            >
              S’inscrire en chauffeur <ArrowRight size={18} />
            </Link>
            <Link href="/" className="text-sm font-bold text-slate-400 hover:text-cyan transition-colors">
              Tu cherches une course ? Retour à l’accueil →
            </Link>
          </div>
        </header>

        {/* Les 3 étapes */}
        <section className="space-y-5">
          <h2 className="text-2xl font-black text-white">Comment ça marche, côté chauffeur</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              {
                step: '1',
                icon: BadgeCheck,
                title: 'Tu te fais vérifier',
                desc: 'Selfie + pièce d’identité (ou permis) contrôlés par notre équipe. Sans vérification, pas de mise en ligne : les passagers voyagent sereins.',
              },
              {
                step: '2',
                icon: MapPin,
                title: 'Tu te mets en ligne',
                desc: 'Un interrupteur, ton quartier, et tu apparais sur la carte des passagers. Les demandes autour de toi arrivent en pop-up.',
              },
              {
                step: '3',
                icon: Wallet,
                title: 'Tu proposes, tu gagnes',
                desc: `Tu fixes ton prix par course. Commission de ${Math.round(COMMISSION_RATE * 100)} % au lancement, puis ${Math.round(COMMISSION_RATE_PERMANENT * 100)} % — plafonnée à ${Math.round(COMMISSION_CAP * 100)} % pour toujours. Les concurrents prennent 15 à 30 %.`,
              },
            ].map((s) => (
              <div key={s.step} className="bg-night-800/80 border border-white/10 rounded-3xl p-6 shadow-sm space-y-3">
                <span className="inline-flex w-10 h-10 rounded-full bg-cyan text-night-900 font-black items-center justify-center">
                  {s.step}
                </span>
                <h3 className="font-black text-lg text-white flex items-center gap-2">
                  <s.icon size={18} className="text-cyan" /> {s.title}
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Ce que tu gardes */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-3">
            <h2 className="text-2xl font-black text-white">
              Tu gardes 92 à 95 % de chaque course
            </h2>
            <p className="text-slate-400 leading-relaxed">
              La commission est de {Math.round(COMMISSION_RATE * 100)} % au lancement
              (3 mois), puis {Math.round(COMMISSION_RATE_PERMANENT * 100)} % — plafonnée à{' '}
              {Math.round(COMMISSION_CAP * 100)} % pour toujours. Elle est calculée en
              silence : rien n’est déduit pendant tes courses.
            </p>
            <p className="text-slate-400 leading-relaxed">
              Le passager te paie directement, en espèces ou par Mobile Money
              (Airtel Money, Moov Money). Tu règles tes commissions une fois par
              semaine, en un seul transfert.
            </p>
          </div>
          <div className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-3">
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <ShieldCheck size={24} className="text-cyan" /> Un dépôt, et c’est tout
            </h2>
            <p className="text-slate-400 leading-relaxed">
              À l’inscription, un dépôt de garantie remboursable de 5 000 FCFA.
              Il couvre ta première semaine de commissions — il t’est rendu quand
              tu pars proprement, après avoir soldé ce que tu dois.
            </p>
            <p className="text-slate-400 leading-relaxed">
              Si tes commissions dues dépassent 5 000 FCFA, les nouvelles demandes
              se mettent en pause le temps que tu règles. Simple, et pareil pour
              tout le monde.
            </p>
          </div>
        </section>

        {/* Les petits plus */}
        <section className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 space-y-3">
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Gift size={24} className="text-gold" /> Des petits plus pour te motiver
          </h2>
          <p className="text-slate-400 leading-relaxed max-w-2xl">
            Une quête chaque jour, un défi chaque semaine, des niveaux Bronze,
            Argent, Or, Diamant — et de temps en temps, une Course Double qui
            double tes points. Rien d’obligatoire, juste de quoi rendre la
            journée un peu plus fun quand tu roules.
          </p>
          <p className="text-sm text-slate-500">
            Ton tableau de bord te montre tes gains par course, sur 24 h, sur la
            semaine et sur le mois — et ce que tu dois, en temps réel.
          </p>
        </section>

        {/* Appel final */}
        <section className="text-center space-y-4 bg-or/10 border border-or/30 rounded-3xl p-8">
          <h2 className="text-2xl font-black text-white">Prêt quand tu l’es.</h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            L’inscription prend moins d’une minute. La vérification se fait
            ensuite, tranquillement — selfie et pièce d’identité.
          </p>
          <Link
            href="/inscription?role=chauffeur"
            className="inline-flex items-center gap-2 bg-or text-night-900 font-black px-7 py-4 rounded-full shadow-lg shadow-or/40 hover:bg-or-light active:scale-[0.98] transition-all"
          >
            S’inscrire en chauffeur <ArrowRight size={18} />
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
