"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PremiumButton } from '@/components/shared/PremiumButton';
import { NEIGHBORHOODS, PAYMENT_LABELS, PAYMENT_METHODS, VEHICLE_TYPES, type PaymentMethod, type VehicleType } from '@/lib/neighborhoods';
import type { Ride, RideType } from '@/types';
import { cn } from '@/lib/utils';

const inputCls =
  'w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none';
const labelCls = 'text-xs font-black uppercase tracking-widest text-slate-500';

export interface RideFormValues {
  departure: string;
  destination: string;
  departureTime: string;
  seatsTotal: number;
  price: number;
  rideType: RideType;
  vehicleType: VehicleType;
  vehicleLabel: string;
  paymentMethods: PaymentMethod[];
  note: string;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultValues(ride?: Ride): RideFormValues {
  if (!ride) {
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    return {
      departure: '',
      destination: '',
      departureTime: toLocalInput(inOneHour.toISOString()),
      seatsTotal: 3,
      price: 1500,
      rideType: 'partagee',
      vehicleType: 'Berline',
      vehicleLabel: '',
      paymentMethods: ['especes', 'airtel', 'moov'],
      note: '',
    };
  }
  return {
    departure: ride.departure,
    destination: ride.destination,
    departureTime: toLocalInput(ride.departureTime),
    seatsTotal: ride.seatsTotal,
    price: ride.price,
    rideType: ride.rideType,
    vehicleType: ride.vehicleType,
    vehicleLabel: ride.vehicleLabel,
    paymentMethods: ride.paymentMethods,
    note: ride.note,
  };
}

/** Formulaire de publication / modification d'une course (chauffeur).
 *  En création : POST /api/rides. En modification : PATCH /api/rides/[id]. */
export function RideForm({
  ride,
  defaultVehicle,
}: {
  ride?: Ride;
  defaultVehicle?: { vehicleType: VehicleType; vehicleLabel: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState<RideFormValues>(() => {
    const v = defaultValues(ride);
    if (!ride && defaultVehicle) {
      v.vehicleType = defaultVehicle.vehicleType;
      v.vehicleLabel = defaultVehicle.vehicleLabel;
    }
    return v;
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof RideFormValues>(key: K, value: RideFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function togglePayment(method: PaymentMethod) {
    setValues((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.includes(method)
        ? prev.paymentMethods.filter((m) => m !== method)
        : [...prev.paymentMethods, method],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.departure.trim() === values.destination.trim()) {
      setError('Le départ et la destination doivent être différents.');
      return;
    }
    if (values.paymentMethods.length === 0) {
      setError('Choisis au moins un moyen de paiement.');
      return;
    }
    if (values.rideType === 'solo' && values.seatsTotal !== 1) {
      setError('Une course solo ne propose qu’une seule place.');
      return;
    }
    setLoading(true);
    const url = ride ? `/api/rides/${ride.id}` : '/api/rides';
    const res = await fetch(url, {
      method: ride ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        departure: values.departure.trim(),
        destination: values.destination.trim(),
        departureTime: new Date(values.departureTime).toISOString(),
        seatsTotal: values.seatsTotal,
        price: values.price,
        rideType: values.rideType,
        vehicleType: values.vehicleType,
        vehicleLabel: values.vehicleLabel.trim(),
        paymentMethods: values.paymentMethods,
        note: values.note.trim(),
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Enregistrement impossible. Réessaie.');
      return;
    }
    router.push('/tableau-de-bord');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="departure" className={labelCls}>Départ</label>
          <input
            id="departure"
            list="neighborhoods"
            required
            value={values.departure}
            onChange={(e) => set('departure', e.target.value)}
            placeholder="Ex : Centre-ville"
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="destination" className={labelCls}>Destination</label>
          <input
            id="destination"
            list="neighborhoods"
            required
            value={values.destination}
            onChange={(e) => set('destination', e.target.value)}
            placeholder="Ex : Owendo"
            className={inputCls}
          />
        </div>
        <datalist id="neighborhoods">
          {NEIGHBORHOODS.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="departure-time" className={labelCls}>Date et heure de départ</label>
        <input
          id="departure-time"
          type="datetime-local"
          required
          value={values.departureTime}
          onChange={(e) => set('departureTime', e.target.value)}
          className={inputCls}
        />
      </div>

      {/* Type de course */}
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Type de course">
        {(
          [
            { value: 'solo', label: 'Solo', desc: 'Un seul passager, course privée' },
            { value: 'partagee', label: 'Partagée', desc: 'Plusieurs passagers, prix par place' },
          ] as const
        ).map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={values.rideType === r.value}
            onClick={() => {
              set('rideType', r.value);
              if (r.value === 'solo') set('seatsTotal', 1);
              if (r.value === 'partagee' && values.seatsTotal < 2) set('seatsTotal', 3);
            }}
            className={cn(
              'p-4 rounded-2xl border-2 text-left transition-colors',
              values.rideType === r.value
                ? 'border-stacks-green bg-green-50/60'
                : 'border-slate-200 bg-white hover:border-slate-300'
            )}
          >
            <span className="block font-black text-slate-900">{r.label}</span>
            <span className="block text-xs text-slate-500 mt-0.5">{r.desc}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="seats" className={labelCls}>
            {values.rideType === 'solo' ? 'Places (solo = 1)' : 'Places disponibles'}
          </label>
          <input
            id="seats"
            type="number"
            min={1}
            max={9}
            required
            value={values.seatsTotal}
            disabled={values.rideType === 'solo'}
            onChange={(e) => set('seatsTotal', Number(e.target.value))}
            className={cn(inputCls, values.rideType === 'solo' && 'opacity-50')}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="price" className={labelCls}>
            {values.rideType === 'solo' ? 'Prix de la course (FCFA)' : 'Prix par place (FCFA)'}
          </label>
          <input
            id="price"
            type="number"
            min={100}
            max={100000}
            step={50}
            required
            value={values.price}
            onChange={(e) => set('price', Number(e.target.value))}
            className={inputCls}
          />
          <p className="text-xs text-slate-400">
            Prix fixe, affiché avant la course — jamais de surge, même la nuit.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="vehicle-type" className={labelCls}>Type de véhicule</label>
          <select
            id="vehicle-type"
            value={values.vehicleType}
            onChange={(e) => set('vehicleType', e.target.value as VehicleType)}
            className={inputCls}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="vehicle-label" className={labelCls}>Véhicule (marque, modèle, couleur)</label>
          <input
            id="vehicle-label"
            type="text"
            value={values.vehicleLabel}
            onChange={(e) => set('vehicleLabel', e.target.value)}
            placeholder="Ex : Toyota Corolla blanche"
            className={inputCls}
          />
        </div>
      </div>

      <div className="space-y-2">
        <span className={labelCls}>Paiement accepté</span>
        <div className="flex flex-wrap gap-2">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={values.paymentMethods.includes(m)}
              onClick={() => togglePayment(m)}
              className={cn(
                'px-4 py-2.5 rounded-full text-sm font-bold border-2 transition-colors',
                values.paymentMethods.includes(m)
                  ? 'border-stacks-green bg-green-50 text-stacks-green'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              )}
            >
              {PAYMENT_LABELS[m]}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Le paiement se fait directement entre toi et le passager — Stacks
          Drive ne touche pas à l’argent de la course, seulement à sa commission.
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="note" className={labelCls}>Précisions pour les passagers (optionnel)</label>
        <textarea
          id="note"
          rows={3}
          value={values.note}
          onChange={(e) => set('note', e.target.value)}
          placeholder="Ex : départ devant la pharmacie, coffre disponible pour les bagages…"
          className={cn(inputCls, 'resize-none')}
        />
      </div>

      <PremiumButton type="submit" isLoading={loading} className="w-full justify-center py-4">
        {ride ? 'Enregistrer les modifications' : 'Publier la course'}
      </PremiumButton>
    </form>
  );
}
