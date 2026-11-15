'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogoLoader } from '@/components/icons/DriveLogo';
import type { Ride } from '@/types';
import type { Neighborhood } from '@/lib/neighborhoods';

/** « Réserver » (v2.51) : recrée une VRAIE demande avec le même
 *  départ / destination et les mêmes conditions que la course
 *  d'origine (POST /api/rides — le prix reste calculé côté
 *  serveur). Pendant l'envoi, le S qui se remplit (LogoLoader,
 *  règle 1) ; en cas d'erreur, LE message du serveur ; en cas de
 *  succès, redirection vers la nouvelle course. Pas de nouvelle
 *  négociation au départ : le prix se convient comme avant, avec
 *  les chauffeurs. */
export function RebookButton({ ride }: { ride: Ride }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rebook() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickup: ride.pickup,
          destination: ride.destination,
          rideType: ride.rideType,
          vehiclePreference: ride.vehiclePreference,
          paymentMethod: ride.paymentMethod,
          comfort: ride.comfort ?? false,
          seats: ride.seats,
          unpavedRoad: ride.unpavedRequested ?? false,
          // Points exacts : le quartier de rattachement doit égaler
          // le quartier choisi (règle serveur) — on le reconstitue
          // depuis la course d'origine.
          pickupPoint: ride.pickupPoint
            ? {
                lat: ride.pickupPoint.lat,
                lng: ride.pickupPoint.lng,
                address: ride.pickupPoint.address,
                neighborhood: ride.pickup as Neighborhood,
              }
            : null,
          destinationPoint: ride.destinationPoint
            ? {
                lat: ride.destinationPoint.lat,
                lng: ride.destinationPoint.lng,
                address: ride.destinationPoint.address,
                neighborhood: ride.destination as Neighborhood,
              }
            : null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Réservation impossible pour le moment.');
        setBusy(false);
        return;
      }
      router.push(`/courses/${data.rideId as string}`);
    } catch {
      setError('Réservation impossible pour le moment — vérifie ta connexion et réessaie.');
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={rebook}
        disabled={busy}
        className="btn-action !py-3 !px-6 text-sm disabled:opacity-60"
      >
        {busy ? (
          <>
            <LogoLoader size={18} /> Envoi…
          </>
        ) : (
          'Réserver'
        )}
      </button>
      {error && (
        <span role="alert" className="text-sm font-bold text-red-300">
          {error}
        </span>
      )}
    </span>
  );
}
