import type { Booking, BookingStatus, DriverProfile, Ride, RideStatus, RideType } from '@/types';
import type { PaymentMethod, VehicleType } from '@/lib/neighborhoods';

/** Lignes brutes telles que renvoyées par Supabase (PostgREST). */

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: 'passager' | 'chauffeur';
  vehicle_type: VehicleType | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  plate: string | null;
  seats: number | null;
  is_online: boolean;
  is_verified: boolean;
  is_admin: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface RideRow {
  id: string;
  driver_id: string | null;
  departure: string;
  destination: string;
  departure_time: string;
  seats_total: number;
  seats_available: number;
  price: number;
  ride_type: RideType;
  vehicle_type: VehicleType;
  vehicle_label: string;
  payment_methods: PaymentMethod[] | null;
  note: string | null;
  status: RideStatus;
  driver_name: string;
  driver_phone: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  /** Jointure éventuelle vers le profil du chauffeur. */
  profiles?: ProfileRow | null;
}

export interface BookingRow {
  id: string;
  ride_id: string;
  passenger_id: string;
  seats: number;
  total_price: number;
  platform_fee: number;
  driver_share: number;
  payment_method: PaymentMethod;
  message: string | null;
  status: BookingStatus;
  created_at: string;
  rides?: {
    id: string;
    departure: string;
    destination: string;
    departure_time: string;
    price: number;
    ride_type: RideType;
    vehicle_type: VehicleType;
    vehicle_label: string;
    status: string;
    driver_id: string | null;
    driver_name: string;
  } | null;
  profiles?: ProfileRow | null;
}

/** Convertit une ligne `rides` en `Ride` (forme utilisée par l'interface). */
export function mapRideRow(row: RideRow): Ride {
  return {
    id: row.id,
    driverId: row.driver_id,
    departure: row.departure,
    destination: row.destination,
    departureTime: row.departure_time,
    seatsTotal: row.seats_total,
    seatsAvailable: row.seats_available,
    price: row.price,
    rideType: row.ride_type,
    vehicleType: row.vehicle_type,
    vehicleLabel: row.vehicle_label || '',
    paymentMethods: row.payment_methods ?? ['especes'],
    note: row.note ?? '',
    status: row.status,
    isDemo: row.is_demo,
    createdAt: row.created_at,
  };
}

/** Construit l'objet d'affichage `DriverProfile` pour une course. */
export function mapDriver(row: RideRow): DriverProfile {
  const profile = row.profiles ?? null;
  const vehicleLabel =
    row.vehicle_label ||
    [profile?.vehicle_brand, profile?.vehicle_model, profile?.vehicle_color]
      .filter(Boolean)
      .join(' ');
  return {
    id: row.driver_id ?? `demo-${row.id}`,
    name: profile?.full_name || row.driver_name,
    phone: profile?.phone ?? row.driver_phone,
    vehicleType: (profile?.vehicle_type ?? row.vehicle_type) as VehicleType,
    vehicleLabel,
    seats: profile?.seats ?? row.seats_total,
    isVerified: profile?.is_verified ?? false,
    isOnline: profile?.is_online ?? false,
  };
}

/** Convertit une ligne `bookings` en `Booking`. */
export function mapBookingRow(row: BookingRow): Booking {
  return {
    id: row.id,
    rideId: row.ride_id,
    passengerId: row.passenger_id,
    seats: row.seats,
    totalPrice: row.total_price,
    platformFee: row.platform_fee,
    driverShare: row.driver_share,
    paymentMethod: row.payment_method,
    message: row.message ?? '',
    status: row.status,
    createdAt: row.created_at,
  };
}
