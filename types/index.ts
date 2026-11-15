import type { Neighborhood, PaymentMethod, VehicleType } from '@/lib/neighborhoods';

export type UserRole = 'passager' | 'chauffeur';

/** Statut d'un chauffeur (v2.19) — DÉRIVÉ des places libres et des
 *  courses en cours, jamais stocké (voir `lib/seats.ts`) :
 *  Vide (aucune course, véhicule libre), En course (course en cours,
 *  avec ou sans places restantes — une Solo en cours = sans
 *  disponibilité), Plein (0 place libre). */
export type DriverStatus = 'vide' | 'en_course' | 'plein';

/** Un chauffeur visible sur la carte (réel et en ligne, ou démo). */
export interface DriverProfile {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: VehicleType | null;
  vehicleLabel: string;
  plate: string | null;
  seats: number | null;
  /** Places libres déclarées (v2.19) : null = jamais déclarées =
   *  capacité entière libre. */
  freeSeats: number | null;
  /** Statut dérivé (v2.19) — null quand il n'est pas calculé
   *  (ex. marqueur carte sans courses jointes). */
  status: DriverStatus | null;
  isVerified: boolean;
  isOnline: boolean;
  /** Climatisation déclarée (v2.34, classe Confort) — optionnel :
   *  les chauffeurs démo et les objets construits à la main ne le
   *  renseignent pas (null = non déclaré). */
  hasAirConditioning?: boolean | null;
  /** Note moyenne (1 à 5) — null si aucune course notée. */
  rating: number | null;
  /** Nombre de courses terminées. */
  trips: number;
  /** Quartier où se trouve le chauffeur. */
  area: Neighborhood | null;
  lat: number | null;
  lng: number | null;
  isDemo: boolean;
}

/** Types de course (sélecteur style Uber dans la feuille du bas). */
export type RideType = 'solo' | 'groupe';

/** Statuts d'une demande de course (créée par le passager). */
export type RideStatus =
  | 'recherche' // demande envoyée, on cherche des chauffeurs
  | 'propositions' // au moins une proposition reçue
  | 'acceptee' // une proposition acceptée, chauffeur assigné
  | 'en_cours' // course démarrée
  | 'terminee'
  | 'annulee'
  | 'planifiee' // v2.30 : planifiée pour plus tard, pas encore envoyée
  | 'expiree'; // v2.30 : heure passée sans chauffeur, relançable

/** Note moyenne d'un passager (v2.30) — ce que le chauffeur voit au
 *  matching pour décider d'accepter. Null = aucune course notée. */
export interface PassengerRating {
  average: number;
  count: number;
}

/** Statuts d'une proposition de chauffeur. */
export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/** Statuts de la vérification d'identité d'un chauffeur. */
export type VerificationStatus = 'non_verifie' | 'en_attente' | 'verifie' | 'refuse';

/** Type de pièce d'identité pour la vérification chauffeur. */
export type IdDocumentType = 'cni' | 'passeport' | 'permis';

