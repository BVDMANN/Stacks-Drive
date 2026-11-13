"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RideStatus } from '@/types';
import { cn } from '@/lib/utils';

/** Fermer / republier une course (son chauffeur). */
export function RideStatusToggle({
  rideId,
  currentStatus,
}: {
  rideId: string;
  currentStatus: RideStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target: RideStatus = currentStatus === 'published' ? 'closed' : 'published';
  const label = currentStatus === 'published' ? 'Fermer' : 'Republier';

  async function toggle() {
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: target }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={toggle}
        className={cn(
          'px-3 py-1.5 rounded-full text-xs font-black transition-colors disabled:opacity-50',
          currentStatus === 'published'
            ? 'bg-white text-red-600 border border-red-200 hover:bg-red-50'
            : 'bg-stacks-green text-white hover:bg-stacks-greenLight'
        )}
      >
        {loading ? '…' : label}
      </button>
      {error && <span className="text-xs text-red-600 font-bold">{error}</span>}
    </span>
  );
}
