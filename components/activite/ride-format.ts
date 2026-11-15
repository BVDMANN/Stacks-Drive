import type { Ride } from '@/types';
import { formatFcfa } from '@/lib/commission';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import type { RoutePoint } from '@/lib/routing';

/** Libellé du prix d'une course (v2.51) : prix réel figé, 0 FCFA
 *  pour une course annulée ou offerte, estimation sinon — jamais
 *  un prix inventé. */
export function displayPrice(ride: Ride): string {
  if (ride.status === 'annulee') return '0 FCFA';
  if (ride.loyaltyFree) return '0 FCFA — 10e course offerte';
  if (ride.proposedPrice !== null) return formatFcfa(ride.proposedPrice);
  return `estimation ${formatFcfa(ride.estimatedPrice)}`;
}

/** Libellé court du prix (carte héro) : « 0 FCFA — Annulée » pour
 *  une course annulée, sinon comme displayPrice. */
export function heroPriceLabel(ride: Ride): string {
  if (ride.status === 'annulee') return '0 FCFA — Annulée';
  return displayPrice(ride);
}

/** Point de départ / d'arrivée d'une course : point exact quand il
 *  existe, sinon centre du quartier. Null = quartier inconnu (ne
 *  devrait pas arriver : les quartiers sont un enum). */
export function ridePoint(ride: Ride, end: 'pickup' | 'destination'): RoutePoint | null {
  const point = end === 'pickup' ? ride.pickupPoint : ride.destinationPoint;
  if (point) return { lat: point.lat, lng: point.lng };
  const coords =
    NEIGHBORHOOD_COORDS[(end === 'pickup' ? ride.pickup : ride.destination) as Neighborhood];
  return coords ? { lat: coords.lat, lng: coords.lng } : null;
}

/** Adresse affichée d'une extrémité : adresse exacte quand elle
 *  existe, sinon le nom du quartier — les deux courses homonymes
 *  se distinguent par quartier + date + prix (jamais par
 *  l'adresse seule). */
export function rideAddress(ride: Ride, end: 'pickup' | 'destination'): string {
  const point = end === 'pickup' ? ride.pickupPoint : ride.destinationPoint;
  return point?.address ?? (end === 'pickup' ? ride.pickup : ride.destination);
}
