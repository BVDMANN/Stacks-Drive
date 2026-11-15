'use client';

import { useEffect, useState } from 'react';
import { DriveAlert } from '@/components/icons/DriveUi';
import { cn } from '@/lib/utils';
import {
  DISPUTE_REASON_LABELS,
  DISPUTE_STATUS_LABELS,
} from '@/lib/dispute-types';
import type { DisputeReason, DisputeStatus } from '@/lib/dispute-types';
import {
  ESCALATION_LABELS,
  disputeReasonForTopic,
  topicById,
  topicLabel,
  topicsForRide,
  type AutoReply,
  type ComplaintTopicId,
  type EscalationReason,
} from '@/lib/auto-replies';
import { AutoReplyCard } from '@/components/rides/AutoReplyCard';
import { uploadTripAudioOnDispute } from '@/lib/trip-audio';

interface ExistingDispute {
  id: string;
  reason: string;
  status: DisputeStatus;
  created_at: string;
}

interface DisputeFormProps {
  rideId: string;
  myRole: 'passager' | 'chauffeur';
  rideStatus: 'terminee' | 'annulee';
}

type Step = 'topic' | 'auto' | 'escalate' | 'resolved' | 'done';

/** Plainte / litige depuis sa course (v2.15 + v2.29) : passager ou
 *  chauffeur, course terminée ou annulée.
 *
 *  v2.29 — la plainte standard ne remonte plus d'emblée à un
 *  humain : l'utilisateur choisit d'abord son sujet (retard,
 *  attente, annulation, prix, paiement, itinéraire, véhicule).
 *  Si le sujet est standard, il reçoit IMMÉDIATEMENT une réponse
 *  auto concrète (chiffres de sa course, actions existantes, lien
 *  FAQ) — journalisée, sans litige ni e-mail. S'il la rejette
 *  (« Ça ne résout pas mon problème »), ou si la plainte n'est pas
 *  standard (mot grave, montant contesté important, « Autre
 *  problème »), elle devient un litige (flux v2.15 : dossier
 *  complet dans /admin + e-mail admin), tracé comme escalade.
 *  L'utilisateur voit toujours si sa plainte est traitée
 *  automatiquement ou transmise à un humain. */
