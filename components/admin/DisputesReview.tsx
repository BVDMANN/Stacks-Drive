'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DriveKey, DrivePin } from '@/components/icons/DriveUi';
import type { Dispute, DisputeDossier } from '@/lib/dispute-types';
import { LogoLoader } from '@/components/icons/DriveLogo';
import {
  DISPUTE_REASON_LABELS,
  DISPUTE_STATUS_LABELS,
} from '@/lib/dispute-types';
import { parseEscalatedAutoReply } from '@/lib/auto-replies';
import { formatFcfa } from '@/lib/commission';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/utils';

/** Litiges (admin, v2.15) : liste + dossier complet par litige (course,
 *  prix accepté, messages in-app, dernière position, PIN) + changement
 *  de statut + décision (ajustement de la dette et/ou de la commission
 *  du chauffeur, motif tracé). Noms seulement — jamais de téléphone. */
export function DisputesReview({ disputes }: { disputes: Dispute[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dossier, setDossier] = useState<DisputeDossier | null>(null);
  const [loadingDossier, setLoadingDossier] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [debtAdj, setDebtAdj] = useState('');
  const [commissionAdj, setCommissionAdj] = useState('');
  const [reason, setReason] = useState('');

  async function toggleDossier(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDossier(null);
      return;
    }
    setOpenId(id);
    setDossier(null);
    setError(null);
    setLoadingDossier(true);
    const res = await fetch(`/api/admin/disputes?disputeId=${id}`);
    const data = await res.json().catch(() => null);
    setLoadingDossier(false);
    if (!res.ok) {
      setError(data?.error ?? 'Dossier impossible à charger.');
      return;
    }
    setDossier(data.dossier as DisputeDossier);
    setDebtAdj('');
    setCommissionAdj('');
    setReason('');
  }

  async function act(body: Record<string, unknown>) {
    setError(null);
    setMessage(null);
    setBusy(true);
    const res = await fetch('/api/admin/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    setMessage('Enregistré.');
    router.refresh();
  }

  const openCount = disputes.filter((d) => d.status !== 'resolu').length;

  if (disputes.length === 0) {
    return <p className="text-sm text-slate-500">Aucun litige pour le moment.</p>;
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
      <p className="text-sm text-slate-500">
        {openCount} litige{openCount > 1 ? 's' : ''} en cours — clique sur un
        litige pour voir le dossier complet et trancher.
      </p>
      <ul className="divide-y divide-slate-100">
        {disputes.map((d) => {
          const isOpen = openId === d.id;
          // Litige escaladé après réponse auto rejetée (v2.29) : le
          // préfixe est retiré du message affiché, le badge dit
          // d'où il vient.
          const escalated = parseEscalatedAutoReply(d.message);
          const displayMessage = escalated ? escalated.cleanMessage : d.message;
          return (
            <li key={d.id} className="py-4 space-y-3">
              <button
                type="button"
                onClick={() => toggleDossier(d.id)}
                className="w-full text-left flex flex-wrap items-center justify-between gap-2"
              >
                <span className="text-sm">
                  <span className="font-bold text-slate-900">
                    {DISPUTE_REASON_LABELS[d.reason]} · {d.openedByRole === 'passager' ? 'passager' : 'chauffeur'}
                    {d.openedByName ? ` (${d.openedByName})` : ''}
                  </span>
                  <span className="block text-slate-500">
                    {d.amountConcerned !== null
                      ? `Montant concerné : ${formatFcfa(d.amountConcerned)} · `
                      : ''}
                    {timeAgo(d.createdAt)}
                  </span>
                  {escalated && (
                    <span className="inline-block mt-1 text-xs font-black px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                      Après réponse auto « {escalated.label} » rejetée
                    </span>
                  )}
                  <span className="block text-slate-600 mt-1">« {displayMessage} »</span>
                </span>
                <span
                  className={cn(
                    'text-xs font-black px-3 py-1.5 rounded-full border',
                    d.status === 'resolu'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : d.status === 'en_cours'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                  )}
                >
                  {DISPUTE_STATUS_LABELS[d.status]}
                </span>
              </button>

              {isOpen && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
                  {loadingDossier && (
                    <LogoLoader size={32} label="Chargement du dossier…" />
                  )}
                  {dossier && (
                    <>
                      <div className="text-sm space-y-1">
                        <p>
                          <Link href={`/courses/${dossier.rideId}`} className="font-bold text-stacks-green hover:underline">
                            Course : {dossier.pickup} → {dossier.destination}
                          </Link>
                          {' '}· {dossier.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'}
                          {' '}· statut : {dossier.rideStatus}
                        </p>
                        <p className="text-slate-600">
                          Passager : <strong className="text-slate-900">{dossier.passengerName ?? '—'}</strong>
                          {' '}· Chauffeur : <strong className="text-slate-900">{dossier.driverName ?? '—'}</strong>
                        </p>
                        <p className="text-slate-600">
                          Prix accepté :{' '}
                          <strong className="text-slate-900">
                            {dossier.acceptedPrice !== null ? formatFcfa(dossier.acceptedPrice) : 'non fixé'}
                          </strong>
                          {' '}· commission : {formatFcfa(dossier.platformFee)}
                          {' '}· part chauffeur : {formatFcfa(dossier.driverShare)}
                        </p>
                        <p className="text-slate-600 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <DriveKey size={14} />
                            {dossier.pinLocked
                              ? `Code PIN verrouillé (${dossier.pinAttempts} codes faux)`
                              : dossier.pinCode
                                ? `Code PIN : ${dossier.pinCode}`
                                : 'Pas de code PIN'}
                          </span>
                          {dossier.lastLocation && (
                            <span className="inline-flex items-center gap-1">
                              <DrivePin size={14} />
                              Dernière position connue : {dossier.lastLocation.lat.toFixed(4)}, {dossier.lastLocation.lng.toFixed(4)}
                              {' '}({timeAgo(dossier.lastLocation.updatedAt)})
                            </span>
                          )}
                        </p>
                      </div>

                      {dossier.messages.length > 0 && (
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                            Messages in-app ({dossier.messages.length})
                          </p>
                          <ul className="space-y-1.5">
                            {dossier.messages.map((m) => (
                              <li key={m.id} className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2">
                                <strong>{m.senderRole === 'passager' ? 'Passager' : 'Chauffeur'}</strong>
                                {' · '}
                                <span className="text-slate-600">{m.body}</span>
                                <span className="text-xs text-slate-400"> — {timeAgo(m.createdAt)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {dossier.decisions.length > 0 && (
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2">
                            Décisions déjà prises
                          </p>
                          <ul className="space-y-1.5">
                            {dossier.decisions.map((dec) => (
                              <li key={dec.id} className="text-sm bg-white border border-slate-200 rounded-xl px-3 py-2">
                                Dette : {dec.debtAdjustmentFcfa !== 0 ? `${dec.debtAdjustmentFcfa > 0 ? '+' : ''}${formatFcfa(dec.debtAdjustmentFcfa)}` : 'inchangée'}
                                {' · '}Commission : {dec.commissionAdjustmentFcfa !== 0 ? `${dec.commissionAdjustmentFcfa > 0 ? '+' : ''}${formatFcfa(dec.commissionAdjustmentFcfa)}` : 'inchangée'}
                                <span className="block text-slate-600">Motif : {dec.reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {dossier.status !== 'resolu' && (
                        <div className="space-y-3 border-t border-slate-200 pt-3">
                          <div className="flex flex-wrap gap-2">
                            {dossier.status === 'ouvert' && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => act({ disputeId: d.id, action: 'status', status: 'en_cours' })}
                                className="px-4 py-2 rounded-full text-sm font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                              >
                                Prendre en charge
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => act({ disputeId: d.id, action: 'status', status: 'resolu' })}
                              className="px-4 py-2 rounded-full text-sm font-black bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              Clore sans ajustement
                            </button>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-black text-slate-900">
                              Trancher avec ajustement (clôt le litige)
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <input
                                type="number"
                                step={50}
                                value={debtAdj}
                                onChange={(e) => setDebtAdj(e.target.value)}
                                placeholder="Ajustement dette (FCFA, − = doit moins)"
                                aria-label="Ajustement de la dette du chauffeur en FCFA"
                                className="w-64 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
                              />
                              <input
                                type="number"
                                step={50}
                                value={commissionAdj}
                                onChange={(e) => setCommissionAdj(e.target.value)}
                                placeholder="Ajustement commission (FCFA)"
                                aria-label="Ajustement de la commission en FCFA"
                                className="w-64 px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
                              />
                            </div>
                            <input
                              type="text"
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Motif de la décision (obligatoire)"
                              aria-label="Motif de la décision"
                              maxLength={500}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
                            />
                            <button
                              type="button"
                              disabled={
                                busy ||
                                reason.trim().length < 2 ||
                                (Number(debtAdj || 0) === 0 && Number(commissionAdj || 0) === 0)
                              }
                              onClick={() =>
                                act({
                                  disputeId: d.id,
                                  action: 'decide',
                                  debtAdjustmentFcfa: Number(debtAdj || 0),
                                  commissionAdjustmentFcfa: Number(commissionAdj || 0),
                                  reason: reason.trim(),
                                })
                              }
                              className="px-4 py-2 rounded-full text-sm font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
                            >
                              Appliquer la décision et clore
                            </button>
                            <p className="text-xs text-slate-400">
                              L’ajustement de dette est appliqué au « dû » du chauffeur.
                              La commission figée de la course n’est jamais réécrite :
                              la décision est la trace.
                            </p>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
