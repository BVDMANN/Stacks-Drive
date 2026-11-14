'use client';

import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { formatFcfa } from '@/lib/commission';
import { formatWeekLabel } from '@/lib/settlement-types';
import type { SettlementDeclaration, WeeklySettlement } from '@/lib/settlement-types';
import { cn } from '@/lib/utils';

/** Relevé hebdo + « J'ai payé » (v2.15) — tableau de bord chauffeur.
 *  Affiche le relevé de la semaine généré le lundi (courses, commission
 *  due, dette totale, dépôt) et permet de déclarer le transfert
 *  (montant + référence libre). La déclaration ne réduit la dette que
 *  quand l'admin l'a validée. */
export function WeeklySettlementCard() {
  const [statement, setStatement] = useState<WeeklySettlement | null>(null);
  const [declarations, setDeclarations] = useState<SettlementDeclaration[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch('/api/driver/settlements')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setStatement(d.statement ?? null);
          setDeclarations(d.declarations ?? []);
          if (d.statement && !amount) {
            setAmount(String(d.statement.debtTotal > 0 ? d.statement.debtTotal : d.statement.commissionDue));
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!statement) return;
    setError(null);
    setBusy(true);
    const res = await fetch('/api/driver/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weeklySettlementId: statement.id,
        amount: Number(amount),
        method: 'mobile_money',
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Déclaration impossible.');
      return;
    }
    setDone(true);
  }

  if (!loaded) return null;
  if (!statement) {
    return (
      <p className="text-sm text-slate-500">
        Pas encore de relevé hebdomadaire — il est généré chaque lundi pour
        les chauffeurs ayant roulé la semaine passée.
      </p>
    );
  }

  const pendingDeclaration = declarations.find((d) => d.status === 'declare');
  const validatedDeclaration = declarations.find(
    (d) => d.status === 'valide' && d.weeklySettlementId === statement.id
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="bg-slate-50 rounded-2xl p-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Courses</p>
          <p className="font-black text-stacks-navy mt-1">{statement.ridesCount}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Commission due</p>
          <p className="font-black text-stacks-navy mt-1">{formatFcfa(statement.commissionDue)}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Dette totale</p>
          <p className="font-black text-stacks-navy mt-1">{formatFcfa(statement.debtTotal)}</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-3">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">Dépôt</p>
          <p className="font-black text-stacks-navy mt-1">
            {statement.depositPaid ? 'Versé' : 'Non versé'}
          </p>
        </div>
      </div>
      <p className="text-sm text-slate-500">
        Relevé de la {formatWeekLabel(statement.weekStart, statement.weekEnd)}.
      </p>

      {validatedDeclaration && (
        <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          Règlement de {formatFcfa(validatedDeclaration.amount)} validé par
          Stacks Drive — merci !
        </p>
      )}

      {pendingDeclaration && !done && (
        <p className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Déclaration de {formatFcfa(pendingDeclaration.amount)} envoyée — en
          attente de validation par Stacks Drive.
        </p>
      )}

      {done && (
        <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          Déclaration envoyée — Stacks Drive la validera après réception du
          transfert.
        </p>
      )}

      {statement.status !== 'valide' && !pendingDeclaration && !done && statement.debtTotal > 0 && (
        <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-3">
          <p className="text-sm font-bold text-slate-900">
            Tu as réglé par Mobile Money ? Dis-le ici.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="number"
              min={1}
              step={50}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Montant transféré (FCFA)"
              aria-label="Montant transféré en FCFA"
              className="w-48 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
            />
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Référence du transfert (facultatif)"
              aria-label="Référence du transfert"
              maxLength={100}
              className="flex-1 min-w-52 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !(Number(amount) > 0)}
              className={cn(
                'inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-sm font-black',
                'bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors disabled:opacity-50'
              )}
            >
              <Wallet size={15} />
              {busy ? 'Envoi…' : 'J’ai payé'}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}
          <p className="text-xs text-slate-400">
            Un seul transfert Mobile Money (Airtel Money / Moov Money) vers le
            numéro de Stacks Drive, puis « J’ai payé » ici. Ta dette ne baisse
            qu’une fois le règlement validé par Stacks Drive.
          </p>
        </form>
      )}
    </div>
  );
}
