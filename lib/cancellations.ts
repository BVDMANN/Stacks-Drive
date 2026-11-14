/** Annulation propre (v2.23, plancher P0a) — UNIQUE source de vérité.
 *
 *  Avant ce lot, annuler une course était un simple bouton : aucun
 *  motif, aucune notification à l'autre partie, aucun historique
 *  exploitable. Désormais :
 *    - motif obligatoire, choisi dans une liste courte (selon le rôle
 *      de celui qui annule) + précision libre optionnelle ;
 *    - notification immédiate à l'autre partie : message système dans
 *      la messagerie de course (lue toutes les 3 s côté client quand
 *      la course est acceptée) + journal d'audit ;
 *    - historique enregistré dans `ride_cancellations` (migration
 *      v2.23, à exécuter une seule fois) ET repli sur la table `rides`
 *      (`cancelled_by` / `cancel_reason`, déjà existantes) si la
 *      migration n'est pas encore appliquée — l'annulation ne bloque
 *      jamais sur une table absente ;
 *    - fiabilité : annulations comptées par utilisateur (terminées vs
 *      annulées) — indicateur visible côté admin et sur le profil
 *      chauffeur ; les annulations répétées sont signalées
 *      (« À surveiller » : 3 annulations ou plus ET taux > 25 %).
 *
 *  Libération des places (v2.19) : UNE course acceptée puis annulée
 *  libère sa place (Groupe + 1, Solo → capacité entière) — c'est
 *  `releaseSeat` dans PATCH /api/rides/[id], réutilisé ici, jamais
 *  dupliqué. Une demande jamais acceptée n'avait rien occupé.
 *
 *  Règle : les prix ne sont jamais recalculés ici, la commission
 *  (lib/commission.ts) n'est pas touchée. */

import type { SupabaseClient } from '@supabase/supabase-js';

export type CancelRole = 'passager' | 'chauffeur';

export type CancelReasonCode =
  | 'changement_programme'
  | 'attente_trop_longue'
  | 'chauffeur_introuvable'
  | 'erreur_trajet'
  | 'prix'
  | 'passager_absent'
  | 'passager_injoignable'
  | 'trajet_impossible'
  | 'erreur_course'
  | 'autre';

export interface CancelReason {
  code: CancelReasonCode;
  label: string;
  roles: CancelRole[];
}

export const CANCEL_REASONS: CancelReason[] = [
  { code: 'changement_programme', label: 'Changement de programme', roles: ['passager'] },
  { code: 'attente_trop_longue', label: 'Attente trop longue', roles: ['passager'] },
  { code: 'chauffeur_introuvable', label: 'Chauffeur introuvable / ne répond pas', roles: ['passager'] },
  { code: 'erreur_trajet', label: 'Erreur sur le trajet (départ / destination)', roles: ['passager'] },
  { code: 'prix', label: 'Désaccord sur le prix', roles: ['passager'] },
  { code: 'passager_absent', label: 'Passager absent au point de départ', roles: ['chauffeur'] },
  { code: 'passager_injoignable', label: 'Passager injoignable', roles: ['chauffeur'] },
  { code: 'trajet_impossible', label: 'Trajet impossible (route, accès)', roles: ['chauffeur'] },
  { code: 'erreur_course', label: 'Erreur sur la course', roles: ['chauffeur'] },
  { code: 'autre', label: 'Autre raison', roles: ['passager', 'chauffeur'] },
];

export const CANCEL_REASON_CODES = CANCEL_REASONS.map((r) => r.code);

/** Motifs proposés à celui qui annule (selon son rôle). */
export function cancelReasonsFor(role: CancelRole): CancelReason[] {
  return CANCEL_REASONS.filter((r) => r.roles.includes(role));
}

export function cancelReasonLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return CANCEL_REASONS.find((r) => r.code === code)?.label ?? code;
}

/** Libellé lisible stocké dans `rides.cancel_reason` (compatibilité :
 *  l'historique et les litiges lisent déjà cette colonne). */
