import Link from 'next/link';
import { Car } from 'lucide-react';
import type { ProfileRole } from '@/lib/supabase/server';

export interface HeaderUser {
  id: string;
  email: string;
  role: ProfileRole;
  isAdmin: boolean;
}

/** En-tête public du site (accueil, détail d'une course, pages légales). */
export function Header({ user }: { user: HeaderUser | null }) {
  return (
    <header className="glass-dark sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-10 h-10 rounded-xl bg-stacks-green flex items-center justify-center text-white shadow-md">
            <Car size={22} />
          </span>
          <span className="leading-none">
            <span className="block text-lg font-black text-stacks-navy tracking-tight">
              Stacks Drive
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-widest text-stacks-green">
              Libreville
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-5 ml-6 text-sm font-bold text-slate-600">
          <Link href="/#courses" className="hover:text-stacks-green transition-colors">
            Courses
          </Link>
          <Link href="/#comment-ca-marche" className="hover:text-stacks-green transition-colors">
            Comment ça marche
          </Link>
          <Link href="/#pourquoi" className="hover:text-stacks-green transition-colors">
            Pourquoi nous
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {user.role === 'chauffeur' ? (
                <Link
                  href="/tableau-de-bord"
                  className="hidden sm:inline-flex text-sm font-bold text-slate-600 hover:text-stacks-green"
                >
                  Tableau de bord
                </Link>
              ) : (
                <Link
                  href="/mes-courses"
                  className="hidden sm:inline-flex text-sm font-bold text-slate-600 hover:text-stacks-green"
                >
                  Mes courses
                </Link>
              )}
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="hidden sm:inline-flex text-sm font-bold text-slate-600 hover:text-stacks-green"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/compte"
                className="text-sm font-bold text-slate-600 hover:text-stacks-green"
              >
                Mon compte
              </Link>
              <a
                href="/auth/signout"
                className="text-sm font-bold text-slate-500 hover:text-red-600"
              >
                Déconnexion
              </a>
            </>
          ) : (
            <>
              <Link
                href="/connexion"
                className="text-sm font-bold text-slate-600 hover:text-stacks-green px-3 py-2"
              >
                Connexion
              </Link>
              <Link
                href="/inscription"
                className="text-sm font-black text-white bg-stacks-green px-4 py-2.5 rounded-full shadow-md shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors"
              >
                S&apos;inscrire
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
