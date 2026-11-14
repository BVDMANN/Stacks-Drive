'use client';

import { useState } from 'react';

/** « Reprendre avec ce chauffeur » (v2.34) : depuis l'historique,
 *  ajoute le chauffeur aux favoris du passager — la prochaine
 *  demande pourra lui partir en priorité (30 s d'exclusivité). */
export function FavoriteButton({ driverId, driverName }: { driverId: string; driverName: string | null }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');

  async function add() {
    setState('busy');
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId }),
      });
      setState(res.ok ? 'done' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <p className="text-xs font-black text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
        Favori ajouté — choisis « {driverName ?? 'ce chauffeur'} » dans ta prochaine demande.
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={state === 'busy'}
      onClick={add}
      className="px-3 py-1.5 rounded-full text-xs font-black bg-white border-2 border-slate-300 text-slate-800 hover:border-stacks-green disabled:opacity-50"
    >
      {state === 'busy' ? 'Ajout…' : 'Reprendre avec ce chauffeur'}
      {state === 'error' ? ' — réessaie' : ''}
    </button>
  );
}