export function cancelReasonText(code: CancelReasonCode, detail?: string | null): string {
  const label = cancelReasonLabel(code) ?? code;
  const clean = (detail ?? '').trim();
  return clean ? `${label} — ${clean.slice(0, 200)}` : label;
}

// ---------------------------------------------------------------------------
// Fiabilité (annulations comptées)
// ---------------------------------------------------------------------------

export interface ReliabilityStats {
  completed: number;
  cancelled: number;
  /** Annulations dont l'utilisateur est l'auteur. */
  cancelledByMe: number;
  total: number;
  /** Part d'annulations sur les courses clôturées (0 à 1). */
  cancelRate: number;
  /** Fiabilité = part de courses menées à terme (0 à 100). */
  reliabilityPct: number;
  /** Annulations répétées : à signaler côté admin / profil. */
  flagged: boolean;
}

/** Seuil de signalement : 3 annulations ou plus ET plus d'1 course
 *  clôturée sur 4 annulée. Un chauffeur qui annule une fois n'est
 *  jamais signalé. */
export const RELIABILITY_FLAG_MIN_CANCELLED = 3;
export const RELIABILITY_FLAG_MIN_RATE = 0.25;

export function computeReliability(
  completed: number,
  cancelled: number,
  cancelledByMe = cancelled
): ReliabilityStats {
  const total = completed + cancelled;
  const cancelRate = total > 0 ? cancelled / total : 0;
  return {
    completed,
    cancelled,
    cancelledByMe,
    total,
    cancelRate,
    reliabilityPct: total > 0 ? Math.round(((total - cancelled) / total) * 100) : 100,
    flagged: cancelled >= RELIABILITY_FLAG_MIN_CANCELLED && cancelRate > RELIABILITY_FLAG_MIN_RATE,
  };
}

// ---------------------------------------------------------------------------
// Enregistrement + notification (côté serveur uniquement)
// ---------------------------------------------------------------------------

export interface RecordCancellationInput {
  rideId: string;
  cancelledByUserId: string;
  cancelledByRole: CancelRole;
  reasonCode: CancelReasonCode;
  reasonDetail?: string | null;
  /** La course avait un chauffeur assigné : il y a quelqu'un à prévenir. */
  hasCounterpart: boolean;
  /** La messagerie était ouverte (course acceptée) : le message
   *  système y est visible immédiatement (sondage 3 s). */
  chatWasOpen: boolean;
}

/** Enregistre l'annulation dans `ride_cancellations` (si la migration
 *  v2.23 est appliquée) et prévient l'autre partie par un message
 *  système dans la messagerie de course. Ne lève jamais d'exception :
 *  l'annulation elle-même (statut `annulee` dans `rides`) a déjà
 *  abouti quand cette fonction est appelée. */
export async function recordCancellation(
  supabase: SupabaseClient,
  input: RecordCancellationInput
): Promise<void> {
  const label = cancelReasonLabel(input.reasonCode) ?? input.reasonCode;
  try {
    await supabase.from('ride_cancellations').insert({
      ride_id: input.rideId,
      cancelled_by_user_id: input.cancelledByUserId,
      cancelled_by_role: input.cancelledByRole,
      reason_code: input.reasonCode,
      reason_detail: (input.reasonDetail ?? '').trim() || null,
    });
  } catch {
    // Table absente (migration v2.23 non appliquée) : l'historique
    // reste lisible via rides.cancelled_by / cancel_reason.
  }
  if (!input.hasCounterpart || !input.chatWasOpen) return;
  const who = input.cancelledByRole === 'passager' ? 'Le passager' : 'Le chauffeur';
  const detail = (input.reasonDetail ?? '').trim();
  try {
    await supabase.from('ride_messages').insert({
      ride_id: input.rideId,
      sender_id: input.cancelledByUserId,
      sender_role: input.cancelledByRole,
      body: `❌ Course annulée par ${who === 'Le passager' ? 'le passager' : 'le chauffeur'} — ${label}${detail ? ` : ${detail.slice(0, 200)}` : ''}.`,
    });
  } catch {
    // Messagerie absente ou fermée : l'audit garde la trace.
  }
}

