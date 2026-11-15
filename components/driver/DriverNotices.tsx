'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { DriveClock, DriveShieldAlert, DriveTrophy, DriveWallet, DriveX } from '@/components/icons/DriveUi';
import { formatFcfa } from '@/lib/commission';
import type { DriverNotice } from '@/app/api/driver/notices/route';

const WELCOME_DISMISSED_KEY = 'stacks-drive:welcome-seen';

/** Messages in-app chauffeur (v2.25, lot C) : bienvenue, dossier
 *  incomplet, inactivité, dette au plafond (« régularise pour
 *  reprendre »). Lus depuis /api/driver/notices — calculés à chaque
 *  lecture côté serveur, jamais stockés (sauf la bienvenue vue).
 *  Utilisé par le tableau de bord ET l'accueil chauffeur (item 11 :
 *  visible aux deux endroits). */
export function DriverNotices({ settleHref = '#gains' }: { settleHref?: string }) {
  const [notices, setNotices] = useState<DriverNotice[]>([]);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  const fetchNotices = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/notices');
      const data = await res.json().catch(() => null);
      if (data?.ok && Array.isArray(data.notices)) {
        setNotices(data.notices as DriverNotice[]);
      }
    } catch {
      // Sans Supabase : aucun message (le tableau de bord reste utilisable).
    }
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(WELCOME_DISMISSED_KEY) === '1') {
        setWelcomeDismissed(true);
      }
    } catch {
      // Stockage indisponible : la bienvenue reste affichée.
    }
    fetchNotices();
  }, [fetchNotices]);

  async function dismissWelcome() {
    setWelcomeDismissed(true);
    try {
      window.localStorage.setItem(WELCOME_DISMISSED_KEY, '1');
    } catch {
      // Stockage indisponible : la route serveur masque quand même.
    }
    try {
      await fetch('/api/driver/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss_welcome' }),
      });
    } catch {
      // Masquage local suffit.
    }
  }

  const visible = notices.filter(
    (n) => !(n.kind === 'welcome' && welcomeDismissed)
  );
  if (visible.length === 0) return null;

  return (
    <div className="space-y-3">
      {visible.map((notice) => {
        if (notice.kind === 'welcome') {
          return (
            <div
              key={notice.kind}
              className="bg-green-50 border border-green-200 rounded-3xl p-5 shadow-sm flex flex-wrap items-start gap-4"
            >
              <DriveTrophy size={24} className="text-green-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-[220px]">
                <p className="font-black text-green-800">{notice.title}</p>
                <p className="text-sm text-green-700 mt-1">{notice.message}</p>
              </div>
              <button
                type="button"
                onClick={dismissWelcome}
                aria-label="Fermer le message de bienvenue"
                className="shrink-0 p-2 rounded-full text-green-700 hover:bg-green-100 transition-colors"
              >
                <DriveX size={18} />
              </button>
            </div>
          );
        }
        if (notice.kind === 'incomplete_dossier') {
          return (
            <div
              key={notice.kind}
              className="bg-amber-50 border border-amber-200 rounded-3xl p-5 shadow-sm flex flex-wrap items-start gap-4"
            >
              <DriveShieldAlert size={24} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-[220px]">
                <p className="font-black text-amber-800">{notice.title}</p>
                <p className="text-sm text-amber-700 mt-1">{notice.message}</p>
              </div>
              <Link
                href="/compte#verification"
                className="inline-flex items-center gap-2 bg-stacks-green text-white text-sm font-black px-5 py-3 rounded-full shadow-md hover:bg-stacks-greenLight transition-colors"
              >
                Compléter mon dossier
              </Link>
            </div>
          );
        }
        if (notice.kind === 'inactive') {
          return (
            <div
              key={notice.kind}
              className="bg-sky-50 border border-sky-200 rounded-3xl p-5 shadow-sm flex flex-wrap items-start gap-4"
            >
              <DriveClock size={24} className="text-sky-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-[220px]">
                <p className="font-black text-sky-800">{notice.title}</p>
                <p className="text-sm text-sky-700 mt-1">{notice.message}</p>
              </div>
              <a
                href="#mise-en-ligne"
                className="inline-flex items-center gap-2 bg-stacks-green text-white text-sm font-black px-5 py-3 rounded-full shadow-md hover:bg-stacks-greenLight transition-colors"
              >
                Me mettre en ligne
              </a>
            </div>
          );
        }
        // fraud_blocked (v2.26) — compte à vérifier : mise hors
        // ligne temporaire, à débloquer par l'administrateur. Pas de
        // bouton « J'ai payé » ici : le paiement et la dette ne sont
        // pas concernés par ce blocage.
        if (notice.kind === 'fraud_blocked') {
          return (
            <div
              key={notice.kind}
              role="alert"
              className="bg-red-50 border border-red-200 rounded-3xl p-5 shadow-sm flex flex-wrap items-start gap-4"
            >
              <DriveShieldAlert size={24} className="text-red-700 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-[220px]">
                <p className="font-black text-red-800">{notice.title}</p>
                <p className="text-sm text-red-700 mt-1">{notice.message}</p>
              </div>
            </div>
          );
        }
        // debt_cap — « Régularise pour reprendre » (item 11).
        return (
          <div
            key={notice.kind}
            role="alert"
            className="bg-red-50 border border-red-200 rounded-3xl p-5 shadow-sm flex flex-wrap items-start gap-4"
          >
            <DriveWallet size={24} className="text-red-700 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[220px]">
              <p className="font-black text-red-800">
                {notice.title}
                {notice.amount !== undefined && notice.cap !== undefined
                  ? ` — ${formatFcfa(notice.amount)} dus (plafond ${formatFcfa(notice.cap)})`
                  : ''}
              </p>
              <p className="text-sm text-red-700 mt-1">{notice.message}</p>
            </div>
            <a
              href={settleHref}
              className="inline-flex items-center gap-2 bg-red-600 text-white text-sm font-black px-5 py-3 rounded-full shadow-md hover:bg-red-500 transition-colors"
            >
              Voir « J’ai payé »
            </a>
          </div>
        );
      })}
    </div>
  );
}
