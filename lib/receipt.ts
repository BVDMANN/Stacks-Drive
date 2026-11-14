/** Reçu détaillé après course (v2.23, plancher P0a) — prix, distance,
 *  durée, chauffeur, commission. Le reçu reprend les montants FIGÉS à
 *  l'acceptation (prix convenu, découpe commission / part chauffeur) :
 *  il ne recalcule jamais rien côté client — il lit `rides` (et
 *  `driver_earnings` quand la ligne existe, sinon les montants figés
 *  de la course, comme l'historique chauffeur).
 *
 *  L'export PDF / impression est P1 : pas implémenté ici. */

import { formatFcfa } from '@/lib/commission';
import type { Ride } from '@/types';

export interface RideReceipt {
  rideId: string;
  pickup: string;
  destination: string;
  rideType: 'solo' | 'groupe';
  /** Montant exact payé par le passager (0 si course offerte). */
  price: number;
  priceLabel: string;
  loyaltyFree: boolean;
  distanceKm: number | null;
  durationMin: number | null;
  distanceLabel: string;
  durationLabel: string;
  driverName: string | null;
  vehicleLabel: string | null;
  plate: string | null;
  paymentLabel: string;
  /** Commission plateforme figée sur cette course. */
  commission: number;
  commissionLabel: string;
  commissionRatePct: number | null;
  /** Part gardée par le chauffeur. */
  driverShare: number;
  driverShareLabel: string;
  startedAt: string | null;
  completedAt: string | null;
}

export function buildRideReceipt(args: {
  ride: Ride;
  driverName: string | null;
  vehicleLabel?: string | null;
  plate?: string | null;
  paymentLabel: string;
}): RideReceipt {
  const { ride } = args;
  const fare = ride.proposedPrice ?? ride.estimatedPrice;
  // Course offerte (fidélité) : le passager paie 0, le chauffeur
  // touche l'intégralité du tarif, la plateforme absorbe.
  const price = ride.loyaltyFree ? 0 : fare;
  return {
    rideId: ride.id,
    pickup: ride.pickup,
    destination: ride.destination,
    rideType: ride.rideType,
    price,
    priceLabel: ride.loyaltyFree ? '0 FCFA — 10e course offerte' : formatFcfa(price),
    loyaltyFree: ride.loyaltyFree,
    distanceKm: ride.distanceKm,
    durationMin: ride.durationMin,
    distanceLabel:
      ride.distanceKm !== null ? `~${Math.max(1, Math.round(ride.distanceKm))} km` : '—',
    durationLabel: ride.durationMin !== null ? `~${ride.durationMin} min` : '—',
    driverName: args.driverName,
    vehicleLabel: args.vehicleLabel ?? null,
    plate: args.plate ?? null,
    paymentLabel: args.paymentLabel,
    commission: ride.loyaltyFree ? 0 : ride.platformFee,
    commissionLabel: ride.loyaltyFree ? '0 FCFA — offerte' : formatFcfa(ride.platformFee),
    commissionRatePct:
      ride.commissionRate !== null ? Math.round(ride.commissionRate * 100) : null,
    driverShare: ride.loyaltyFree ? fare : ride.driverShare,
    driverShareLabel: formatFcfa(ride.loyaltyFree ? fare : ride.driverShare),
    startedAt: ride.startedAt,
    completedAt: ride.completedAt,
  };
}
