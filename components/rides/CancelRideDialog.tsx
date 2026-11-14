'use client';

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cancelReasonsFor, type CancelReasonCode, type CancelRole } from '@/lib/cancellations';

/** Annulation propre (v2.23) : motif obligatoire dans une liste
 *  courte (selon le rôle), précision libre optionnelle. La
 *  confirmation attend le serveur (barre de chargement, règle 1) :
 *  le bouton montre « Annulation… », il n'est pas juste grisé. */
export function CancelRideDialog({
  open,
  role,
  onClose,
  onConfirm,
}: {
  open: boolean;
  role: CancelRole;
  onClose: () => void;
  onConfirm: (reasonCode: CancelReasonCode, detail: string | null) => Promise<boolean>;
}) {
  const reasons = cancelReasonsFor(role);
  const [reasonCode, setReasonCode] = useState<CancelReasonCode>('autre');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const ok = await onConfirm(reasonCode, detail.trim() || null);
    setBusy(false);
    if (!ok) {
      setError('Annulation impossible pour le moment. Réessaie.');
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Annuler la course"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="bg-night-800 border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4 sheet-up text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-black text-lg text-white">Annuler la course ?</h3>
            <p className="text-sm text-slate-400 mt-1">
              {role === 'passager'
                ? 'Ton chauffeur est prévenu immédiatement, avec ton motif.'
                : 'Ton passager est prévenu immédiatement, avec ton motif.'}{' '}
              L’annulation est comptée dans ta fiabilité.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300 shrink-0"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-black uppercase tracking-widest text-slate-400">
            Motif de l’annulation
          </legend>
          {reasons.map((r) => (
            <label
              key={r.code}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-colors ${
                reasonCode === r.code
                  ? 'border-gold bg-gold/10 text-white'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              <input
                type="radio"
                name="cancel-reason"
                value={r.code}
                checked={reasonCode === r.code}
                onChange={() => setReasonCode(r.code)}
                className="accent-yellow-500"
              />
              <span className="text-sm font-bold">{r.label}</span>
            </label>
          ))}
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="cancel-detail" className="text-xs font-black uppercase tracking-widest text-slate-400">
            Précision (optionnel)
          </label>
          <input
            id="cancel-detail"
            type="text"
            maxLength={200}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Ex. : je dois partir plus tard"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:border-gold focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 py-3.5 rounded-full text-sm font-black bg-white/10 text-slate-200 hover:bg-white/15 transition-colors disabled:opacity-50"
          >
            Garder la course
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3.5 rounded-full text-sm font-black bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? 'Annulation…' : 'Confirmer l’annulation'}
          </button>
        </div>
      </form>
    </div>
  );
}