export interface CancellationHistoryEntry {
  rideId: string;
  cancelledByRole: CancelRole | null;
  reasonCode: string | null;
  reasonLabel: string | null;
  reasonDetail: string | null;
  createdAt: string;
}

/** Historique des annulations d'un utilisateur (ses courses annulées,
 *  avec le motif). Repli sur `rides` si la table dédiée est absente. */
export async function getCancellationHistory(
  supabase: SupabaseClient,
  userId: string,
  limit = 20
): Promise<CancellationHistoryEntry[]> {
  const { data, error } = await supabase
    .from('ride_cancellations')
    .select('ride_id, cancelled_by_role, reason_code, reason_detail, created_at')
    .eq('cancelled_by_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!error && data) {
    return (data as {
      ride_id: string;
      cancelled_by_role: CancelRole;
      reason_code: string;
      reason_detail: string | null;
      created_at: string;
    }[]).map((r) => ({
      rideId: r.ride_id,
      cancelledByRole: r.cancelled_by_role,
      reasonCode: r.reason_code,
      reasonLabel: cancelReasonLabel(r.reason_code),
      reasonDetail: r.reason_detail,
      createdAt: r.created_at,
    }));
  }
  // Repli : les annulations sont aussi dans `rides` (statut + motif).
  const { data: rides } = await supabase
    .from('rides')
    .select('id, cancelled_by, cancel_reason, updated_at')
    .eq('status', 'annulee')
    .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(limit);
  return ((rides ?? []) as {
    id: string;
    cancelled_by: string | null;
    cancel_reason: string | null;
    updated_at: string;
  }[]).map((r) => ({
    rideId: r.id,
    cancelledByRole: (r.cancelled_by as CancelRole | null) ?? null,
    reasonCode: null,
    reasonLabel: r.cancel_reason,
    reasonDetail: null,
    createdAt: r.updated_at,
  }));
}

/** Fiabilité d'un utilisateur, lue depuis `rides` (terminées vs
 *  annulées) — aucune dépendance à la migration v2.23. */
export async function getUserReliability(
  supabase: SupabaseClient,
  userId: string
): Promise<ReliabilityStats> {
  const { data } = await supabase
    .from('rides')
    .select('status, cancelled_by')
    .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
    .in('status', ['terminee', 'annulee']);
  const rows = (data ?? []) as { status: string; cancelled_by: string | null }[];
  const completed = rows.filter((r) => r.status === 'terminee').length;
  const cancelledRows = rows.filter((r) => r.status === 'annulee');
  return computeReliability(completed, cancelledRows.length, cancelledRows.length);
}

/** Fiabilité de chaque chauffeur (admin) : courses terminées,
 *  annulations (dont celles dont il est l'auteur), signalement. */
export async function getDriverReliabilityMap(
  supabase: SupabaseClient,
  driverIds: string[]
): Promise<Map<string, ReliabilityStats>> {
  const map = new Map<string, ReliabilityStats>();
  driverIds.forEach((id) => map.set(id, computeReliability(0, 0, 0)));
  if (driverIds.length === 0) return map;
  const { data } = await supabase
    .from('rides')
    .select('driver_id, status, cancelled_by')
    .in('driver_id', driverIds)
    .in('status', ['terminee', 'annulee']);
  const rows = (data ?? []) as { driver_id: string | null; status: string; cancelled_by: string | null }[];
  const agg = new Map<string, { completed: number; cancelled: number; byMe: number }>();
  rows.forEach((r) => {
    if (!r.driver_id) return;
    const cur = agg.get(r.driver_id) ?? { completed: 0, cancelled: 0, byMe: 0 };
    if (r.status === 'terminee') cur.completed += 1;
    else {
      cur.cancelled += 1;
      if (r.cancelled_by === 'chauffeur') cur.byMe += 1;
    }
    agg.set(r.driver_id, cur);
  });
  agg.forEach((a, id) => map.set(id, computeReliability(a.completed, a.cancelled, a.byMe)));
  return map;
}
