import Link from 'next/link';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';

/** Carte centrée utilisée par toutes les pages d'authentification.
 *  Thème sombre « Libreville la nuit » (fonds night, accents or/cyan),
 *  cohérent avec l'accueil v2.1.
 *  Sorties explicites vers l'accueil : croix ✕ en haut à droite de la
 *  carte + lien « Retour à l'accueil » sous la carte (le logo au-dessus
 *  renvoie aussi vers « / »). Aucune impasse. */
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
        <span className="w-11 h-11 rounded-xl bg-or flex items-center justify-center text-night-900 font-black text-xl shadow-md shadow-or/30">
          SD
        </span>
        <span className="text-2xl font-black text-white tracking-tight">
          Stacks Drive
        </span>
      </Link>

      <div className="relative w-full max-w-md bg-night-800/90 border border-white/10 rounded-3xl shadow-xl shadow-black/40 p-6 sm:p-8 space-y-6">
        <Link
          href="/"
          aria-label="Fermer et revenir à l'accueil"
          className="absolute top-4 right-4 inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
        >
          <X size={18} />
        </Link>
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-black text-white">{title}</h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>

      <Link href="/" className="mt-5 text-sm font-bold text-slate-400 hover:text-cyan transition-colors">
        ← Retour à l’accueil
      </Link>

      <p className="mt-3 text-xs text-slate-400 text-center max-w-sm">
        En continuant, tu acceptes nos{' '}
        <Link href="/cgu" className="underline hover:text-cyan">
          CGU
        </Link>{' '}
        et notre{' '}
        <Link href="/confidentialite" className="underline hover:text-cyan">
          politique de confidentialité
        </Link>
        .
      </p>
    </div>
  );
}
