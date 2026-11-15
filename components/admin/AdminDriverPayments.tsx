'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DriveKey, DriveShield, DriveWallet } from '@/components/icons/DriveUi';
import type { AdminDriverMoney } from '@/lib/earnings';
import { DEPOSIT_FCFA } from '@/lib/gamification';
import { formatFcfa } from '@/lib/commission';
import { cn } from '@/lib/utils';

export interface LockedRide {
  id: string;
  pickup: string;
  destination: string;
  pinAttempts: number;
}

/** Dépôts & règlements (admin, v2.2) : pour chaque chauffeur, dépôt de
 *  garantie, commissions dues, et formulaires pour enregistrer un dépôt
 *  (payé en P2P hors appli) ou un règlement hebdomadaire reçu.
 *  + courses verrouillées après 5 codes PIN faux (à débloquer). */
export function AdminDriverPayments({
  drivers,
  lockedRides,
}: {
  drivers: AdminDriverMoney[];
  lockedRides: LockedRide[];
}) {
  const router = useRouter();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(
    action: 'deposit' | 'settlement' | 'unlock_pin',
    payload: Record<string, unknown>
  ) {
    setError(null);
    setMessage(null);
    setBusy(`${action}-${(payload.driverId as string) ?? (payload.rideId as string)}`);
    const res = await fetch('/api/admin/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    setMessage(
      action === 'deposit'
        ? 'Dépôt enregistré.'
        : action === 'settlement'
          ? 'Règlement enregistré.'
          : 'Course déverrouillée.'
    );
    router.refresh();
  }

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

      {drivers.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun chauffeur inscrit pour le moment.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {drivers.map((d) => {
            const key = d.driverId;
            const amount = Number(amounts[key] ?? '');
            return (
              <li key={key} className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <p className="font-bold text-slate-900">
                      {d.name ?? 'Sans nom'} · {d.phone ?? '—'} · niveau {d.tier}
                    </p>
                    <p className="text-slate-500">
                      {d.completedRides} course{d.completedRides > 1 ? 's' : ''} terminée{d.completedRides > 1 ? 's' : ''} ·{' '}
                      commissions {formatFcfa(d.totalCommission)} · réglées {formatFcfa(d.totalSettled)} ·{' '}
                      <strong className={cn(d.owed > 0 ? 'text-red-700' : 'text-green-700')}>
                        dû : {formatFcfa(d.owed)}
                      </strong>
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-xs font-black px-3 py-1.5 rounded-full border inline-flex items-center gap-1',
                      d.depositPaid
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    )}
                  >
                    <DriveShield size={13} />
                    {d.depositPaid
                      ? `Dépôt ${formatFcfa(d.depositAmount)} versé`
                      : 'Dépôt non versé'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={50}
                    value={amounts[key] ?? ''}
                    onChange={(e) => setAmounts((a) => ({ ...a, [key]: e.target.value }))}
                    placeholder="Montant (FCFA)"
                    aria-label={`Montant pour ${d.name ?? 'ce chauffeur'}`}
                    className="w-40 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
                  />
                  {!d.depositPaid && (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        act('deposit', { driverId: key, amount: amount > 0 ? amount : DEPOSIT_FCFA })
                      }
                      className="px-4 py-2 rounded-full text-sm font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      Enregistrer le dépôt ({formatFcfa(DEPOSIT_FCFA)})
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy !== null || !(amount > 0)}
                    onClick={() => act('settlement', { driverId: key, amount })}
                    className="px-4 py-2 rounded-full text-sm font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
                  >
                    <DriveWallet size={14} className="inline mr-1" />
                    Enregistrer un règlement
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Courses verrouillées (5 codes PIN faux) */}
      <div className="space-y-3">
        <h3 className="font-black text-slate-900 flex items-center gap-1.5">
          <DriveKey size={16} className="text-red-600" />
          Courses verrouillées ({lockedRides.length})
        </h3>
        {lockedRides.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune course verrouillée.</p>
        ) : (
          <ul className="space-y-2">
            {lockedRides.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 bg-red-50 border border-red-200 rounded-2xl p-3">
                <p className="text-sm font-bold text-red-800">
                  {r.pickup} → {r.destination} · {r.pinAttempts} codes faux
                </p>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => act('unlock_pin', { rideId: r.id })}
                  className="px-4 py-2 rounded-full text-sm font-black bg-white border border-red-300 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Déverrouiller
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
