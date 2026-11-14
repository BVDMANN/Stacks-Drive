'use client';

import { useState } from 'react';
import { Clock, MapPin, Route, Users, X } from 'lucide-react';
import type { Ride } from '@/types';
import { formatFcfa } from '@/lib/commission';
import { UNPAVED_ROAD_SUPPLEMENT, estimateTrip } from '@/lib/pricing';
import { timeAgo } from '@/lib/dates';
import { dropOffPointFor, isDifficultAccess, type Neighborhood } from '@/lib/neighborhoods';

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
  // Prix de départ de la proposition : le prix proposé par le passager
  // s'il en a mis un (v2.11), sinon l'estimation indicative — jamais
  // un prix imposé : le chauffeur propose librement son prix.
  const [price, setPrice] = useState(ride.offeredPrice ?? ride.estimatedPrice);
  const [seatsLeft, setSeatsLeft] = useState(Math.max(ride.seats, 1));
  const [firstStop, setFirstStop] = useState(ride.pickup);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Route non bitumée (v2.6) : la destination est-elle à accès
  // difficile ? Le passager a-t-il demandé la piste ? Par défaut, la
  // case suit la demande du passager — le chauffeur reste libre de
  // la décocher (la course s'arrête alors au point de dépôt et le
  // supplément est retiré du prix).
  const destDifficult = isDifficultAccess(ride.destination as Neighborhood);
  const dropOff = destDifficult ? dropOffPointFor(ride.destination as Neighborhood) : null;
  const [takeUnpaved, setTakeUnpaved] = useState(ride.unpavedRequested);

  function toggleUnpaved(checked: boolean) {
    setTakeUnpaved(checked);
    setPrice((p) => p + (checked ? UNPAVED_ROAD_SUPPLEMENT : -UNPAVED_ROAD_SUPPLEMENT));
  }

  // Trajet estimé (v2.2) : le chauffeur voit la distance et la durée
  // avant de proposer son prix.
  const tripEstimate = estimateTrip(ride.pickup as Neighborhood, ride.destination as Neighborhood);

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
        unpavedAccepted: destDifficult ? takeUnpaved : false,
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
          <span className="text-sm font-bold text-slate-600">Estimation indicative</span>
          <span className="font-black text-stacks-navy text-lg">
            {formatFcfa(ride.estimatedPrice)}
            {ride.rideType === 'groupe' && (
              <span className="text-xs font-bold text-slate-400"> / passager</span>
            )}
          </span>
        </div>
        {/* Prix proposé par le passager (v2.11) : le chauffeur peut
            l'accepter en proposant ce prix, ou proposer un autre montant. */}
        {ride.offeredPrice !== null && (
          <p className="text-sm font-bold text-stacks-green bg-green-50 border border-green-200 rounded-2xl px-3.5 py-2.5">
            Le passager propose {formatFcfa(ride.offeredPrice)} — tu peux l’accepter tel quel ou proposer un autre prix.
          </p>
        )}

        <p className="text-sm text-slate-600 flex items-center gap-1.5">
          <Route size={15} className="text-stacks-green shrink-0" />
          ~{Math.max(1, Math.round(tripEstimate.distanceKm))} km · ~{tripEstimate.durationMin} min de trajet
        </p>

        {/* Route non bitumée (v2.6) : destination à accès difficile.
            Le passager a demandé la piste ou non ; le chauffeur choisit
            librement — refuser = arrêt au point de dépôt, supplément
            retiré (le prix ci-dessous s'ajuste de 800 FCFA). */}
        {destDifficult && dropOff && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 space-y-2.5">
            <p className="text-sm font-bold text-amber-800 leading-snug">
              Accès difficile : la route bitumée s’arrête à {dropOff}.
              {ride.unpavedRequested
                ? ` Le passager demande la piste jusqu’à ${ride.destination} (+${formatFcfa(UNPAVED_ROAD_SUPPLEMENT)} inclus dans l’estimation).`
                : ` Le passager n’a pas demandé la piste : la course s’arrête à ${dropOff}.`}
            </p>
            {ride.unpavedRequested && (
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={takeUnpaved}
                  onChange={(e) => toggleUnpaved(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[#15803d]"
                />
                <span className="text-sm text-slate-700 leading-snug">
                  <span className="font-black text-slate-900">
                    Je prends la route non bitumée jusqu’à {ride.destination} (+{formatFcfa(UNPAVED_ROAD_SUPPLEMENT)})
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Si tu décoches, la course s’arrête à {dropOff} et le supplément est retiré du prix.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}

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
              min={400}
              max={50000}
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
