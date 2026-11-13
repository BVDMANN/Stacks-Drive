import Link from 'next/link';
import type { ReactNode } from 'react';

/** Carte centrée utilisée par toutes les pages d'authentification.
 *  Thème sombre « Libreville la nuit » (fonds night, accents ember/volt),
 *  cohérent avec l'accueil v2.1. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-night-950 flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2.5 mb-8">
        <span className="w-11 h-11 rounded-xl bg-ember flex items-center justify-center text-white font-black text-xl shadow-md shadow-ember/30">
          SD
        </span>
        <span className="text-2xl font-black text-white tracking-tight">
          Stacks Drive
        </span>
      </Link>

      <div className="w-full max-w-md bg-night-800/90 border border-white/10 rounded-3xl shadow-xl shadow-black/40 p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-black text-white">{title}</h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center max-w-sm">
        En continuant, tu acceptes nos{' '}
        <Link href="/cgu" className="underline hover:text-volt">
          CGU
        </Link>{' '}
        et notre{' '}
        <Link href="/confidentialite" className="underline hover:text-volt">
          politique de confidentialité
        </Link>
        .
      </p>
    </div>
  );
}
