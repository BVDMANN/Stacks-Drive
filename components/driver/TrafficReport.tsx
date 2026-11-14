'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Ban, Car, Check, Construction, Loader2, Megaphone } from 'lucide-react';
import { TRAFFIC_LABELS, type TrafficReport, type TrafficType } from '@/lib/traffic';
import { nearestNeighborhood } from '@/lib/geo';
import { cn } from '@/lib/utils';

const TYPE_ICONS: Record<TrafficType, typeof Car> = {
  embouteillage: Car,
  accident: AlertTriangle,
  travaux: Construction,
  route_fermee: Ban,
};

const TYPE_ORDER: TrafficType[] = ['embouteillage', 'accident', 'travaux', 'route_fermee'];

/** Signalement trafic pendant une course (v2.27, lot E — phase 2).
 *
 *  Le chauffeur signale ce qu'il voit sur la route — embouteillage,
 *  accident, travaux, route fermée — à sa position du moment
 *  (géolocalisation, sinon sa dernière position connue). Le
 *  signalement apparaît sur la carte des passagers ET des chauffeurs
 *  et expire tout seul (30–60 min). Confirmé par au moins 2
 *  chauffeurs, il est affiché en évidence (modération auto).
 *
 *  La liste sous les boutons montre les signalements actifs autour :
 *  un chauffeur qui constate le même problème le confirme en 1 tap
 *  (il ne peut pas confirmer le sien, ni deux fois le même).
 */
export function TrafficReport({
  rideId,
  fallbackLat,
  fallbackLng,
}: {
  rideId: string;
  /** Dernière position connue du chauffeur (repli si la
   *  géolocalisation refuse ou tarde). */
  fallbackLat: number | null;
  fallbackLng: number | null;
}) {
  const [reports, setReports] = useState<TrafficReport[]>([]);
  const [sending, setSending] = useState<TrafficType | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/traffic');
      const data = await res.json().catch(() => null);
      if (data?.ok) setReports((data.reports ?? []) as TrafficReport[]);
    } catch {
      // Liste indisponible : les boutons restent utilisables.
    }
  }, []);

  useEffect(() => {
    fetchReports();
    const t = window.setInterval(fetchReports, 60000);
    return () => window.clearInterval(t);
  }, [fetchReports]);

  function getPosition(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('no-geo'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => reject(new Error('no-geo')),
        { timeout: 5000, maximumAge: 30000 }
      );
    });
  }

  async function report(type: TrafficType) {
    if (sending) return;
    setError(null);
    setMessage(null);
    setSending(type);
    try {
      let pos: { lat: number; lng: number } | null = null;
      try {
        pos = await getPosition();
      } catch {
        pos = null;
      }
      if (!pos && fallbackLat !== null && fallbackLng !== null) {
        pos = { lat: fallbackLat, lng: fallbackLng };
      }
      if (!pos) {
        setError('Position introuvable : active la géolocalisation pour signaler.');
        setSending(null);
        return;
      }
      const res = await fetch('/api/traffic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          lat: pos.lat,
          lng: pos.lng,
          neighborhood: nearestNeighborhood(pos.lat, pos.lng).neighborhood,
          rideId,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Signalement impossible pour le moment.');
      } else if (data.alreadyReported) {
        setMessage('Déjà signalé à cet endroit — merci, on l’a bien noté.');
      } else {
        setMessage(`${TRAFFIC_LABELS[type]} signalé — visible sur la carte, il expire tout seul.`);
        fetchReports();
      }
    } catch {
      setError('Signalement impossible pour le moment (réseau).');
    } finally {
      setSending(null);
    }
  }

  async function confirm(id: string) {
    if (confirming) return;
    setConfirming(id);
    try {
      const res = await fetch(`/api/traffic/${id}/confirm`, { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setReports((list) =>
          list.map((r) =>
            r.id === id
              ? { ...r, confirmations: data.confirmations as number, confirmed: data.confirmed as boolean }
              : r
          )
        );
      }
    } catch {
      // Réessaie au prochain tour.
    } finally {
      setConfirming(null);
    }
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      <p className="text-sm font-black text-slate-900 flex items-center gap-1.5">
        <Megaphone size={15} className="text-stacks-green" />
        Signaler un problème sur la route
      </p>
      <div className="flex flex-wrap gap-2">
        {TYPE_ORDER.map((type) => {
          const Icon = TYPE_ICONS[type];
          const busy = sending === type;
          return (
            <button
              key={type}
              type="button"
              disabled={sending !== null}
              onClick={() => report(type)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-white border border-slate-300 text-sm font-black text-slate-700 hover:border-stacks-green hover:text-stacks-green transition-colors disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
              {TRAFFIC_LABELS[type]}
            </button>
          );
        })}
      </div>
      {message && (
        <p className="text-sm font-bold text-stacks-green bg-green-50 border border-green-200 rounded-xl p-3">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {reports.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-black uppercase tracking-widest text-slate-400">
            Signalements actifs autour
          </p>
          <ul className="space-y-2">
            {reports.slice(0, 5).map((r) => {
              const Icon = TYPE_ICONS[r.type];
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2"
                >
                  <span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-700">
                    <Icon size={14} className={r.confirmed ? 'text-amber-500' : 'text-slate-400'} />
                    {TRAFFIC_LABELS[r.type]}
                    {r.neighborhood ? ` · près de ${r.neighborhood}` : ''}
                    {r.confirmed && (
                      <span className="text-xs font-black text-amber-600">· Confirmé ✓</span>
                    )}
                    {r.confirmations > 0 && !r.confirmed && (
                      <span className="text-xs text-slate-400">· {r.confirmations} confirmation</span>
                    )}
                  </span>
                  {!r.mine && (
                    <button
                      type="button"
                      disabled={confirming === r.id}
                      onClick={() => confirm(r.id)}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full transition-colors disabled:opacity-50',
                        r.confirmed
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      )}
                    >
                      {confirming === r.id ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Check size={12} />
                      )}
                      Je confirme
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
