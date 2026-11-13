'use client';

import { useState } from 'react';
import { Clock, MapPin, Users, X } from 'lucide-react';
import type { Ride } from '@/types';
import { formatFcfa } from '@/lib/commission';
import { timeAgo } from '@/lib/dates';

/** Pop-up reçue par le chauffeur en ligne quand une demande match son
 *  périmètre : détails de la demande + proposition (prix, places,
 *  premier arrêt). */
export function RequestPopup({
  ride,
  passenger,
  onClose,
  onProposed,
}: {
  ride: Ride;
  passenger: { name: string | null; phone: string | null } | null;
  onClose: () => void;
  onProposed: (rideId: string) => void;
}) {
  const [price, setPrice] = useState(ride.estimatedPrice);
  const [seatsLeft, setSeatsLeft] = useState(Math.max(ride.seats, 1));
  const [firstStop, setFirstStop] = useState(ride.pickup);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rideId: ride.id,
        proposedPrice: price,
        seatsLeft,
        firstStop: firstStop.trim(),
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Proposition impossible.');
      return;
    }
    onProposed(ride.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Nouvelle demande de course"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-6 w-full max-w-md space-y-5 sheet-up max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-stacks-green">
              <span className="w-2 h-2 rounded-full bg-stacks-green animate-pulse" />
              Nouvelle demande · {timeAgo(ride.createdAt)}
            </p>
            <h3 className="font-black text-xl text-slate-900 mt-1.5 leading-tight">
              {ride.pickup} → {ride.destination}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {passenger?.name ?? 'Passager'} · {passenger?.phone ?? ''} ·{' '}
              {ride.rideType === 'groupe' ? `Groupe · ${ride.seats} passager${ride.seats > 1 ? 's' : ''}` : 'Solo · 1 passager'}
              {' '}· {ride.paymentMethod === 'especes' ? 'Espèces' : ride.paymentMethod === 'airtel' ? 'Airtel Money' : 'Moov Money'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0"
            aria-label="Ignorer pour l’instant"
          >
            <X size={16} />
          </button>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5 flex items-center justify-between gap-3">
          <span className="text-sm font-bold text-slate-600">Prix estimé (fixe)</span>
          <span className="font-black text-stacks-navy text-lg">
            {formatFcfa(ride.estimatedPrice)}
            {ride.rideType === 'groupe' && (
              <span className="text-xs font-bold text-slate-400"> / passager</span>
            )}
          </span>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="proposal-price" className="text-xs font-black uppercase tracking-widest text-slate-500">
              Ton prix pour cette course (FCFA)
            </label>
            <input
              id="proposal-price"
              type="number"
              min={100}
              max={100000}
              step={50}
              required
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-lg font-black focus:border-stacks-green focus:outline-none"
            />
            <p className="text-xs text-slate-400">
              Tu proposes ton prix — le passager compare les propositions et choisit.
              Après acceptation, tu touches {formatFcfa(Math.round(price * 0.95))} (commission 5 %).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="seats-left" className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <Users size={12} /> Places restantes
              </label>
              <input
                id="seats-left"
                type="number"
                min={ride.seats}
                max={9}
                required
                value={seatsLeft}
                onChange={(e) => setSeatsLeft(Number(e.target.value))}
                className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-black focus:border-stacks-green focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="first-stop" className="text-xs font-black uppercase tracking-widest text-slate-500 flex items-center gap-1">
                <MapPin size={12} /> Premier arrêt
              </label>
              <input
                id="first-stop"
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={firstStop}
                onChange={(e) => setFirstStop(e.target.value)}
                placeholder="Ex : Carrefour de Glass"
                className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 font-bold focus:border-stacks-green focus:outline-none"
              />
            </div>
          </div>
          <p className="text-xs text-slate-400 flex items-start gap-1.5">
            <Clock size={13} className="shrink-0 mt-0.5" />
            Ta proposition expire après 60 secondes si le passager ne répond pas.
            En Groupe, le premier arrêt donne l’ordre des prises en charge.
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-stacks-green text-white font-black py-4 rounded-full shadow-lg shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
            >
              {loading ? 'Envoi…' : `Proposer ${formatFcfa(price)}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-4 rounded-full font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Ignorer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
