'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DriveAlert, DriveMic, DriveShield } from '@/components/icons/DriveUi';
import { tripAudioRecorder } from '@/lib/trip-audio';

/** RideCheck + audio de trajet pendant une course en cours (v2.34).
 *
 *  Côté passager : sondage de l'état RideCheck (toutes les 20 s) —
 *  un check-in confirmé s'affiche (« Tout va bien ? ») avec « Oui »
 *  / « Problème ». Sans réponse sous 3 min, ou sur « Problème »,
 *  l'admin est alerté (côté serveur) ; la course continue dans tous
 *  les cas, le chauffeur n'est jamais bloqué.
 *  Côté chauffeur : la position du navigateur est partagée toutes
 *  les 30 s vers l'évaluation RideCheck (long arrêt, déviation,
 *  course anormalement longue — seuils prudents, confirmation
 *  double, jamais d'alerte sur un cas isolé).
 *  Audio (les deux parties) : enregistrement chiffré sur l'appareil
 *  (AES-GCM, clé par course), envoyé UNIQUEMENT si un litige est
 *  ouvert sur la course — jamais écouté sans litige, supprimé après
 *  7 jours sans litige. L'indicateur ci-dessous informe visiblement
 *  les deux parties pendant la course.
 */
export function RideCheckPanel({
  rideId,
  role,
}: {
  rideId: string;
  role: 'passager' | 'chauffeur';
}) {
  const [pending, setPending] = useState<{ signal: string; label: string; detail: string | null }[]>([]);
  const [answered, setAnswered] = useState(false);
  const [answerBusy, setAnswerBusy] = useState(false);
  const [audioState, setAudioState] = useState<'off' | 'recording' | 'denied'>('off');
  const [audioError, setAudioError] = useState<string | null>(null);
  const lastPostRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/rides/${rideId}/ridecheck`);
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setPending(data.pending ?? []);
        if ((data.pending ?? []).length === 0 && (data.answered ?? []).length > 0) setAnswered(true);
      }
    } catch {
      /* sondage best-effort */
    }
  }, [rideId]);

  // Passager : sondage des check-ins. Chauffeur : partage de position.
  useEffect(() => {
    if (role !== 'passager') return;
    load();
    const t = window.setInterval(load, 20000);
    return () => window.clearInterval(t);
  }, [role, load]);

  useEffect(() => {
    if (role !== 'chauffeur' || !navigator.geolocation) return;
    const post = (lat: number, lng: number) => {
      const now = Date.now();
      if (now - lastPostRef.current < 30000) return;
      lastPostRef.current = now;
      fetch(`/api/rides/${rideId}/ridecheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      }).catch(() => undefined);
    };
    const watchId = navigator.geolocation.watchPosition(
      (pos) => post(pos.coords.latitude, pos.coords.longitude),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [role, rideId]);

  async function answer(signal: string, answer: 'ok' | 'problem') {
    setAnswerBusy(true);
    try {
      const res = await fetch(`/api/rides/${rideId}/ridecheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal, answer }),
      });
      if (res.ok) {
        setPending((p) => p.filter((x) => x.signal !== signal));
        setAnswered(true);
      }
    } finally {
      setAnswerBusy(false);
    }
  }

  async function startAudio() {
    const res = await tripAudioRecorder.start();
    if (res.ok) {
      setAudioState('recording');
      setAudioError(null);
    } else {
      setAudioState('denied');
      setAudioError(res.error ?? 'Enregistrement impossible.');
    }
  }

  function stopAudio() {
    tripAudioRecorder.stop();
    setAudioState('off');
  }

  const checkin = pending[0] ?? null;

  return (
    <div className="space-y-3">
      {role === 'passager' && checkin && (
        <div
          role="alert"
          className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-4 sm:p-5 space-y-3"
        >
          <p className="flex items-center gap-2 font-black text-amber-900">
            <DriveAlert size={18} /> Tout va bien ?
          </p>
          <p className="text-sm text-amber-800">
            {checkin.label}
            {checkin.detail ? ` — ${checkin.detail}` : ''} La course continue normalement.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={answerBusy}
              onClick={() => answer(checkin.signal, 'ok')}
              className="flex-1 px-4 py-2.5 rounded-full bg-green-600 text-white text-sm font-black hover:bg-green-700 disabled:opacity-50"
            >
              Oui, tout va bien
            </button>
            <button
              type="button"
              disabled={answerBusy}
              onClick={() => answer(checkin.signal, 'problem')}
              className="flex-1 px-4 py-2.5 rounded-full bg-red-600 text-white text-sm font-black hover:bg-red-700 disabled:opacity-50"
            >
              Problème
            </button>
          </div>
        </div>
      )}
      {role === 'passager' && answered && !checkin && (
        <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          Merci — ta réponse a bien été prise en compte.
        </p>
      )}

      {/* Audio du trajet : indicateur visible pendant la course. */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 space-y-2">
        <p className="flex items-center gap-2 text-sm font-black text-slate-900">
          <DriveMic size={16} className={audioState === 'recording' ? 'text-red-500' : 'text-slate-400'} />
          Audio du trajet
          {audioState === 'recording' && (
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">
              Enregistrement en cours
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500 leading-snug">
          Le trajet peut être enregistré (audio chiffré sur ton appareil). L’enregistrement n’est
          envoyé qu’en cas de litige sur cette course — jamais écouté sans litige — et supprimé
          après 7 jours sans litige.
        </p>
        {audioState === 'recording' ? (
          <button
            type="button"
            onClick={stopAudio}
            className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-black hover:bg-slate-700"
          >
            Arrêter l’enregistrement
          </button>
        ) : (
          <button
            type="button"
            onClick={startAudio}
            className="px-4 py-2 rounded-full bg-white border-2 border-slate-300 text-sm font-black text-slate-800 hover:border-slate-500"
          >
            Démarrer l’enregistrement
          </button>
        )}
        {audioError && <p className="text-xs font-bold text-red-600">{audioError}</p>}
        <p className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <DriveShield size={13} /> Sécurité du trajet active — vérifications automatiques pendant la course.
        </p>
      </div>
    </div>
  );
}
