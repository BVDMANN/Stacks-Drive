"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Basculer la vérification d'un chauffeur (admin uniquement). */
export function VerifyDriverToggle({
  driverId,
  isVerified,
}: {
  driverId: string;
  isVerified: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setLoading(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, isVerified: !isVerified }),
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
          'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black transition-colors disabled:opacity-50',
          isVerified
            ? 'bg-green-100 text-green-800 hover:bg-green-200'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        )}
      >
        <BadgeCheck size={14} />
        {loading ? '…' : isVerified ? 'Vérifié' : 'Vérifier'}
      </button>
      {error && <span className="text-xs text-red-600 font-bold">{error}</span>}
    </span>
  );
}
