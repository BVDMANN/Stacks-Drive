import type { Neighborhood, PaymentMethod, VehicleType } from '@/lib/neighborhoods';

export type UserRole = 'passager' | 'chauffeur';

/** Un chauffeur visible sur la carte (réel et en ligne, ou démo). */
export interface DriverProfile {
  id: string;
  name: string;
  phone: string | null;
  vehicleType: VehicleType | null;
  vehicleLabel: string;
  plate: string | null;
  seats: number | null;
  isVerified: boolean;
  isOnline: boolean;
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
  | 'annulee';

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
  rideType: RideType;
  /** Préférence de véhicule : voiture, moto (Solo uniquement) ou indifférent. */
  vehiclePreference: 'voiture' | 'moto' | 'tous';
  /** Nombre de passagers (1 en Solo, 1 à 4 en Groupe). */
  seats: number;
  /** Prix fixe estimé à la demande (FCFA) — calculé côté serveur. */
  estimatedPrice: number;
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
  /** 10e course offerte (fidélité) : le passager ne paie rien, le
   *  chauffeur touche l'intégralité du tarif, la plateforme absorbe. */
  loyaltyFree: boolean;
  /** Jeton public de suivi en direct (/suivi/[token]). */
  shareToken: string | null;
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
