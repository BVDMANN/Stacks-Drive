'use client';

import { useState } from 'react';
import { DriveCheckBadge, DrivePinOff } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { MAP_REPORT_KIND_LABELS, type MapReportKind } from '@/lib/map-reports';

/** « Signaler une erreur de carte » (v2.49) : lieu manquant,
 *  quartier mal placé, erreur d'adresse, autre. Le formulaire
 *  crée un vrai ticket visible dans /admin (POST /api/map-reports)
 *  — c'est la même mécanique que les tickets de vérification.
 *  Sans la migration v2.49b, l'API répond 503 : le message dit
 *  que le signalement n'a pas pu partir, et propose de réessayer. */

const KINDS: MapReportKind[] = ['lieu_manquant', 'quartier_mal_place', 'erreur_adresse', 'autre'];

export function MapReportForm() {
  const [kind, setKind] = useState<MapReportKind>('lieu_manquant');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const res = await fetch('/api/map-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, title, details }),
    });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setSending(false);
    if (!res.ok) {
      setError(data?.error ?? 'Envoi impossible. Réessaie.');
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl p-4">
        <DriveCheckBadge size={20} className="text-green-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-green-900">Signalement envoyé, merci.</p>
          <p className="text-sm text-green-800 mt-1">
            L’équipe Stacks le regarde et corrige la carte. Les corrections
            arrivent avec les prochaines mises à jour.
          </p>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setTitle('');
              setDetails('');
            }}
            className="text-sm font-bold text-green-700 hover:underline mt-2"
          >
            Signaler autre chose →
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={
              kind === k
                ? 'rounded-2xl border-2 border-rose-500 bg-rose-500/10 px-3 py-2.5 text-sm font-black text-slate-900'
                : 'rounded-2xl border-2 border-slate-200 px-3 py-2.5 text-sm font-bold text-slate-600 hover:border-slate-300'
            }
          >
            {MAP_REPORT_KIND_LABELS[k]}
          </button>
        ))}
      </div>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ex. : le restaurant Roma n’est pas sur la carte"
        maxLength={120}
        required
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
      <textarea
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Précise l’endroit : quartier, rue, repère à côté…"
        rows={3}
        maxLength={2000}
        required
        className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={sending}
        className="inline-flex items-center gap-2 bg-slate-900 text-white text-sm font-black px-5 py-3 rounded-full hover:opacity-90 disabled:opacity-50"
      >
        {sending ? <LogoLoader size={18} /> : <DrivePinOff size={16} />}
        Envoyer le signalement
      </button>
    </form>
  );
}
