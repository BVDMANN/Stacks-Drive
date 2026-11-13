import type { PaymentMethod, VehicleType } from '@/lib/neighborhoods';

export type UserRole = 'passager' | 'chauffeur';

export interface DriverProfile {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: VehicleType | null;
  vehicleLabel: string;
  seats: number | null;
  isVerified: boolean;
  isOnline: boolean;
}

export type RideType = 'solo' | 'partagee';
export type RideStatus = 'published' | 'draft' | 'closed';

export interface Ride {
  id: string;
  driverId: string | null;
  departure: string;
  destination: string;
  /** Date/heure de départ (ISO). */
  departureTime: string;
  seatsTotal: number;
  seatsAvailable: number;
  /** Prix en FCFA par place (par passager). Pour une course solo, c'est le
   *  prix total de la course (1 place). Pour une course partagée, c'est le
   *  prix par passager. */
  price: number;
  rideType: RideType;
  vehicleType: VehicleType;
  vehicleLabel: string;
  paymentMethods: PaymentMethod[];
  note: string;
  status: RideStatus;
  isDemo: boolean;
  createdAt: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Booking {
  id: string;
  rideId: string;
  passengerId: string;
  seats: number;
  /** Prix total payé par le passager (FCFA). */
  totalPrice: number;
  /** Part plateforme (commission, FCFA) — figée à la réservation. */
  platformFee: number;
  /** Part chauffeur (FCFA) — figée à la réservation. */
  driverShare: number;
  paymentMethod: PaymentMethod;
  message: string;
  status: BookingStatus;
  createdAt: string;
}
