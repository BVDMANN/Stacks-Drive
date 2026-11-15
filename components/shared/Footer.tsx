import Image from 'next/image';
import Link from 'next/link';
import { DriveShield } from '@/components/icons/DriveUi';
import { COMMISSION_RATE } from '@/lib/commission';

/** Pied de page discret : les infos (commission, comment ça marche,
 *  sécurité) vivent ici et sur la page « À propos », pas sur l'accueil. */
export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-night-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="space-y-3">
            {/* v2.52 — le logo officiel complet (le S, la voiture,
                « StacksDrive® — VTC • GABON »). */}
            <Image
              src="/logo-stacks-drive.png"
              alt="Stacks Drive — VTC • Gabon"
              width={128}
              height={128}
              className="rounded-2xl"
            />
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
            <p className="text-xs font-black uppercase tracking-widest text-sarcelle">Naviguer</p>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Commander une course
                </Link>
              </li>
              <li>
                <Link href="/a-propos" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Comment ça marche
                </Link>
              </li>
              <li>
                <Link href="/devenir-chauffeur" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Devenir chauffeur
                </Link>
              </li>
              <li>
                <Link href="/aide" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Aide — questions courantes
                </Link>
              </li>
              <li>
                <Link href="/compte" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Mon compte
                </Link>
              </li>
            </ul>
          </nav>

          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-widest text-sarcelle">Le projet</p>
            <ul className="space-y-2 text-sm">
              <li className="text-slate-400 flex items-center gap-1.5">
                <DriveShield size={15} className="text-sarcelle shrink-0" />
                Prix garanti — même la nuit
              </li>
              <li className="text-slate-400">
                Commission chauffeur : {Math.round(COMMISSION_RATE * 100)} % au lancement,
                8 % ensuite, 10 % maximum garanti
              </li>
              <li className="text-slate-400">Espèces, Airtel Money, Moov Money</li>
              <li className="text-slate-400">Libreville, Gabon</li>
              <li>
                <Link href="/mentions-legales" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Mentions légales
                </Link>
              </li>
              <li>
                <Link href="/cgu" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Conditions d’utilisation
                </Link>
              </li>
              <li>
                <Link href="/confidentialite" className="text-slate-400 hover:text-sarcelle transition-colors">
                  Politique de confidentialité
                </Link>
              </li>
              <li>
                <Link href="/cookies" className="text-slate-400 hover:text-sarcelle transition-colors">
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
