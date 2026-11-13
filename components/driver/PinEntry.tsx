'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldAlert } from 'lucide-react';

/** Saisie du code PIN à 4 chiffres (v2.2) : le passager donne son code
 *  au chauffeur, qui le tape pour démarrer le trajet. 5 codes faux =
 *  course verrouillée (l'admin seul déverrouille). */
export function PinEntry({
  rideId,
  onStarted,
  refreshOnStart = false,
}: {
  rideId: string;
  onStarted?: () => void;
  /** Rafraîchir la page après démarrage (pages serveur). */
  refreshOnStart?: boolean;
}) {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[0-9]{4}$/.test(pin)) {
      setError('Le code fait 4 chiffres.');
      return;
    }
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', pin }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Code impossible à vérifier.');
      if (typeof data?.attemptsLeft === 'number') setAttemptsLeft(data.attemptsLeft);
      if (data?.locked) setLocked(true);
      return;
    }
    if (refreshOnStart) router.refresh();
    onStarted?.();
  }

  if (locked) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 space-y-2">
        <p className="font-black text-red-800 flex items-center gap-1.5">
          <ShieldAlert size={16} /> Course verrouillée
        </p>
        <p className="text-sm text-red-700">
          5 codes faux ont été saisis. Contacte Stacks Drive pour débloquer
          la course — ne réessaie pas.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-night-900 border border-white/10 rounded-2xl p-4 space-y-3 text-slate-100">
      <p className="font-black flex items-center gap-1.5">
        <KeyRound size={16} className="text-gold" />
        Code du passager
      </p>
      <p className="text-sm text-slate-400">
        Demande le code à 4 chiffres à ton passager et tape-le ici pour
        démarrer le trajet. Il s’affiche sur son écran.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
          {attemptsLeft !== null && !locked && (
            <> Il te reste {attemptsLeft} essai{attemptsLeft > 1 ? 's' : ''}.</>
          )}
        </p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={4}
          required
          pattern="[0-9]{4}"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder="••••"
          aria-label="Code à 4 chiffres du passager"
          className="flex-1 min-w-0 px-4 py-3.5 rounded-xl bg-white/5 border border-white/15 text-center text-2xl font-black tracking-[0.5em] placeholder:text-slate-600 focus:border-gold focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || pin.length !== 4}
          className="px-5 py-3.5 rounded-xl bg-ember text-white text-sm font-black shadow-md hover:bg-ember-light transition-colors disabled:opacity-50"
        >
          {busy ? 'Vérification…' : 'Démarrer'}
        </button>
      </div>
    </form>
  );
}
