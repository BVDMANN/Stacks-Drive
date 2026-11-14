'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CelebrationPopup, type CelebrationData } from '@/components/driver/CelebrationPopup';
import { CancelRideDialog } from '@/components/rides/CancelRideDialog';
import type { CancelReasonCode, CancelRole } from '@/lib/cancellations';

/** Actions sur une course : démarrer / terminer (chauffeur), annuler.
 *  Le démarrage passe par le code PIN (composant PinEntry) ; la note
 *  après course se fait dans le formulaire d'avis (FeedbackForm, v2.2).
 *  À la clôture, la popup de célébration s'affiche (gains gardés).
 *  Annulation (v2.23) : motif obligatoire dans une liste courte —
 *  l'autre partie est prévenue immédiatement, l'annulation est
 *  comptée dans la fiabilité. */
export function RideActions({
  rideId,
  myRole,
  canStart,
  canComplete,
  canCancel,
  canRelaunch,
}: {
  rideId: string;
  /** Rôle de celui qui consulte la course (motifs proposés). */
  myRole: CancelRole;
  canStart: boolean;
  canComplete: boolean;
  canCancel: boolean;
  /** Relancer une course planifiée expirée (v2.30, passager). */
  canRelaunch?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function act(action: 'start' | 'complete') {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    if (action === 'complete' && data?.celebration) {
      setCelebration(data.celebration as CelebrationData);
    }
    router.refresh();
  }

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
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {canStart && (
          <p className="text-sm text-slate-500">
            Utilise le code à 4 chiffres du passager pour démarrer (ci-dessus).
          </p>
        )}
        {canComplete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act('complete')}
            className="px-5 py-3 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
          >
            Course terminée
          </button>
        )}
        {canRelaunch && (
          <button
            type="button"
            disabled={busy}
            onClick={relaunch}
            className="px-5 py-3 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
          >
            {busy ? 'Envoi…' : 'Relancer maintenant'}
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setCancelOpen(true)}
            className="px-5 py-3 rounded-full text-sm font-black bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Annuler la course
          </button>
        )}
      </div>
      <CancelRideDialog
        open={cancelOpen}
        role={myRole}
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
      />
      {celebration && (
        <CelebrationPopup celebration={celebration} onClose={() => setCelebration(null)} />
      )}
    </div>
  );
}
