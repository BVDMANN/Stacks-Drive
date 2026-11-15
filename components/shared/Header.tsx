import Link from 'next/link';
import { DriveSMark } from '@/components/icons/DriveLogo';
import { DriveLogout } from '@/components/icons/DriveUi';
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
          {/* v2.52 — le S du logo officiel, dans un carré de verre à
              liseré violet (écho de la bordure du logo). */}
          <span className="w-9 h-9 shrink-0 rounded-xl bg-white/5 border border-brand-500/50 flex items-center justify-center shadow-[0_2px_12px_rgba(163,52,245,0.45)]">
            <DriveSMark size={24} />
          </span>
          <span className="leading-none">
            <span className="block text-base font-black text-white tracking-tight">
              Stacks Drive
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-sarcelle">
              Libreville
            </span>
          </span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {/* v2.45 — compte admin = admin uniquement : pas de
                  bascule de rôle pour l'admin (ni passager, ni
                  chauffeur) — il voit l'admin, pas le flux passager. */}
              {!user.isAdmin && (
                <ModeToggle currentRole={user.role} canSwitchToDriver={user.canSwitchToDriver} />
              )}
              <Link
                href="/compte"
                className="hidden sm:inline-flex text-sm font-bold text-slate-300 hover:text-sarcelle px-2 py-2"
              >
                Mon compte
              </Link>
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="hidden sm:inline-flex text-sm font-bold text-slate-300 hover:text-sarcelle px-2 py-2"
                >
                  Admin
                </Link>
              )}
              <a
                href="/auth/signout"
                className="text-sm font-bold text-slate-400 hover:text-red-400 px-2 py-2"
                aria-label="Déconnexion"
              >
                <DriveLogout size={18} />
              </a>
            </>
          ) : (
            <Link
              href="/connexion"
              className="text-sm font-black text-white bg-brand-500 px-4 py-2 rounded-full shadow-md shadow-brand-500/40 hover:bg-brand-400 active:scale-95 transition-all"
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
