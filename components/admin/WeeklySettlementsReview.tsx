'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import type {
  SettlementDeclaration,
  WeeklyReport,
  WeeklySettlement,
} from '@/lib/settlement-types';
import { formatWeekLabel } from '@/lib/settlement-types';
import { formatFcfa } from '@/lib/commission';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/utils';

/** Relevés hebdo + déclarations « J'ai payé » + dernier rapport hebdo
 *  (admin, v2.15). La validation d'une déclaration se fait en 1 clic :
 *  elle devient un règlement classique et la dette du chauffeur baisse. */
export function WeeklySettlementsReview({
  statements,
  declarations,
  latestReport,
}: {
  statements: WeeklySettlement[];
  declarations: SettlementDeclaration[];
  latestReport: WeeklyReport | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function review(declarationId: string, action: 'validate' | 'reject') {
    setError(null);
    setMessage(null);
    setBusy(declarationId);
    const res = await fetch('/api/admin/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ declarationId, action }),
    });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    setMessage(
      action === 'validate'
        ? 'Règlement validé — la dette du chauffeur a baissé.'
        : 'Déclaration refusée.'
    );
    router.refresh();
  }

  const pending = declarations.filter((d) => d.status === 'declare');

  return (
    <div className="space-y-6">
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

      {/* Dernier rapport hebdo */}
      {latestReport && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm space-y-1">
          <p className="font-black text-slate-900">
            Dernier rapport — {formatWeekLabel(latestReport.weekStart, latestReport.weekEnd)}
            {' '}· e-mail {latestReport.emailSent ? 'envoyé' : 'non envoyé'}
          </p>
          <p className="text-slate-600">
            {latestReport.ridesCount} course{latestReport.ridesCount > 1 ? 's' : ''} terminée{latestReport.ridesCount > 1 ? 's' : ''}
            {' '}· commission {formatFcfa(latestReport.commissionTotal)}
            {' '}· {latestReport.newDrivers} nouveau{latestReport.newDrivers > 1 ? 'x' : ''} chauffeur{latestReport.newDrivers > 1 ? 's' : ''}
            {' '}· {latestReport.openDisputes} litige{latestReport.openDisputes > 1 ? 's' : ''} ouvert{latestReport.openDisputes > 1 ? 's' : ''}
          </p>
          {latestReport.alerts.length > 0 && (
            <ul className="pt-1 space-y-1">
              {latestReport.alerts.map((a, i) => (
                <li key={i} className="text-amber-800 font-bold">⚠ {a.label}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Déclarations en attente */}
      <div>
        <h3 className="font-black text-slate-900">
          Déclarations « J’ai payé » en attente ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-500 mt-1">Aucune déclaration en attente.</p>
        ) : (
          <ul className="divide-y divide-slate-100 mt-2">
            {pending.map((d) => (
              <li key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">
                    {d.driverName ?? 'Sans nom'} · {formatFcfa(d.amount)}
                    {d.reference ? ` · réf. ${d.reference}` : ''}
                  </p>
                  <p className="text-slate-500">
                    {d.method === 'mobile_money' ? 'Mobile Money' : d.method}
                    {' '}· déclaré {timeAgo(d.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => review(d.id, 'validate')}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
                  >
                    <Check size={14} /> Valider (1 clic)
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => review(d.id, 'reject')}
                    className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-black bg-white border border-red-300 text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <X size={14} /> Refuser
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Relevés générés */}
      <div>
        <h3 className="font-black text-slate-900">
          Relevés hebdo générés ({statements.length})
        </h3>
        {statements.length === 0 ? (
          <p className="text-sm text-slate-500 mt-1">
            Aucun relevé pour le moment — le premier est généré le lundi
            suivant la première semaine avec des courses.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 mt-2">
            {statements.map((s) => (
              <li key={s.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">
                    {s.driverName ?? 'Sans nom'} · {formatWeekLabel(s.weekStart, s.weekEnd)}
                  </p>
                  <p className="text-slate-500">
                    {s.ridesCount} course{s.ridesCount > 1 ? 's' : ''} · commission {formatFcfa(s.commissionDue)}
                    {' '}· dette totale {formatFcfa(s.debtTotal)}
                    {' '}· dépôt {s.depositPaid ? 'versé' : 'non versé'}
                  </p>
                </div>
                <span
                  className={cn(
                    'text-xs font-black px-3 py-1.5 rounded-full border',
                    s.status === 'valide'
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : s.status === 'declare'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200'
                  )}
                >
                  {s.status === 'valide' ? 'Réglé' : s.status === 'declare' ? 'Déclaré' : 'Généré'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
