/** Tickets de vérification chauffeur (v2.4) — types et helpers purs.
 *
 *  Ce module ne touche à aucune API serveur : il est importé par le
 *  composant client `VerificationTickets` (admin). Les lectures base
 *  sont dans `lib/tickets-server.ts` (serveur uniquement).
 */

import {
  CHECK_REASON_LABELS,
  type StoredVerificationChecks,
  type TicketKind,
  type TicketStatus,
  type TicketUrgency,
} from '@/lib/verification';

export interface VerificationTicket {
  id: string;
  driverId: string;
  driverName: string | null;
  driverEmail: string;
  driverPhone: string | null;
  kind: TicketKind;
  kindLabel: string;
  summary: string;
  details: Record<string, unknown>;
  urgency: TicketUrgency;
  status: TicketStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  emailSentAt: string | null;
  /** Contrôles automatiques stockés (pour l'affichage du détail). */
  checks: StoredVerificationChecks | null;
  /** Documents du chauffeur (chemins du bucket privé). */
  selfiePath: string | null;
  documentPath: string | null;
  documentType: string | null;
}

export const TICKET_KIND_LABELS: Record<TicketKind, string> = {
  doublon: 'Doublon de pièce détecté',
  mineur_possible: 'Âge incertain (mineur possible)',
  expiree_possible: 'Expiration incertaine (pièce peut-être expirée)',
  nom_approximatif: 'Nom approximatif',
  ocr_faible: 'Pièce peu lisible (OCR faible)',
  visage_non_detecte: 'Visage non détecté sur le selfie',
  photo_illisible: 'Photo illisible',
  controles_indisponibles: 'Contrôles automatiques indisponibles',
};

/** Détail lisible des contrôles (pour l'affichage admin). */
export function ticketCheckLines(ticket: VerificationTicket): string[] {
  const reasons = (ticket.details?.reasons as string[] | undefined) ?? [];
  if (reasons.length > 0) {
    return reasons.map((r) => CHECK_REASON_LABELS[r] ?? r);
  }
  return ['Aucun détail de contrôle disponible.'];
}
