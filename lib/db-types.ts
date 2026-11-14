import type {
  DriverProfile,
  DriverStatus,
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
  /** v2.19 — places libres déclarées (NULL = jamais déclarées). */
  free_seats: number | null;
  /** v2.19 — statut dérivé (chauffeur), joint par getAdminStats. */
  driver_status?: DriverStatus | null;
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
  /** v2.30 — lieux favoris (quartier + précision libre, effaçables). */
  home_neighborhood: string | null;
  home_detail: string | null;
  work_neighborhood: string | null;
  work_detail: string | null;
  /** v2.30 — re-vérification selfie ponctuelle. */
  selfie_recheck_required: boolean | null;
  selfie_recheck_reason: string | null;
  last_selfie_check_at: string | null;
  /** v2.34 — climatisation (Confort) + destination de retour. */
  has_air_conditioning: boolean | null;
  return_destination: string | null;
  return_filter_enabled: boolean | null;
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
  /** v2.34 — classe Confort (Solo + clim + 4,5★). */
  comfort: boolean | null;
  /** v2.34 — chauffeur favori prioritaire + fin d'exclusivité. */
  preferred_driver_id: string | null;
  preferred_until: string | null;
  vehicle_preference: 'voiture' | 'moto' | 'tous';
  seats: number;
  estimated_price: number;
  /** v2.11 — prix proposé directement par le passager à la demande
   *  (null = le passager n'a pas proposé de prix). */
  passenger_offered_price: number | null;
  /** v2.6 — route non bitumée : demande du passager, point de dépôt,
   *  choix du chauffeur (figé à l'acceptation). */
  unpaved_requested: boolean | null;
  drop_off_point: string | null;
  unpaved_accepted: boolean | null;
  /** v2.30 — course planifiée : heure prévue + heure d'envoi réel. */
  scheduled_at: string | null;
  dispatched_at: string | null;
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
  /** v2.11 — contre-proposition du passager (null = aucune). */
  counter_price: number | null;
  /** v2.6 — le chauffeur prend la route non bitumée (true) ou s'arrête
   *  au point de dépôt (false). */
  unpaved_accepted: boolean | null;
  seats_left: number;
  first_stop: string;
  status: ProposalStatus;
  expires_at: string;
  created_at: string;
  /** Chauffeur joint. */
  driver?: ProfileRow | null;
  profiles?: ProfileRow | null;
}

/** Message de course (table `ride_messages`, v2.10) : échange in-app
 *  entre le passager et le chauffeur d'UNE course, pendant qu'elle est
 *  en cours. Aucun numéro de téléphone n'est exposé. */
export interface RideMessageRow {
  id: string;
  ride_id: string;
  sender_id: string;
  sender_role: 'passager' | 'chauffeur';
  body: string;
  created_at: string;
}

export interface RideMessage {
  id: string;
  rideId: string;
  senderId: string;
  senderRole: 'passager' | 'chauffeur';
  body: string;
  createdAt: string;
}

export function mapRideMessageRow(row: RideMessageRow): RideMessage {
  return {
    id: row.id,
    rideId: row.ride_id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

/** Dernière position connue du chauffeur pour une course acceptée
 *  (table `driver_locations`, v2.10) : une seule ligne par course,
 *  visible uniquement par son passager, uniquement avant le pickup. */
export interface DriverLocationRow {
  ride_id: string;
  driver_id: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  updated_at: string;
}

export interface DriverLocation {
  rideId: string;
  driverId: string;
  lat: number;
  lng: number;
  accuracyM: number | null;
  updatedAt: string;
}

export function mapDriverLocationRow(row: DriverLocationRow): DriverLocation {
  return {
    rideId: row.ride_id,
    driverId: row.driver_id,
    lat: row.lat,
    lng: row.lng,
    accuracyM: row.accuracy_m,
    updatedAt: row.updated_at,
  };
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
    comfort: row.comfort ?? false,
    preferredDriverId: row.preferred_driver_id ?? null,
    preferredUntil: row.preferred_until ?? null,
    vehiclePreference: row.vehicle_preference,
    seats: row.seats,
    estimatedPrice: row.estimated_price,
    offeredPrice: row.passenger_offered_price ?? null,
    unpavedRequested: row.unpaved_requested ?? false,
    dropOffPoint: row.drop_off_point ?? null,
    unpavedAccepted: row.unpaved_accepted ?? null,
    proposedPrice: row.proposed_price,
    firstStop: row.first_stop,
    paymentMethod: row.payment_method,
    message: row.message ?? '',
    status: row.status,
    platformFee: row.platform_fee ?? 0,
    driverShare: row.driver_share ?? 0,
    ratingDriver: row.rating_driver,
    ratingPassenger: row.rating_passenger,
    passengerRating: null,
    scheduledAt: row.scheduled_at ?? null,
    dispatchedAt: row.dispatched_at ?? null,
    loyaltyFree: row.loyalty_free ?? false,
    shareToken: row.share_token,
    cancelledBy: (row.cancelled_by as 'passager' | 'chauffeur' | null) ?? null,
    cancelReason: row.cancel_reason ?? null,
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
    // v2.19 — places libres déclarées (NULL = capacité entière libre).
    // Le statut dérivé n'est pas calculé ici : il faut les courses en
    // cours du chauffeur (voir `lib/seats.ts`).
    freeSeats: row.free_seats ?? row.seats ?? null,
    hasAirConditioning: row.has_air_conditioning ?? null,
    status: null,
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

/** Profil chauffeur SANS téléphone (v2.20 — confidentialité chauffeur) :
 *  le numéro de téléphone d'un chauffeur n'est JAMAIS rendu côté
 *  passager — ni avant, ni pendant, ni après la course. La
 *  communication passe par la messagerie in-app uniquement. À
 *  appliquer sur chaque profil chauffeur sérialisé vers le passager
 *  (propositions, course, suivi public, liste des chauffeurs en
 *  ligne). Côté chauffeur / admin, le téléphone reste disponible. */
export function stripDriverPhone(driver: DriverProfile | null): DriverProfile | null {
  if (!driver) return null;
  return { ...driver, phone: null };
}

/** Chauffeur anonyme pour la carte passager AVANT matching (v2.20) :
 *  la carte, le radar et le compteur n'ont besoin que de la position
 *  et du type de véhicule (moto / voiture, pour le filtre Solo et
 *  l'ETA). Nom, véhicule, plaque, note et téléphone ne sont PAS
 *  sérialisés vers le passager avant une proposition : ils ne peuvent
 *  donc pas fuir, même dans le code source de la page. L'identité
 *  complète n'arrive qu'avec une proposition (`/api/proposals`) ou
 *  une fois la course acceptée (`/api/rides/[id]`). */
export interface AnonymousMapDriver {
  id: string;
  lat: number | null;
  lng: number | null;
  vehicleType: VehicleType | null;
  isDemo: boolean;
}

export function toAnonymousMapDriver(driver: DriverProfile): AnonymousMapDriver {
  return {
    id: driver.id,
    lat: driver.lat,
    lng: driver.lng,
    vehicleType: driver.vehicleType,
    isDemo: driver.isDemo,
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
    counterPrice: row.counter_price ?? null,
    unpavedAccepted: row.unpaved_accepted ?? false,
    seatsLeft: row.seats_left,
    firstStop: row.first_stop,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    driver: driverRow ? mapDriverProfile(driverRow) : null,
  };
}