export interface Ride {
  id: string;
  passengerId: string | null;
  driverId: string | null;
  pickup: string;
  destination: string;
  /** Points exacts (v2.47) : coordonnées + adresse résolue du départ
   *  et de la destination (épingle, lieu, GPS). Null = centre de
   *  quartier. Optionnels : les objets construits à la main
   *  (tutoriels) ne les renseignent pas. */
  pickupPoint?: { lat: number; lng: number; address: string | null } | null;
  destinationPoint?: { lat: number; lng: number; address: string | null } | null;
  rideType: RideType;
  /** Préférence de véhicule : voiture, moto (Solo uniquement) ou indifférent. */
  vehiclePreference: 'voiture' | 'moto' | 'tous';
  /** Classe Confort (v2.34) : clim garantie, chauffeurs 4,5★ et plus.
   *  Une course Confort est une Solo (véhicule entier) avec ce
   *  drapeau — même estimation et même modèle de prix que Solo.
   *  Optionnel : les objets construits à la main (tutoriels) ne le
   *  renseignent pas (absent = non-Confort). */
  comfort?: boolean;
  /** Chauffeur favori prioritaire (v2.34) : la demande lui est
   *  réservée jusqu'à `preferredUntil`, puis s'ouvre aux autres.
   *  Optionnels pour la même raison. */
  preferredDriverId?: string | null;
  preferredUntil?: string | null;
  /** Nombre de passagers (1 en Solo, 1 à 4 en Groupe). */
  seats: number;
  /** Prix fixe estimé à la demande (FCFA) — estimation indicative
   *  calculée côté serveur, pas le prix de la course : le prix final
   *  est convenu entre le passager et le chauffeur, puis figé à
   *  l'acceptation. */
  estimatedPrice: number;
  /** Prix proposé directement par le passager à la demande (FCFA,
   *  optionnel, v2.11) : visible par les chauffeurs, qui peuvent
   *  l'accepter en proposant ce prix ou contre-proposer. Null = le
   *  passager n'a pas proposé de prix, il attend les propositions. */
  offeredPrice: number | null;
  /** Route non bitumée (v2.6) : le passager a demandé la continuité
   *  jusqu'à un quartier à accès difficile (+ supplément). */
  unpavedRequested: boolean;
  /** Point de dépôt quand la destination est à accès difficile : la
   *  course s'y arrête par défaut (null = destination normale). */
  dropOffPoint: string | null;
  /** Route non bitumée acceptée par le chauffeur (figé à l'acceptation).
   *  Null tant que la course n'est pas acceptée. */
  unpavedAccepted: boolean | null;
  /** Prix proposé par le chauffeur et accepté (FCFA) — figé à l'acceptation. */
  proposedPrice: number | null;
  /** Premier arrêt / point de prise en charge proposé par le chauffeur. */
  firstStop: string | null;
  paymentMethod: PaymentMethod;
  message: string;
  status: RideStatus;
  /** Découpe figée à l'acceptation : commission plateforme + part chauffeur. */
  platformFee: number;
  driverShare: number;
  /** Notes après course (1 à 5). */
  ratingDriver: number | null;
  ratingPassenger: number | null;
  /** Note moyenne du passager (v2.30) — jointe côté serveur pour le
   *  chauffeur au matching (demandes entrantes / carte de course).
   *  Null = pas encore calculée / aucune course notée. */
  passengerRating: PassengerRating | null;
  /** Course planifiée (v2.30) : heure prévue (ISO) et heure d'envoi
   *  réel aux chauffeurs (~15 min avant). Nulls = course immédiate. */
  scheduledAt: string | null;
  dispatchedAt: string | null;
  /** 10e course offerte (fidélité) : le passager ne paie rien, le
   *  chauffeur touche l'intégralité du tarif, la plateforme absorbe. */
  loyaltyFree: boolean;
  /** Jeton public de suivi en direct (/suivi/[token]). */
  shareToken: string | null;
  /** Qui a annulé la course (v2.23) : 'passager' / 'chauffeur' / null. */
  cancelledBy: 'passager' | 'chauffeur' | null;
  /** Motif d'annulation, libellé lisible (v2.23). */
  cancelReason: string | null;
  /** Code PIN à 4 chiffres (v2.2) : généré à l'acceptation, le passager
   *  le donne au chauffeur pour démarrer le trajet. Null tant que la
   *  course n'est pas acceptée. */
  pinCode: string | null;
  /** Tentatives PIN ratées (5 échecs = course verrouillée). */
  pinAttempts: number;
  /** Course verrouillée après 5 codes faux — seul l'admin déverrouille. */
  pinLocked: boolean;
  /** Début / fin réels du trajet. */
  startedAt: string | null;
  completedAt: string | null;
  /** Distance et durée figées à l'acceptation (matrice tarifaire). */
  distanceKm: number | null;
  durationMin: number | null;
  /** Taux de commission appliqué à cette course (figé, selon le niveau
   *  du chauffeur — jamais au-dessus du plafond de 10 %). */
  commissionRate: number | null;
  /** Course Double (v2.2) : commission offerte, le chauffeur garde 100 %. */
  isDoubleRide: boolean;
  /** Coût absorbé par la plateforme sur cette course (commission offerte
   *  Course Double, course fidélité, bonus de quête). */
  platformCost: number;
  createdAt: string;
  updatedAt: string;
}

/** Proposition d'un chauffeur sur une demande de course. */
export interface RideProposal {
  id: string;
  rideId: string;
  driverId: string;
  /** Prix proposé par le chauffeur pour cette course (FCFA). */
  proposedPrice: number;
  /** Contre-proposition du passager sur cette proposition (FCFA,
   *  v2.11) : le chauffeur peut l'accepter telle quelle ou proposer
   *  un autre prix. Null = pas de contre-proposition. */
  counterPrice: number | null;
  /** Route non bitumée (v2.6) : le chauffeur prend la piste jusqu'à la
   *  destination (true) ou s'arrête au point de dépôt (false). */
  unpavedAccepted: boolean;
  /** Places restantes dans son véhicule. */
  seatsLeft: number;
  /** Premier arrêt / point de prise en charge proposé. */
  firstStop: string;
  status: ProposalStatus;
  /** Expiration : 60 secondes après la proposition. */
  expiresAt: string;
  createdAt: string;
  /** Chauffeur joint (quand la proposition est lue côté passager). */
  driver?: DriverProfile | null;
  /** Secondes restantes avant expiration (calculé côté client). */
  secondsLeft?: number;
}
