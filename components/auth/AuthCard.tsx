import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DriveChevronLeft, DriveX } from '@/components/icons/DriveUi';

/** Carte centrée utilisée par toutes les pages d'authentification.
 *  Thème sombre « Libreville la nuit » (fonds night, accents rose/sarcelle),
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
      {/* v2.52 — le logo officiel complet (le S, la voiture,
          « StacksDrive® — VTC • GABON »), lien vers l'accueil. */}
      <Link href="/" className="mb-8" aria-label="Stacks Drive — retour à l'accueil">
        <Image
          src="/logo-stacks-drive.png"
          alt="Stacks Drive — VTC • Gabon"
          width={140}
          height={140}
          className="rounded-3xl shadow-[0_4px_24px_rgba(163,52,245,0.35)]"
          priority
        />
      </Link>

      <div className="relative w-full max-w-md bg-night-800/90 border border-white/10 rounded-3xl shadow-xl shadow-black/40 p-6 sm:p-8 space-y-6">
        <Link
          href="/"
          aria-label="Fermer et revenir à l'accueil"
          className="absolute top-4 right-4 inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
        >
          <DriveX size={18} />
        </Link>
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-black text-white">{title}</h1>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {children}
      </div>

      <Link href="/" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-slate-400 hover:text-sarcelle transition-colors">
        <DriveChevronLeft size={15} /> Retour à l’accueil
      </Link>

      <p className="mt-3 text-xs text-slate-400 text-center max-w-sm">
        En continuant, tu acceptes nos{' '}
        <Link href="/cgu" className="underline hover:text-sarcelle">
          CGU
        </Link>{' '}
        et notre{' '}
        <Link href="/confidentialite" className="underline hover:text-sarcelle">
          politique de confidentialité
        </Link>
        .
      </p>
    </div>
  );
}
