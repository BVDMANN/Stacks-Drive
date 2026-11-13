'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Actions sur une course : démarrer / terminer (chauffeur), annuler,
 *  noter après course (1 à 5 étoiles). */
export function RideActions({
  rideId,
  canStart,
  canComplete,
  canCancel,
  canRateDriver,
  canRatePassenger,
}: {
  rideId: string;
  canStart: boolean;
  canComplete: boolean;
  canCancel: boolean;
  canRateDriver: boolean;
  canRatePassenger: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stars, setStars] = useState(5);
  const [rated, setRated] = useState(false);

  async function act(action: 'cancel' | 'start' | 'complete' | 'rate', rating?: number) {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...(rating ? { rating } : {}) }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    if (action === 'rate') setRated(true);
    router.refresh();
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
          <button
            type="button"
            disabled={busy}
            onClick={() => act('start')}
            className="px-5 py-3 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
          >
            Passager à bord — démarrer
          </button>
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
        {canCancel && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act('cancel')}
            className="px-5 py-3 rounded-full text-sm font-black bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            Annuler la course
          </button>
        )}
      </div>
      {(canRateDriver || canRatePassenger) && !rated && (
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3">
          <p className="font-black text-slate-900 text-sm">
            {canRateDriver ? 'Note ton chauffeur' : 'Note ton passager'}
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
          <button
            type="button"
            disabled={busy}
            onClick={() => act('rate', stars)}
            className="px-5 py-2.5 rounded-full text-sm font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            Envoyer ma note
          </button>
        </div>
      )}
      {rated && (
        <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          Merci pour ta note !
        </p>
      )}
    </div>
  );
}
