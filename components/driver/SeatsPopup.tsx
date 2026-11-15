'use client';

import { useState } from 'react';
import { Loader2, Minus, Plus, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Pop-up « Combien de places libres dans ton véhicule ? » (v2.19).
 *  S'ouvre quand le chauffeur se met en ligne (places déclarées à
 *  ce moment-là) et à tout moment depuis le bouton « Mes places »
 *  (accueil chauffeur / tableau de bord). Le nombre est borné par la
 *  capacité du véhicule déclarée dans son profil — jamais plus.
 *  Groupe = 1 place par passager, Solo = véhicule entier : ce nombre
 *  décide quelles demandes le chauffeur reçoit (voir `lib/seats.ts`). */
export function SeatsPopup({
  capacity,
  freeSeats,
  onClose,
  onSaved,
}: {
  /** Capacité du véhicule (profil chauffeur, 1 à 9). */
  capacity: number;
  /** Places libres actuelles (null = jamais déclarées = capacité). */
  freeSeats: number | null;
  onClose: () => void;
  /** Appelé après enregistrement réussi, avec les places libres. */
  onSaved: (freeSeats: number) => void;
}) {
  const [value, setValue] = useState(freeSeats ?? capacity);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/driver/seats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeSeats: value }),
      });
      const data = await res.json().catch(() => null);
      setSaving(false);
      if (!res.ok) {
        setError(data?.error ?? 'Enregistrement impossible.');
        return;
      }
      onSaved(value);
    } catch {
      setSaving(false);
      setError('Enregistrement impossible pour le moment.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-night-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Places libres dans ton véhicule"
      onClick={onClose}
    >
      <div
        className="bg-night-900 border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4 text-slate-100 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-lg flex items-center gap-2">
              <Users size={20} className="text-sarcelle" />
              Combien de places libres dans ton véhicule ?
            </p>
            <p className="text-sm text-slate-300 mt-1">
              On t’envoie les courses adaptées : en Groupe, 1 place par
              passager — en Solo, le véhicule entier.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300 shrink-0"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 py-2">
          <button
            type="button"
            onClick={() => setValue((v) => Math.max(0, v - 1))}
            disabled={value <= 0 || saving}
            className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
            aria-label="Une place de moins"
          >
            <Minus size={20} />
          </button>
          <div className="text-center min-w-[7rem]">
            <p className="text-5xl font-black text-sarcelle">{value}</p>
            <p className="text-xs font-bold text-slate-400 mt-1">
              place{value > 1 ? 's' : ''} libre{value > 1 ? 's' : ''} / {capacity}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setValue((v) => Math.min(capacity, v + 1))}
            disabled={value >= capacity || saving}
            className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white disabled:opacity-30"
            aria-label="Une place de plus"
          >
            <Plus size={20} />
          </button>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => setValue(capacity)}
            disabled={saving}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-black transition-colors',
              value === capacity ? 'bg-sarcelle text-night-950' : 'bg-white/10 text-slate-200'
            )}
          >
            Toutes ({capacity})
          </button>
          {capacity > 1 && (
            <button
              type="button"
              onClick={() => setValue(1)}
              disabled={saving}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-black transition-colors',
                value === 1 ? 'bg-sarcelle text-night-950' : 'bg-white/10 text-slate-200'
              )}
            >
              1 place
            </button>
          )}
          <button
            type="button"
            onClick={() => setValue(0)}
            disabled={saving}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-black transition-colors',
              value === 0 ? 'bg-sarcelle text-night-950' : 'bg-white/10 text-slate-200'
            )}
          >
            Aucune (plein)
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center">
          {value === 0
            ? 'À 0 place, tu ne reçois plus aucune demande tant que tu ne rouvres pas de places.'
            : value === capacity
              ? 'Véhicule entièrement libre : tu reçois les Groupes et les Solos.'
              : 'Tu reçois les Groupes (taxi partagé) — pas les Solos, qui exigent un véhicule entièrement vide.'}
        </p>

        {error && (
          <p role="alert" className="text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex-1 py-3.5 rounded-full bg-sarcelle text-night-950 text-sm font-black hover:bg-sarcelle/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            {saving ? 'Enregistrement…' : 'Valider mes places'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-5 py-3.5 rounded-full bg-white/10 text-sm font-black hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
