"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BookingStatus } from '@/types';
import { cn } from '@/lib/utils';

const ACTIONS: { status: BookingStatus; label: string; className: string }[] = [
  { status: 'confirmed', label: 'Confirmer', className: 'bg-blue-600 text-white hover:bg-blue-700' },
  { status: 'completed', label: 'Terminée', className: 'bg-green-600 text-white hover:bg-green-700' },
  { status: 'cancelled', label: 'Annuler', className: 'bg-white text-red-600 border border-red-200 hover:bg-red-50' },
];

/** Actions du chauffeur sur une réservation de ses courses. */
export function BookingStatusSelect({
  bookingId,
  currentStatus,
}: {
  bookingId: string;
  currentStatus: BookingStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<BookingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (currentStatus === 'cancelled' || currentStatus === 'completed') {
    return null;
  }

  async function change(status: BookingStatus) {
    setError(null);
    setLoading(status);
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => null);
    setLoading(null);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ACTIONS.filter((a) =>
        currentStatus === 'pending' ? a.status !== 'completed' : a.status !== 'confirmed'
      ).map((a) => (
        <button
          key={a.status}
          type="button"
          disabled={loading !== null}
          onClick={() => change(a.status)}
          className={cn(
            'px-3 py-1.5 rounded-full text-xs font-black transition-colors disabled:opacity-50',
            a.className
          )}
        >
          {loading === a.status ? '…' : a.label}
        </button>
      ))}
      {error && <span className="text-xs text-red-600 font-bold">{error}</span>}
    </div>
  );
}

/** Bouton d'annulation pour le passager (sa propre réservation). */
export function CancelBookingButton({
  bookingId,
  currentStatus,
}: {
  bookingId: string;
  currentStatus: BookingStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (currentStatus === 'cancelled' || currentStatus === 'completed') {
    return null;
  }

  async function cancel() {
    if (!window.confirm('Annuler cette réservation ? La place sera libérée.')) return;
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/bookings/${bookingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Annulation impossible.');
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={cancel}
        className="px-4 py-2 rounded-full text-xs font-black bg-white text-red-600 border border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {loading ? '…' : 'Annuler la réservation'}
      </button>
      {error && <span className="text-xs text-red-600 font-bold">{error}</span>}
    </span>
  );
}
