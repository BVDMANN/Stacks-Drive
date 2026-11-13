'use client';

import { useEffect, useState } from 'react';
import { MessageSquareWarning, Star, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  { value: 'retard', label: 'Retard' },
  { value: 'comportement', label: 'Comportement' },
  { value: 'proprete', label: 'Propreté du véhicule' },
  { value: 'itineraire', label: 'Itinéraire' },
  { value: 'paiement', label: 'Paiement' },
  { value: 'autre', label: 'Autre' },
] as const;

type Kind = 'note' | 'plainte' | 'recommandation';

/** Avis après course (v2.2) : noter (1-5 étoiles), déposer une plainte
 *  (catégorie) ou une recommandation. Les deux côtés peuvent le faire.
 *  Une plainte signale la course pour révision par l'admin. */
export function FeedbackForm({
  rideId,
  isPassenger,
}: {
  rideId: string;
  isPassenger: boolean;
}) {
  const [kind, setKind] = useState<Kind>('note');
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [category, setCategory] = useState<string>('');
  const [submitted, setSubmitted] = useState<Kind[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/feedback?rideId=${rideId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setSubmitted((d.feedback ?? []).map((f: { kind: Kind }) => f.kind));
      })
      .catch(() => undefined);
  }, [rideId]);

  const otherLabel = isPassenger ? 'ton chauffeur' : 'ton passager';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rideId,
        kind: effectiveKind,
        ...(effectiveKind === 'note' ? { rating: stars } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(effectiveKind === 'plainte' ? { category } : {}),
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Envoi impossible.');
      return;
    }
    setSubmitted((s) => [...s, effectiveKind]);
    setDone(true);
  }

  const allKinds: { kind: Kind; label: string; icon: React.ReactNode }[] = [
    { kind: 'note', label: `Noter ${otherLabel}`, icon: <Star size={15} /> },
    { kind: 'plainte', label: 'Signaler un problème', icon: <MessageSquareWarning size={15} /> },
    { kind: 'recommandation', label: 'Suggérer une amélioration', icon: <ThumbsUp size={15} /> },
  ];
  const availableKinds = allKinds.filter((k) => !submitted.includes(k.kind));

  // Type effectif : si le type sélectionné est déjà envoyé, on bascule
  // sur le premier type restant (sans changer le state pendant le rendu).
  const effectiveKind: Kind =
    availableKinds.some((k) => k.kind === kind) ? kind : (availableKinds[0]?.kind ?? 'note');

  if (availableKinds.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Merci — tes retours sur cette course ont bien été envoyés.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Type de retour">
        {availableKinds.map((k) => (
          <button
            key={k.kind}
            type="button"
            role="tab"
            aria-selected={effectiveKind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-black transition-colors',
              effectiveKind === k.kind
                ? 'bg-stacks-navy text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {k.icon} {k.label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {effectiveKind === 'note' && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-700">
            {isPassenger ? 'Note ton chauffeur' : 'Note ton passager'}
          </p>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Note de 1 à 5 étoiles">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                onClick={() => setStars(n)}
                className="p-1"
              >
                <Star
                  size={28}
                  className={cn(
                    stars >= n ? 'text-stacks-amber fill-stacks-amber' : 'text-slate-300'
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {effectiveKind === 'plainte' && (
        <div className="space-y-1.5">
          <label htmlFor="feedback-category" className="text-xs font-black uppercase tracking-widest text-slate-500">
            Catégorie du problème
          </label>
          <select
            id="feedback-category"
            required
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
          >
            <option value="">Choisir…</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400">
            Ta plainte est transmise à Stacks Drive — la course sera révisée.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="feedback-comment" className="text-xs font-black uppercase tracking-widest text-slate-500">
          {effectiveKind === 'note' ? 'Commentaire (facultatif)' : 'Explique en quelques mots'}
        </label>
        <textarea
          id="feedback-comment"
          rows={3}
          maxLength={500}
          required={effectiveKind !== 'note'}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            effectiveKind === 'plainte'
              ? 'Que s’est-il passé ?'
              : effectiveKind === 'recommandation'
                ? 'Qu’est-ce qui améliorerait Stacks Drive ?'
                : 'Un mot pour ton chauffeur / passager…'
          }
          className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none resize-y"
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="px-5 py-2.5 rounded-full text-sm font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
      >
        {busy ? 'Envoi…' : 'Envoyer'}
      </button>
      {done && (
        <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          Merci pour ton retour !
        </p>
      )}
    </form>
  );
}
