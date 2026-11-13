import type {
  DriverProfile,
  IdDocumentType,
  ProposalStatus,
  Ride,
  RideProposal,
  RideStatus,
  RideType,
  VerificationStatus,
} from '@/types';
import type { Neighborhood, PaymentMethod, VehicleType } from '@/lib/neighborhoods';
import { NEIGHBORHOOD_COORDS } from '@/lib/neighborhoods';

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
  verification_status: VerificationStatus | null;
  selfie_url: string | null;
  id_document_url: string | null;
  id_document_type: IdDocumentType | null;
  verification_note: string | null;
  /** v2.4 — contrôles automatiques (JSONB), empreintes, décision auto. */
  verification_checks: Record<string, unknown> | null;
  verification_doc_hash: string | null;
  verification_image_hash: string | null;
  verification_auto_decision: 'verifie' | 'refuse' | 'ambigu' | null;
  current_area: Neighborhood | null;
  last_lat: number | null;
  last_lng: number | null;
  created_at: string;
}

/** Demande de course (table `rides` requalifiée en v2 : créée par le
 *  passager, jamais par le chauffeur). */
export interface RideRow {
  id: string;
  passenger_id: string | null;
  driver_id: string | null;
  pickup: string;
  destination: string;
  ride_type: RideType;
  vehicle_preference: 'voiture' | 'moto' | 'tous';
  seats: number;
  estimated_price: number;
  proposed_price: number | null;
  first_stop: string | null;
  payment_method: PaymentMethod;
  message: string | null;
  status: RideStatus;
  platform_fee: number;
  driver_share: number;
  rating_driver: number | null;
  rating_passenger: number | null;
  loyalty_free: boolean;
  share_token: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  /** v2.2 — code PIN, gains figés, Course Double. */
  pin_code: string | null;
  pin_attempts: number;
  pin_locked: boolean;
  started_at: string | null;
  completed_at: string | null;
  distance_km: number | null;
  duration_min: number | null;
  commission_rate: number | null;
  is_double_ride: boolean;
  platform_cost: number;
  created_at: string;
  updated_at: string;
  /** Jointures éventuelles. */
  passenger?: ProfileRow | null;
  driver?: ProfileRow | null;
  profiles?: ProfileRow | null;
}

/** Proposition d'un chauffeur (table `ride_proposals`). */
export interface RideProposalRow {
  id: string;
  ride_id: string;
  driver_id: string;
  proposed_price: number;
  seats_left: number;
  first_stop: string;
  status: ProposalStatus;
  expires_at: string;
  created_at: string;
  /** Chauffeur joint. */
  driver?: ProfileRow | null;
  profiles?: ProfileRow | null;
}

/** Convertit une ligne `rides` en `Ride` (forme utilisée par l'interface). */
export function mapRideRow(row: RideRow): Ride {
  return {
    id: row.id,
    passengerId: row.passenger_id,
    driverId: row.driver_id,
    pickup: row.pickup,
    destination: row.destination,
    rideType: row.ride_type,
    vehiclePreference: row.vehicle_preference,
    seats: row.seats,
    estimatedPrice: row.estimated_price,
    proposedPrice: row.proposed_price,
    firstStop: row.first_stop,
    paymentMethod: row.payment_method,
    message: row.message ?? '',
    status: row.status,
    platformFee: row.platform_fee ?? 0,
    driverShare: row.driver_share ?? 0,
    ratingDriver: row.rating_driver,
    ratingPassenger: row.rating_passenger,
    loyaltyFree: row.loyalty_free ?? false,
    shareToken: row.share_token,
    pinCode: row.pin_code ?? null,
    pinAttempts: row.pin_attempts ?? 0,
    pinLocked: row.pin_locked ?? false,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    distanceKm: row.distance_km ?? null,
    durationMin: row.duration_min ?? null,
    commissionRate: row.commission_rate ?? null,
    isDoubleRide: row.is_double_ride ?? false,
    platformCost: row.platform_cost ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Construit l'objet d'affichage `DriverProfile` depuis une ligne `profiles`. */
export function mapDriverProfile(row: ProfileRow): DriverProfile {
  const vehicleLabel = [row.vehicle_brand, row.vehicle_model, row.vehicle_color]
    .filter(Boolean)
    .join(' ');
  const area = row.current_area ?? null;
  const coords = area ? NEIGHBORHOOD_COORDS[area] : null;
  return {
    id: row.id,
    name: row.full_name ?? 'Chauffeur Stacks Drive',
    phone: row.phone,
    vehicleType: row.vehicle_type,
    vehicleLabel,
    plate: row.plate,
    seats: row.seats,
    isVerified: row.is_verified,
    isOnline: row.is_online,
    rating: null,
    trips: 0,
    area,
    lat: row.last_lat ?? coords?.lat ?? null,
    lng: row.last_lng ?? coords?.lng ?? null,
    isDemo: row.is_demo,
  };
}

/** Convertit une ligne `ride_proposals` en `RideProposal`. */
export function mapProposalRow(row: RideProposalRow): RideProposal {
  const driverRow = row.driver ?? row.profiles ?? null;
  return {
    id: row.id,
    rideId: row.ride_id,
    driverId: row.driver_id,
    proposedPrice: row.proposed_price,
    seatsLeft: row.seats_left,
    firstStop: row.first_stop,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    driver: driverRow ? mapDriverProfile(driverRow) : null,
  };
}
