"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumButton } from '@/components/shared/PremiumButton';
import { COMMISSION_RATE, formatFcfa, splitFare } from '@/lib/commission';
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/neighborhoods';
import type { Ride } from '@/types';
import { cn } from '@/lib/utils';

/** Formulaire de réservation d'une course (passager connecté).
 *  Affiche la découpe du tarif (part chauffeur / frais plateforme) avant
 *  de confirmer. Aucun paiement réel en v1 : le règlement se fait
 *  directement avec le chauffeur, en espèces ou Mobile Money. */
export function BookingForm({ ride }: { ride: Ride }) {
  const router = useRouter();
  const [seats, setSeats] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('especes');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const total = ride.price * seats;
  const split = splitFare(total);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rideId: ride.id,
        seats,
        paymentMethod,
        message: message.trim(),
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Réservation impossible. Réessaie.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-3xl p-6 text-center space-y-3">
        <p className="text-lg font-black text-green-800">Réservation envoyée !</p>
        <p className="text-sm text-green-700 leading-relaxed">
          Ta demande est chez le chauffeur. Il la confirme et tu reçois ses
          coordonnées. Règle {formatFcfa(total)} directement avec lui, en{' '}
          {PAYMENT_LABELS[paymentMethod].toLowerCase()}.
        </p>
        <button
          type="button"
          onClick={() => router.push('/mes-courses')}
          className="inline-flex px-6 py-3 bg-stacks-green text-white text-sm font-black rounded-full hover:bg-stacks-greenLight transition-colors"
        >
          Voir mes courses
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="seats" className="text-xs font-black uppercase tracking-widest text-slate-500">
          Nombre de places
        </label>
        <select
          id="seats"
          value={seats}
          onChange={(e) => setSeats(Number(e.target.value))}
          className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 focus:border-stacks-green focus:outline-none"
        >
          {Array.from({ length: Math.min(4, ride.seatsAvailable) }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n} place{n > 1 ? 's' : ''} — {formatFcfa(ride.price * n)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <span className="text-xs font-black uppercase tracking-widest text-slate-500">
          Paiement (directement avec le chauffeur)
        </span>
        <div className="flex flex-wrap gap-2">
          {ride.paymentMethods.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={paymentMethod === m}
              onClick={() => setPaymentMethod(m)}
              className={cn(
                'px-4 py-2.5 rounded-full text-sm font-bold border-2 transition-colors',
                paymentMethod === m
                  ? 'border-stacks-green bg-green-50 text-stacks-green'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              )}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="message" className="text-xs font-black uppercase tracking-widest text-slate-500">
          Message au chauffeur (optionnel)
        </label>
        <textarea
          id="message"
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Ex : je suis devant la pharmacie, avec une valise."
          className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none resize-none"
        />
      </div>

      {/* Découpe transparente du tarif */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">
            {seats} place{seats > 1 ? 's' : ''} × {formatFcfa(ride.price)}
          </span>
          <span className="font-black text-slate-900">{formatFcfa(split.total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Part du chauffeur</span>
          <span className="font-bold text-slate-700">{formatFcfa(split.driverShare)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">
            Frais Stacks Drive ({Math.round(COMMISSION_RATE * 100)} %)
          </span>
          <span className="font-bold text-slate-700">{formatFcfa(split.platformFee)}</span>
        </div>
        <p className="text-xs text-slate-400 pt-1">
          Le tarif est fixe : pas de majoration, même la nuit. Tu paies le
          montant affiché, directement au chauffeur.
        </p>
      </div>

      <PremiumButton type="submit" isLoading={loading} className="w-full justify-center py-4">
        Réserver pour {formatFcfa(total)}
      </PremiumButton>
    </form>
  );
}
