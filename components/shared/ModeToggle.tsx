'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Car, User } from 'lucide-react';
import type { ProfileRole } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

/** Bascule de mode Passager / Chauffeur (en-tête, une fois connecté).
 *  Un seul compte : le rôle change dans le profil, ce qui ouvre ou ferme
 *  les actions de chaque mode (commander une course / se mettre en ligne). */
export function ModeToggle({ currentRole }: { currentRole: ProfileRole }) {
  const router = useRouter();
  const [role, setRole] = useState<ProfileRole>(currentRole);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function switchRole(next: ProfileRole) {
    if (next === role || loading) return;
    setError(null);
    setLoading(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: next }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Changement impossible.');
      return;
    }
    setRole(next);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className="inline-flex items-center rounded-full bg-white/5 border border-white/10 p-1"
        role="group"
        aria-label="Mode : passager ou chauffeur"
      >
        {(
          [
            { value: 'passager', label: 'Passager', icon: User },
            { value: 'chauffeur', label: 'Chauffeur', icon: Car },
          ] as const
        ).map((m) => (
          <button
            key={m.value}
            type="button"
            disabled={loading}
            onClick={() => switchRole(m.value)}
            aria-pressed={role === m.value}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all disabled:opacity-60',
              role === m.value
                ? 'bg-ember text-white shadow-md shadow-ember/40'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <m.icon size={14} />
            <span className="hidden xs:inline sm:inline">{m.label}</span>
          </button>
        ))}
      </span>
      {error && <span className="text-[11px] text-red-400 font-bold px-1">{error}</span>}
    </span>
  );
}