export function DisputeForm({ rideId, myRole, rideStatus }: DisputeFormProps) {
  const [existing, setExisting] = useState<ExistingDispute[]>([]);
  const [step, setStep] = useState<Step>('topic');
  const [topic, setTopic] = useState<ComplaintTopicId | ''>('');
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [autoReply, setAutoReply] = useState<AutoReply | null>(null);
  const [escalation, setEscalation] = useState<{
    reason: EscalationReason;
    disputeReason: DisputeReason;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const topics = topicsForRide(rideStatus);
  const selectedTopic = topic ? topicById(topic) : null;
  const showAmount = topic === 'prix' || topic === 'paiement';
  const openDispute = existing.some((d) => d.status !== 'resolu');

  useEffect(() => {
    fetch(`/api/disputes?rideId=${rideId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setExisting(d.disputes ?? []);
      })
      .catch(() => undefined);
  }, [rideId]);

  async function submitTopic(e: React.FormEvent) {
    e.preventDefault();
    if (!topic) return;
    setError(null);
    // Le sujet « Autre problème » n'a jamais de réponse auto :
    // on ne fait même pas l'aller-retour serveur, on présente
    // directement le litige (la route re-classe de toute façon).
    if (topic === 'autre') {
      setEscalation({ reason: 'sujet-non-standard', disputeReason: 'autre' });
      setStep('escalate');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/complaints/auto-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rideId,
        topic,
        ...(message.trim() ? { message: message.trim() } : {}),
        ...(showAmount && amount.trim() ? { amountConcerned: Number(amount) } : {}),
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Envoi impossible.');
      return;
    }
    if (data?.outcome === 'escalate') {
      setEscalation({
        reason: (data.escalationReason ?? 'sujet-non-standard') as EscalationReason,
        disputeReason: (data.disputeReason ?? disputeReasonForTopic(topic)) as DisputeReason,
      });
      setStep('escalate');
      return;
    }
    if (data?.outcome === 'auto' && data.autoReply) {
      setAutoReply(data.autoReply as AutoReply);
      setStep('auto');
      return;
    }
    setError('Réponse inattendue, réessaie.');
  }

  async function submitDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!topic || !escalation) return;
    if (message.trim().length < 2) {
      setError('Explique en quelques mots ce qui s’est passé.');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await fetch('/api/disputes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rideId,
        reason: escalation.disputeReason,
        ...(showAmount && amount.trim() ? { amountConcerned: Number(amount) } : {}),
        message: message.trim(),
        escalatedFromAutoReply: topic,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Envoi impossible.');
      return;
    }
    // Audio du trajet (v2.34) : si un enregistrement chiffré existe
    // dans cette session, il est envoyé maintenant que le litige est
    // ouvert — jamais avant, jamais sans litige.
    if (data?.disputeId) {
      uploadTripAudioOnDispute(rideId, data.disputeId as string).catch(() => undefined);
    }
    setStep('done');
  }

  if (step === 'done') {
    return (
      <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
        Litige ouvert — Stacks Drive va examiner ta course et te recontacter
        si besoin. Tu peux suivre son statut ici.
      </p>
    );
  }

  if (step === 'resolved') {
    return (
      <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
        Merci — ta plainte est consignée et traitée, pas besoin d’aller
        plus loin. Si le problème revient, tu pourras toujours ouvrir un
        litige depuis cette course.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {existing.length > 0 && (
        <ul className="space-y-2">
          {existing.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm"
            >
              <span className="font-bold text-amber-800">
                Litige ouvert — {DISPUTE_REASON_LABELS[d.reason as keyof typeof DISPUTE_REASON_LABELS] ?? d.reason}
              </span>
              <span
                className={cn(
                  'text-xs font-black px-3 py-1 rounded-full',
                  d.status === 'resolu'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-800'
                )}
              >
                {DISPUTE_STATUS_LABELS[d.status]}
              </span>
            </li>
          ))}
        </ul>
      )}

      {openDispute ? (
        <p className="text-sm text-slate-500">
          Ton litige est en cours d’examen par Stacks Drive.
        </p>
      ) : step === 'auto' && autoReply ? (
        <AutoReplyCard
          reply={autoReply}
          onResolved={() => setStep('resolved')}
          onReject={() => {
            setEscalation({
              reason: 'rejet-reponse-auto',
              disputeReason: disputeReasonForTopic(autoReply.id),
            });
            setStep('escalate');
          }}
        />
      ) : step === 'escalate' && escalation && selectedTopic ? (
        <form onSubmit={submitDispute} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
            <p className="text-sm font-black text-amber-800">
              Transmis à Stacks Drive — un humain va examiner ta course
            </p>
            <p className="text-sm text-amber-700 leading-relaxed">
              {ESCALATION_LABELS[escalation.reason]} Ton litige est ouvert
              avec le motif « {DISPUTE_REASON_LABELS[escalation.disputeReason]} ».
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="dispute-message" className="text-xs font-black uppercase tracking-widest text-slate-500">
              Explique en quelques mots
            </label>
            <textarea
              id="dispute-message"
              rows={3}
              maxLength={1000}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Que s’est-il passé, de ton côté ?"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none resize-y"
            />
          </div>

          {showAmount && (
            <div className="space-y-1.5">
              <label htmlFor="dispute-amount" className="text-xs font-black uppercase tracking-widest text-slate-500">
                Montant concerné (FCFA, facultatif)
              </label>
              <input
                id="dispute-amount"
                type="number"
                min={0}
                step={50}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex : 1 500"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              <DriveAlert size={15} />
              {busy ? 'Envoi…' : 'Transmettre le litige'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEscalation(null);
                setStep('topic');
              }}
              className="px-5 py-2.5 rounded-full text-sm font-black bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              Retour
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Ton litige est transmis à Stacks Drive avec les détails de la
            course. Aucun numéro de téléphone n’est partagé avec l’autre partie.
          </p>
        </form>
      ) : (
        <form onSubmit={submitTopic} className="space-y-4">
          <p className="text-sm text-slate-500">
            Pour les problèmes courants, tu reçois une réponse tout de suite.
            Sinon, ton litige est transmis à Stacks Drive.
          </p>
          <fieldset className="space-y-2">
            <legend className="text-xs font-black uppercase tracking-widest text-slate-500">
              Que s’est-il passé ?
            </legend>
            {topics.map((t) => (
              <label
                key={t.id}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-sm font-bold cursor-pointer transition-colors',
                  topic === t.id
                    ? 'bg-green-50 border-stacks-green text-slate-900'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300'
                )}
              >
                <input
                  type="radio"
                  name="complaint-topic"
                  value={t.id}
                  checked={topic === t.id}
                  onChange={() => setTopic(t.id)}
                  className="accent-green-700"
                />
                {topicLabel(t, myRole)}
              </label>
            ))}
          </fieldset>

          {showAmount && (
            <div className="space-y-1.5">
              <label htmlFor="complaint-amount" className="text-xs font-black uppercase tracking-widest text-slate-500">
                Montant concerné (FCFA, facultatif)
              </label>
              <input
                id="complaint-amount"
                type="number"
                min={0}
                step={50}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex : 1 500"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="complaint-message" className="text-xs font-black uppercase tracking-widest text-slate-500">
              Explique en quelques mots {topic === 'autre' ? '' : '(facultatif)'}
            </label>
            <textarea
              id="complaint-message"
              rows={3}
              maxLength={1000}
              required={topic === 'autre'}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Que s’est-il passé, de ton côté ?"
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none resize-y"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !topic}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <DriveAlert size={15} />
            {busy ? 'Envoi…' : 'Envoyer'}
          </button>
          <p className="text-xs text-slate-400">
            Aucun numéro de téléphone n’est partagé avec l’autre partie.
          </p>
        </form>
      )}
    </div>
  );
}
