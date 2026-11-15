'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DriveAlert, DriveCheckBadge, DriveRefresh, DriveXCircle } from '@/components/icons/DriveUi';
import { timeAgo } from '@/lib/dates';
import { URGENCY_LABELS, type TicketUrgency } from '@/lib/verification';
import { ticketCheckLines, type VerificationTicket } from '@/lib/tickets';
import { cn } from '@/lib/utils';

export type TicketWithUrls = VerificationTicket & {
  selfieUrl: string | null;
  documentUrl: string | null;
};

const URGENCY_STYLES: Record<TicketUrgency, string> = {
  critique: 'bg-red-100 text-red-800 border-red-200',
  haute: 'bg-orange-100 text-orange-800 border-orange-200',
  moyenne: 'bg-amber-100 text-amber-800 border-amber-200',
  basse: 'bg-slate-100 text-slate-600 border-slate-200',
};

const URGENCY_DOT: Record<TicketUrgency, string> = {
  critique: 'bg-red-600',
  haute: 'bg-orange-500',
  moyenne: 'bg-amber-500',
  basse: 'bg-slate-400',
};

/** File des tickets de vérification (v2.4) : seuls les dossiers que
 *  les contrôles automatiques n'ont pas pu trancher arrivent ici —
 *  triés par urgence, avec le détail des contrôles, les documents du
 *  chauffeur, et trois actions : approuver, refuser, demander de refaire. */
