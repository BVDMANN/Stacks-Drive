import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** En-tête commun des pages privées (courses, tableau de bord, compte, admin)
 *  et des pages légales. `dark` applique l'identité « Libreville la nuit »
 *  (fonds sombres, texte clair, accents ember/volt) ; par défaut le thème
 *  reste clair pour ne pas toucher aux pages privées existantes.
 *  `user` : l'utilisateur connecté — sans lui, l'en-tête affiche
 *  « Connexion » au lieu de « Mon compte » / « Déconnexion » (bug : ces
 *  liens s'affichaient même déconnecté). */
export function PageShell({
  title,
  subtitle,
  actions,
  dark,
  user,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  dark?: boolean;
  user?: { id: string; email: string } | null;
  children: ReactNode;
}) {
  return (
    <div className={dark ? 'min-h-screen bg-night-950 text-slate-100' : 'min-h-screen bg-slate-50 text-slate-900'}>
      <div className="h-1 w-full flex">
        <div className="flex-1 bg-stacks-green" />
        <div className="flex-1 bg-stacks-yellow" />
        <div className="flex-1 bg-stacks-blue" />
      </div>
      <header className="glass-dark sticky top-0 z-40 px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-stacks-green flex items-center justify-center text-white font-black shadow-md">S</span>
            <span className={cn('text-lg font-black tracking-tight', dark ? 'text-white' : 'text-stacks-blue')}>Stacks Drive</span>
          </Link>
          <Link href="/" className={cn('text-sm font-bold ml-2', dark ? 'text-slate-400 hover:text-volt' : 'text-slate-500 hover:text-stacks-green')}>
            ← Toutes les courses
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <Link href="/compte" className={cn('text-sm font-bold', dark ? 'text-slate-300 hover:text-volt' : 'text-slate-600 hover:text-stacks-green')}>
                  Mon compte
                </Link>
                <a
                  href="/auth/signout"
                  className={cn('text-sm font-bold', dark ? 'text-slate-400 hover:text-red-400' : 'text-slate-500 hover:text-red-600')}
                >
                  Déconnexion
                </a>
              </>
            ) : (
              <Link
                href="/connexion"
                className="text-sm font-black text-white bg-ember px-4 py-2 rounded-full shadow-md shadow-ember/40 hover:bg-ember-light transition-colors"
              >
                Connexion
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="px-4 sm:px-6 py-8 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className={cn('text-3xl font-black tracking-tight', dark ? 'text-white' : 'text-slate-900')}>{title}</h1>
            {subtitle && <p className={cn('mt-1', dark ? 'text-slate-400' : 'text-slate-500')}>{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
