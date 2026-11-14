'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { FRAUD_SIGNAL_LABELS } from '@/lib/fraud-labels';
import type { FraudCase } from '@/lib/fraud';
import { timeAgo } from '@/lib/dates';

export interface FraudBlockedUser {
  id: string;
  fullName: string | null;
  reason: string | null;
  blockedAt: string | null;
}

/** Dossiers de fraude ouverts + comptes bloqués (admin, v2.26).
 *  Un dossier ouvert = un signal confirmé (annulations en série,
 *  vitesse impossible, faux PIN répétés, téléphone partagé). Le
 *  bouton « Débloquer » lève le marqueur « à vérifier », marque les
 *  dossiers du compte résolus, et le chauffeur se remet en ligne
 *  lui-même — le déblocage ne touche ni au paiement ni à la dette.
 *  Le téléphone partagé par 2 comptes seulement n'a pas mis le
 *  compte hors ligne (marqueur seul) : le déblocage efface quand
 *  même le marqueur et clôt le dossier. */
export function FraudReview({
  cases,
  blocked,
}: {
  cases: FraudCase[];
  blocked: FraudBlockedUser[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function unblock(userId: string) {
    setError(null);
    setMessage(null);
    setBusy(userId);
    const res = await fetch('/api/admin/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unblock_fraud', driverId: userId }),
    });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(data?.error ?? 'Déblocage impossible.');
      return;
    }
    setMessage('Compte débloqué — le chauffeur peut se remettre en ligne.');
    router.refresh();
  }

  if (cases.length === 0 && blocked.length === 0) {
    return <p className="text-sm text-slate-500">Aucun dossier de fraude ouvert, aucun compte bloqué.</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {message && (
        <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          {message}
        </p>
      )}

      {blocked.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {blocked.map((u) => (
            <li key={u.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-bold text-slate-900">
                  {u.fullName ?? 'Sans nom'}
                  <span className="ml-2 inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-red-100 text-red-700">
                    Bloqué temporairement
                  </span>
                </p>
                <p className="text-slate-500">
                  {u.reason ? `Motif : ${u.reason}` : 'Compte à vérifier'}
                  {u.blockedAt ? ` · bloqué ${timeAgo(u.blockedAt)}` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === u.id}
                onClick={() => unblock(u.id)}
                className="inline-flex items-center gap-2 bg-stacks-green text-white text-sm font-black px-5 py-2.5 rounded-full shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
              >
                {busy === u.id ? 'Déblocage…' : 'Débloquer'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {cases.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {cases.map((c) => {
            const isBlocked = blocked.some((b) => b.id === c.userId);
            return (
              <li key={c.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                <div className="text-sm flex items-start gap-3">
                  <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-slate-900">
                      {FRAUD_SIGNAL_LABELS[c.signal]} — {c.userName ?? 'Sans nom'}
                      {c.userPhone ? ` · ${c.userPhone}` : ''}
                    </p>
                    <p className="text-slate-500">
                      {typeof c.details?.detail === 'string' ? c.details.detail : ''}
                      {isBlocked ? '' : ' · Compte signalé « à vérifier » (pas de mise hors ligne pour ce signal).'}
                    </p>
                    <p className="text-xs text-slate-400">{timeAgo(c.createdAt)}</p>
                  </div>
                </div>
                {!isBlocked && (
                  <button
                    type="button"
                    disabled={busy === c.userId}
                    onClick={() => unblock(c.userId)}
                    className="inline-flex items-center gap-2 bg-white border border-slate-300 text-slate-700 text-sm font-black px-5 py-2.5 rounded-full hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    {busy === c.userId ? 'Clôture…' : 'Clôturer le dossier'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