export function VerificationTickets({
  tickets,
  emailConfigured,
}: {
  tickets: TicketWithUrls[];
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [urgencyFilter, setUrgencyFilter] = useState<'toutes' | TicketUrgency>('toutes');
  const [statusFilter, setStatusFilter] = useState<'ouverts' | 'resolus' | 'tous'>('ouverts');
  const [openId, setOpenId] = useState<string | null>(null);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [noteAction, setNoteAction] = useState<'refuse' | 'refaire'>('refuse');
  const [note, setNote] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCount = tickets.filter((t) => t.status === 'ouvert').length;

  const visible = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter === 'ouverts' && t.status !== 'ouvert') return false;
      if (statusFilter === 'resolus' && t.status !== 'resolu') return false;
      if (urgencyFilter !== 'toutes' && t.urgency !== urgencyFilter) return false;
      return true;
    });
  }, [tickets, urgencyFilter, statusFilter]);

  async function decide(ticketId: string, decision: 'verifie' | 'refuse' | 'refaire', verificationNote?: string) {
    setError(null);
    setLoadingId(ticketId);
    const res = await fetch('/api/admin/tickets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, decision, note: verificationNote }),
    });
    const data = await res.json().catch(() => null);
    setLoadingId(null);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    setNoteId(null);
    setNote('');
    setOpenId(null);
    router.refresh();
  }

  if (tickets.length === 0) {
    return (
      <div className="space-y-3">
        {!emailConfigured && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
            E-mails non configurés : les tickets sont visibles ici, mais aucun
            e-mail n’est envoyé à l’administrateur. Ajoutez RESEND_API_KEY
            (voir SETUP.md, section v2.4).
          </p>
        )}
        <p className="text-sm text-slate-500">
          Aucun ticket — les contrôles automatiques tranchent la plupart des
          dossiers sans intervention.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!emailConfigured && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          E-mails non configurés : les tickets sont visibles ici, mais aucun
          e-mail n’est envoyé à l’administrateur. Ajoutez RESEND_API_KEY
          (voir SETUP.md, section v2.4).
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-black uppercase tracking-widest text-slate-400" htmlFor="ticket-urgency">
          Urgence
        </label>
        <select
          id="ticket-urgency"
          value={urgencyFilter}
          onChange={(e) => setUrgencyFilter(e.target.value as 'toutes' | TicketUrgency)}
          className="px-3 py-2 rounded-full bg-white border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none"
        >
          <option value="toutes">Toutes ({openCount} ouverts)</option>
          {(['critique', 'haute', 'moyenne', 'basse'] as TicketUrgency[]).map((u) => (
            <option key={u} value={u}>
              {URGENCY_LABELS[u]}
            </option>
          ))}
        </select>
        <label className="text-xs font-black uppercase tracking-widest text-slate-400" htmlFor="ticket-status">
          Statut
        </label>
        <select
          id="ticket-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'ouverts' | 'resolus' | 'tous')}
          className="px-3 py-2 rounded-full bg-white border border-slate-200 text-sm font-bold text-slate-700 focus:outline-none"
        >
          <option value="ouverts">Ouverts</option>
          <option value="resolus">Résolus</option>
          <option value="tous">Tous</option>
        </select>
      </div>

      {visible.length === 0 && (
        <p className="text-sm text-slate-500">Aucun ticket avec ces filtres.</p>
      )}

      {visible.map((t) => {
        const expanded = openId === t.id;
        return (
          <article
            key={t.id}
            className={cn(
              'border rounded-3xl p-4 sm:p-5 space-y-4',
              t.status === 'ouvert' ? 'border-slate-200' : 'border-slate-100 opacity-70'
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : t.id)}
                className="text-left min-w-0"
              >
                <span className="flex items-center gap-2">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', URGENCY_DOT[t.urgency])} />
                  <span className="font-black text-slate-900 text-lg">
                    {t.driverName ?? 'Sans nom'}
                  </span>
                  <span
                    className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-black border',
                      URGENCY_STYLES[t.urgency]
                    )}
                  >
                    {URGENCY_LABELS[t.urgency]}
                  </span>
                </span>
                <span className="block text-sm text-slate-500 mt-1">
                  {t.kindLabel} · {t.driverEmail}
                  {t.driverPhone ? ` · ${t.driverPhone}` : ''} · {timeAgo(t.createdAt)}
                </span>
                <span className="block text-sm font-bold text-slate-700 mt-1">{t.summary}</span>
              </button>
              <span
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-black',
                  t.status === 'ouvert' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                )}
              >
                {t.status === 'ouvert' ? 'Ouvert' : 'Résolu'}
              </span>
            </div>

            {expanded && (
              <div className="space-y-4 pt-1">
                {/* Compte rendu des contrôles */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">
                    Compte rendu des contrôles automatiques
                  </p>
                  <ul className="space-y-1">
                    {ticketCheckLines(t).map((line, i) => (
                      <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                        <DriveAlert size={15} className="text-amber-600 shrink-0 mt-0.5" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  {t.emailSentAt && (
                    <p className="text-xs text-slate-400 mt-2">
                      E-mail envoyé à l’administrateur le {timeAgo(t.emailSentAt)}.
                    </p>
                  )}
                  {!t.emailSentAt && t.status === 'ouvert' && (
                    <p className="text-xs text-slate-400 mt-2">
                      Aucun e-mail envoyé pour ce ticket (Resend non configuré ou envoi en échec).
                    </p>
                  )}
                </div>

                {/* Documents */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <figure className="space-y-1.5">
                    <figcaption className="text-xs font-black uppercase tracking-widest text-slate-400">
                      Selfie
                    </figcaption>
                    {t.selfieUrl ? (
                      <img src={t.selfieUrl} alt={`Selfie de ${t.driverName ?? 'chauffeur'}`} className="w-full max-w-xs rounded-2xl border border-slate-200 object-cover" />
                    ) : (
                      <p className="text-sm text-slate-400">Aucun selfie.</p>
                    )}
                  </figure>
                  <figure className="space-y-1.5">
                    <figcaption className="text-xs font-black uppercase tracking-widest text-slate-400">
                      Pièce d’identité ({t.documentType === 'cni' ? 'CNI' : t.documentType === 'passeport' ? 'Passeport' : t.documentType === 'permis' ? 'Permis' : '—'})
                    </figcaption>
                    {t.documentUrl ? (
                      <img src={t.documentUrl} alt={`Pièce de ${t.driverName ?? 'chauffeur'}`} className="w-full max-w-xs rounded-2xl border border-slate-200 object-cover" />
                    ) : (
                      <p className="text-sm text-slate-400">Aucune pièce.</p>
                    )}
                  </figure>
                </div>

                {/* Actions */}
                {t.status === 'ouvert' && (
                  <>
                    {noteId === t.id ? (
                      <div className="space-y-3 bg-red-50 border border-red-200 rounded-2xl p-4">
                        <label htmlFor={`ticket-note-${t.id}`} className="text-sm font-bold text-red-800">
                          {noteAction === 'refuse'
                            ? 'Motif du refus (visible par le chauffeur)'
                            : 'Ce que le chauffeur doit refaire (visible par lui)'}
                        </label>
                        <textarea
                          id={`ticket-note-${t.id}`}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder={
                            noteAction === 'refuse'
                              ? 'Ex : pièce expirée, nom différent du compte…'
                              : 'Ex : reprends ton selfie bien éclairé, visage visible, et photographie ta pièce bien à plat.'
                          }
                          rows={2}
                          className="w-full px-3 py-2.5 rounded-xl bg-white border border-red-200 text-sm focus:border-red-400 focus:outline-none"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={loadingId === t.id || note.trim().length < 3}
                            onClick={() => decide(t.id, noteAction, note.trim())}
                            className="px-5 py-2.5 rounded-full text-sm font-black bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            Confirmer
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setNoteId(null);
                              setNote('');
                            }}
                            className="px-5 py-2.5 rounded-full text-sm font-black bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={loadingId === t.id}
                          onClick={() => decide(t.id, 'verifie')}
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
                        >
                          <DriveCheckBadge size={16} /> Approuver — chauffeur vérifié
                        </button>
                        <button
                          type="button"
                          disabled={loadingId === t.id}
                          onClick={() => {
                            setNoteId(t.id);
                            setNoteAction('refaire');
                            setNote('');
                          }}
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-white border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
                        >
                          <DriveRefresh size={16} /> Demander de refaire
                        </button>
                        <button
                          type="button"
                          disabled={loadingId === t.id}
                          onClick={() => {
                            setNoteId(t.id);
                            setNoteAction('refuse');
                            setNote('');
                          }}
                          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                        >
                          <DriveXCircle size={16} /> Refuser
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
