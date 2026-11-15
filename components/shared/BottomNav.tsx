'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DriveHistory, DriveHome, DriveUser } from '@/components/icons/DriveUi';
import { cn } from '@/lib/utils';

/** Navigation basse (v2.51, façon Bolt — langage v2.52).
 *
 *  Trois onglets : Accueil / Activité / Compte. Toujours visible en
 *  bas sur mobile, en verre nuit à liseré avec faisceau (même
 *  signature que les cartes v2.52) ; l'onglet actif est une pastille
 *  violette de marque (#A134F5). Respecte la safe-area iOS
 *  (`env(safe-area-inset-bottom)`).
 *
 *  Visible UNIQUEMENT sur /, /activite, /compte (et /mes-courses,
 *  qui redirige vers /activite) — cachée partout ailleurs (admin,
 *  connexion, inscription, courses, suivi, tableau de bord,
 *  devenir-chauffeur, aide, pages légales). Sur écran large elle
 *  est masquée (navigation par l'en-tête).
 *
 *  Règle n°2 intacte : la barre ne fait que naviguer — le switch
 *  passager → chauffeur reste verrouillé sans compte chauffeur
 *  (voir ModeToggle / Header), elle ne le contourne pas.
 *
 *  Les pages concernées réservent la place en bas (HomeScreen :
 *  padding bas de la feuille ; PageShell : padding bas du contenu)
 *  pour que rien ne soit masqué derrière la barre. */
const TABS = [
  { href: '/', label: 'Accueil', icon: DriveHome, match: (p: string) => p === '/' },
  {
    href: '/activite',
    label: 'Activité',
    icon: DriveHistory,
    match: (p: string) => p === '/activite' || p.startsWith('/activite/') || p === '/mes-courses' || p.startsWith('/mes-courses/'),
  },
  {
    href: '/compte',
    label: 'Compte',
    icon: DriveUser,
    match: (p: string) => p === '/compte' || p.startsWith('/compte/'),
  },
] as const;

const VISIBLE = (pathname: string): boolean =>
  pathname === '/' ||
  pathname === '/activite' ||
  pathname.startsWith('/activite/') ||
  pathname === '/compte' ||
  pathname.startsWith('/compte/') ||
  pathname === '/mes-courses' ||
  pathname.startsWith('/mes-courses/');

export function BottomNav() {
  const pathname = usePathname();
  if (!VISIBLE(pathname)) return null;
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 z-50 flex justify-center pointer-events-none sm:hidden"
      style={{ bottom: 'calc(10px + env(safe-area-inset-bottom))' }}
    >
      <div className="bottom-nav-glass pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1.5 shadow-2xl shadow-black/60">
        {TABS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={label}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-full px-4 py-1.5 text-[11px] font-black leading-none transition-all active:scale-95',
                active ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/40' : 'text-slate-400 hover:text-white'
              )}
            >
              <Icon size={20} className={active ? 'text-white' : 'text-slate-400'} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
