import Link from 'next/link';
import type { ReactNode } from 'react';

/** En-tête commun des pages privées (courses, tableau de bord, compte, admin). */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="h-1 w-full flex">
        <div className="flex-1 bg-stacks-green" />
        <div className="flex-1 bg-stacks-yellow" />
        <div className="flex-1 bg-stacks-blue" />
      </div>
      <header className="glass-dark sticky top-0 z-40 px-4 sm:px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="w-9 h-9 rounded-xl bg-stacks-green flex items-center justify-center text-white font-black shadow-md">S</span>
            <span className="text-lg font-black text-stacks-blue tracking-tight">Stacks Drive</span>
          </Link>
          <Link href="/" className="text-sm font-bold text-slate-500 hover:text-stacks-green ml-2">
            ← Toutes les courses
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/compte" className="text-sm font-bold text-slate-600 hover:text-stacks-green">
              Mon compte
            </Link>
            <a
              href="/auth/signout"
              className="text-sm font-bold text-slate-500 hover:text-red-600"
            >
              Déconnexion
            </a>
          </div>
        </div>
      </header>
      <main className="px-4 sm:px-6 py-8 max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{title}</h1>
            {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
