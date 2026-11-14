/** Litiges (v2.15) — constantes et types partagés (client + serveur).
 *  Aucun import serveur ici : ce fichier peut être importé par des
 *  composants clients. Les lectures serveur vivent dans lib/disputes.ts.
 */

/** Motifs de litige (liste courte, côté passager comme chauffeur). */
export const DISPUTE_REASONS = [
  'prix',
  'paiement',
  'trajet',
  'comportement',
  'vehicule',
  'annulation',
  'autre',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export const DISPUTE_REASON_LABELS: Record<DisputeReason, string> = {
  prix: 'Prix convenu non respecté',
  paiement: 'Paiement / monnaie',
  trajet: 'Itinéraire / destination',
  comportement: 'Comportement',
  vehicule: 'Véhicule / propreté',
  annulation: 'Annulation / non-présentation',
  autre: 'Autre',
};

export const DISPUTE_STATUSES = ['ouvert', 'en_cours', 'resolu'] as const;
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu',
};

export interface DisputeDecision {
  id: string;
  adminId: string;
  debtAdjustmentFcfa: number;
  commissionAdjustmentFcfa: number;
  reason: string;
  createdAt: string;
}

export interface DisputeMessage {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

export interface Dispute {
  id: string;
  rideId: string;
  openedById: string;
  openedByRole: 'passager' | 'chauffeur';
  openedByName: string | null;
  reason: DisputeReason;
  amountConcerned: number | null;
  message: string;
  status: DisputeStatus;
  createdAt: string;
  resolvedAt: string | null;
}

/** Dossier complet d'un litige (admin) : course + prix + messages +
 *  position + PIN. Les noms seulement — jamais les téléphones. */
export interface DisputeDossier extends Dispute {
  pickup: string;
  destination: string;
  rideType: string;
  rideStatus: string;
  acceptedPrice: number | null;
  estimatedPrice: number;
  platformFee: number;
  driverShare: number;
  passengerName: string | null;
  driverName: string | null;
  pinLocked: boolean;
  pinAttempts: number;
  pinCode: string | null;
  messages: DisputeMessage[];
  lastLocation: { lat: number; lng: number; updatedAt: string } | null;
  decisions: DisputeDecision[];
}
