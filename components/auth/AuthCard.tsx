import Link from 'next/link';
import type { ReactNode } from 'react';

/** Carte centrée utilisée par toutes les pages d'authentification. */
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="flex items-center gap-2.5 mb-8">
        <span className="w-11 h-11 rounded-xl bg-stacks-green flex items-center justify-center text-white font-black text-xl shadow-md">
          SD
        </span>
        <span className="text-2xl font-black text-stacks-navy tracking-tight">
          Stacks Drive
        </span>
      </Link>

      <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl shadow-slate-900/5 p-6 sm:p-8 space-y-6">
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl font-black text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        {children}
      </div>

      <p className="mt-6 text-xs text-slate-400 text-center max-w-sm">
        En continuant, tu acceptes nos{' '}
        <Link href="/cgu" className="underline hover:text-stacks-green">
          CGU
        </Link>{' '}
        et notre{' '}
        <Link href="/confidentialite" className="underline hover:text-stacks-green">
          politique de confidentialité
        </Link>
        .
      </p>
    </div>
  );
}
