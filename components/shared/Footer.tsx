import Link from 'next/link';
import { Car, ShieldCheck } from 'lucide-react';
import { COMMISSION_RATE } from '@/lib/commission';

/** Pied de page discret : les infos (commission, comment ça marche,
 *  sécurité) vivent ici et sur la page « À propos », pas sur l'accueil. */
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-night-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-or flex items-center justify-center text-night-900 shadow-md shadow-or/40">
                <Car size={22} />
              </div>
              <span className="text-xl font-black text-white tracking-tight">Stacks Drive</span>
            </div>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
              La solution du peuple pour se déplacer à Libreville : estimation
              indicative, prix figé une fois accepté, chauffeurs vérifiés,
              paiement en espèces ou Mobile Money.
            </p>
            <p className="text-slate-400 text-sm">
              Un service de <strong className="text-slate-200">Stacks</strong> — SIREN 104 314 687.
            </p>
            <div className="h-1 w-24 flex rounded-full overflow-hidden" aria-hidden>
              <div className="flex-1 bg-stacks-green" />
              <div className="flex-1 bg-stacks-yellow" />
              <div className="flex-1 bg-stacks-blue" />
            </div>
          </div>

          <nav className="space-y-3" aria-label="Navigation du pied de page">
            <p className="text-xs font-black uppercase tracking-widest text-cyan">Naviguer</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-slate-400 hover:text-cyan transition-colors">
                  Commander une course
                </Link>
              </li>
              <li>
                <Link href="/a-propos" className="text-slate-400 hover:text-cyan transition-colors">
                  Comment ça marche
                </Link>
              </li>
              <li>
                <Link href="/devenir-chauffeur" className="text-slate-400 hover:text-cyan transition-colors">
                  Devenir chauffeur
                </Link>
              </li>
              <li>
                <Link href="/compte" className="text-slate-400 hover:text-cyan transition-colors">
                  Mon compte
                </Link>
              </li>
            </ul>
          </nav>

          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-cyan">Le projet</p>
            <ul className="space-y-2 text-sm">
              <li className="text-slate-400 flex items-center gap-1.5">
                <ShieldCheck size={15} className="text-cyan shrink-0" />
                Prix garanti — même la nuit
              </li>
              <li className="text-slate-400">
                Commission chauffeur : {Math.round(COMMISSION_RATE * 100)} % au lancement,
                8 % ensuite, 10 % maximum garanti
              </li>
              <li className="text-slate-400">Espèces, Airtel Money, Moov Money</li>
              <li className="text-slate-400">Libreville, Gabon</li>
              <li>
                <Link href="/mentions-legales" className="text-slate-400 hover:text-cyan transition-colors">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link href="/cgu" className="text-slate-400 hover:text-cyan transition-colors">
                  Conditions d’utilisation
                </Link>
              </li>
              <li>
                <Link href="/confidentialite" className="text-slate-400 hover:text-cyan transition-colors">
                  Politique de confidentialité
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="text-slate-400 hover:text-cyan transition-colors">
                  Politique des cookies
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between gap-2 text-xs text-slate-500">
          <span>© 2026 Stacks Drive — par Stacks.</span>
          <span>Les chauffeurs affichés « Démo » sont des exemples fictifs.</span>
        </div>
      </div>
    </footer>
  );
}
