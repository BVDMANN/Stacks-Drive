import Link from 'next/link';
import { ArrowRight, Car } from 'lucide-react';

export function Footer() {
  return (
    <footer className="mt-4">
      {/* Bandeau d'appel */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-200 mx-0 shadow-lg shadow-slate-900/5 bg-stacks-navy">
        <div className="absolute inset-0 bg-gradient-to-r from-stacks-navy via-stacks-navy/90 to-stacks-green/40" />
        <div className="relative z-10 px-6 py-12 sm:px-12 text-center space-y-4">
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Besoin d&apos;une course à Libreville ?
          </h2>
          <p className="text-slate-300 max-w-lg mx-auto">
            Prix fixe affiché avant de monter, jamais de surge — même la nuit.
            Un compte, une réservation, et c&apos;est parti.
          </p>
          <Link
            href="/#courses"
            className="inline-flex items-center gap-2 bg-stacks-amber text-stacks-navy font-black px-8 py-4 rounded-full shadow-xl hover:bg-amber-400 transition-colors min-h-14"
          >
            Voir les courses <ArrowRight size={18} />
          </Link>
        </div>
      </div>

      {/* Pied de page */}
      <div className="mt-10 border-t border-slate-200 pt-10 pb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-stacks-green flex items-center justify-center text-white shadow-md">
                <Car size={22} />
              </div>
              <span className="text-xl font-black text-stacks-navy tracking-tight">Stacks Drive</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
              La solution du peuple pour se déplacer à Libreville : prix fixe,
              chauffeurs vérifiés, paiement en espèces ou Mobile Money.
            </p>
            <p className="text-slate-500 text-sm">
              Un service de <strong className="text-slate-700">Stacks</strong> — SIREN 104 314 687.
            </p>
            <div className="h-1 w-24 flex rounded-full overflow-hidden">
              <div className="flex-1 bg-stacks-green" />
              <div className="flex-1 bg-stacks-amber" />
              <div className="flex-1 bg-stacks-navy" />
            </div>
          </div>

          <nav className="space-y-3" aria-label="Navigation du pied de page">
            <p className="text-xs font-black uppercase tracking-widest text-stacks-green">Naviguer</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/#courses" className="text-slate-600 hover:text-stacks-green transition-colors">
                  Courses du jour
                </Link>
              </li>
              <li>
                <Link href="/#comment-ca-marche" className="text-slate-600 hover:text-stacks-green transition-colors">
                  Comment ça marche
                </Link>
              </li>
              <li>
                <Link href="/inscription" className="text-slate-600 hover:text-stacks-green transition-colors">
                  Devenir chauffeur
                </Link>
              </li>
              <li>
                <Link href="/compte" className="text-slate-600 hover:text-stacks-green transition-colors">
                  Mon compte
                </Link>
              </li>
            </ul>
          </nav>

          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-stacks-green">Le projet</p>
            <ul className="space-y-2 text-sm">
              <li className="text-slate-500">Libreville, Gabon</li>
              <li className="text-slate-500">Prix fixe, jamais de surge — même la nuit</li>
              <li className="text-slate-500">Espèces, Airtel Money, Moov Money</li>
              <li>
                <Link href="/mentions-legales" className="text-slate-600 hover:text-stacks-green transition-colors">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link href="/cgu" className="text-slate-600 hover:text-stacks-green transition-colors">
                  Conditions d’utilisation
                </Link>
              </li>
              <li>
                <Link href="/confidentialite" className="text-slate-600 hover:text-stacks-green transition-colors">
                  Politique de confidentialité
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between gap-2 text-xs text-slate-400">
          <span>© 2026 Stacks Drive — par Stacks.</span>
          <span>Les 6 courses initiales sont des exemples fictifs ; les courses publiées par les chauffeurs sont réelles.</span>
        </div>
      </div>
    </footer>
  );
}
