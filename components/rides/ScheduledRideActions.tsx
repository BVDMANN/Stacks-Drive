'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CancelRideDialog } from '@/components/rides/CancelRideDialog';
import type { CancelReasonCode } from '@/lib/cancellations';

/** Actions d'une course planifiée / expirée (v2.30) dans « Mes
 *  courses » : annuler avant l'envoi (motif obligatoire, comme les
 *  autres annulations), relancer une course expirée tout de suite
 *  (même trajet, mêmes conditions). */
export function ScheduledRideActions({
  rideId,
  status,
}: {
  rideId: string;
  status: 'planifiee' | 'expiree';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function relaunch() {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'relaunch' }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Relance impossible.');
      return;
    }
    router.refresh();
  }

  async function confirmCancel(reasonCode: CancelReasonCode, detail: string | null): Promise<boolean> {
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', reasonCode, reason: detail }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? 'Annulation impossible.');
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <p role="alert" className="w-full text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {status === 'expiree' && (
        <button
          type="button"
          disabled={busy}
          onClick={relaunch}
          className="px-4 py-2 rounded-full text-xs font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
        >
          {busy ? 'Envoi…' : 'Relancer maintenant'}
        </button>
      )}
      {status === 'planifiee' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => setCancelOpen(true)}
          className="px-4 py-2 rounded-full text-xs font-black bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          Annuler la course planifiée
        </button>
      )}
      <CancelRideDialog
        open={cancelOpen}
        role="passager"
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
      />
    </div>
  );
}
