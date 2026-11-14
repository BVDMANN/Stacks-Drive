import Link from 'next/link';
import { Car } from 'lucide-react';
import type { ProfileRole } from '@/lib/supabase/server';
import { ModeToggle } from './ModeToggle';

export interface HeaderUser {
  id: string;
  email: string;
  role: ProfileRole;
  isAdmin: boolean;
  /** Règle 2 (v2.17) : le compte a un dossier chauffeur — sinon le
   *  switch vers le mode Chauffeur est bloqué (voir ModeToggle). */
  canSwitchToDriver: boolean;
}

/** En-tête épuré, style Uber : logo à gauche, un petit bouton
 *  « Connexion » à droite pour les visiteurs — rien d'autre.
 *  Une fois connecté : bascule Passager / Chauffeur bien visible. */
export function Header({ user }: { user: HeaderUser | null }) {
  return (
    <header className="glass-dark sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-9 h-9 rounded-xl bg-or flex items-center justify-center text-night-900 shadow-md shadow-or/40">
            <Car size={20} />
          </span>
          <span className="leading-none">
            <span className="block text-base font-black text-white tracking-tight">
              Stacks Drive
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-cyan">
              Libreville
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <ModeToggle currentRole={user.role} canSwitchToDriver={user.canSwitchToDriver} />
              <Link
                href="/compte"
                className="hidden sm:inline-flex text-sm font-bold text-slate-300 hover:text-cyan px-2 py-2"
              >
                Mon compte
              </Link>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="hidden sm:inline-flex text-sm font-bold text-slate-300 hover:text-cyan px-2 py-2"
                >
                  Admin
                </Link>
              )}
              <a
                href="/auth/signout"
                className="text-sm font-bold text-slate-400 hover:text-red-400 px-2 py-2"
                aria-label="Déconnexion"
              >
                ✕
              </a>
            </>
          ) : (
            <Link
              href="/connexion"
              className="text-sm font-black text-night-900 bg-or px-4 py-2 rounded-full shadow-md shadow-or/40 hover:bg-or-light active:scale-95 transition-all"
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
