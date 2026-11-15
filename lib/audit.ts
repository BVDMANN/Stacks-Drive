/** Journal d'audit Stacks Drive (v2.2).
 *
 *  Chaque événement sensible est consigné dans la table `audit_log`
 *  (créée par migration-v2.2.sql) : tarif calculé, commission
 *  enregistrée, dépôt, règlement, échec PIN, prix rejeté, anomalie.
 *  L'admin les relit dans /admin. L'écriture passe par le client
 *  Supabase authentifié (politique RLS : insertion par son propre
 *  acteur uniquement) ; la lecture est réservée à l'admin.
 *  Si la table n'existe pas encore (migration non appliquée), l'écriture
 *  échoue silencieusement — jamais de crash pour un log.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/** Événements suivis dans le journal d'audit. */
export type AuditEvent =
  | 'fare_computed' // tarif estimé côté serveur à la demande
  | 'price_rejected' // prix proposé hors bornes / incohérent → refusé
  | 'commission_recorded' // commission figée à la clôture d'une course
  | 'double_ride_awarded' // Course Double tirée au sort
  | 'quest_bonus_awarded' // bonus de quête versé (coût plateforme, avant v2.3)
  | 'points_awarded' // points de quête versés (v2.3, pas d'argent)
  | 'points_redeemed' // échange de points contre des courses sans commission (v2.3)
  | 'deposit_recorded' // dépôt de garantie enregistré par l'admin
  | 'settlement_recorded' // règlement hebdomadaire enregistré par l'admin
  | 'pin_failed' // code PIN faux (tentative comptée)
  | 'pin_locked' // 5 échecs PIN → course verrouillée
  | 'pin_unlocked' // course déverrouillée par l'admin
  | 'anomaly_detected' // montant incohérent détecté et bloqué
  | 'feedback_filed' // note / plainte / recommandation déposée
  | 'tier_changed' // niveau chauffeur (Bronze → Argent…)
  | 'verification_auto_verified' // vérification auto : dossier vérifié sans admin (v2.4)
  | 'verification_auto_refused' // vérification auto : dossier refusé sans admin (v2.4)
  | 'verification_ticket_created' // dossier ambigu → ticket pour l'admin (v2.4)
  | 'verification_ticket_resolved' // ticket résolu par l'admin (v2.4)
  | 'dispute_opened' // litige ouvert par une partie de la course (v2.15)
  | 'complaint_auto_replied' // plainte standard : réponse auto immédiate, sans humain (v2.29)
  | 'complaint_escalated' // plainte escaladée en litige après réponse auto rejetée (v2.29)
  | 'dispute_status_changed' // litige : ouvert → en cours → résolu (v2.15)
  | 'dispute_decided' // décision admin sur un litige : ajustement dette / commission (v2.15)
  | 'settlement_declared' // chauffeur : « J'ai payé » (déclaration, non validée) (v2.15)
  | 'settlement_validated' // admin : déclaration validée en 1 clic → règlement (v2.15)
  | 'weekly_settlements_generated' // relevés hebdo générés par la route cron (v2.15)
  | 'weekly_report_sent' // rapport hebdo généré + e-mail admin (v2.15)
  | 'ride_cancelled' // course annulée (motif, auteur) (v2.23)
  | 'sos_triggered' // bouton SOS déclenché pendant une course (v2.23)
  | 'trusted_share_sent' // lien de suivi envoyé auto aux contacts de confiance (v2.23)
  | 'fraud_blocked' // suspicion de fraude : dossier ouvert, compte bloqué temporairement ou signalé (v2.26)
  | 'fraud_unblocked' // compte débloqué par l'admin après contrôle (v2.26)
  | 'data_cleanup' // nettoyage hebdo RGPD : positions, propositions expirées, comptes inactifs comptés (v2.26)
  | 'ride_relaunched' // course planifiée expirée relancée par le passager (v2.30)
  | 'selfie_recheck_passed' // re-vérification selfie : visage détecté, drapeau levé (v2.30)
  | 'selfie_recheck_ambiguous' // re-vérification selfie : aucun visage, ticket admin (v2.30)
  | 'ridecheck_checkin' // RideCheck : signal confirmé, check-in ouvert au passager (v2.34)
  | 'ridecheck_answer' // RideCheck : réponse du passager au check-in (v2.34)
  | 'ridecheck_no_response' // RideCheck : check-in sans réponse, alerte admin (v2.34)
  | 'card_hold_created' // paiement carte : empreinte créée (v2.55)
  | 'card_hold_confirmed' // paiement carte : empreinte confirmée (v2.55)
  | 'card_hold_voided' // paiement carte : empreinte annulée (v2.55)
  | 'card_captured' // paiement carte : capture à la fin de la course (v2.55)
  | 'card_capture_failed' // paiement carte : capture en échec (v2.55)
  | 'card_capture_without_earnings' // paiement carte : capture sans gains clôturés (v2.55)
  | 'card_deposit_paid' // paiement carte : caution versée (v2.55)
  | 'card_deposit_refunded' // paiement carte : caution remboursée (v2.55)
  | 'card_deposit_forfeited' // paiement carte : caution confisquée (v2.55)
  | 'card_debt_paid' // paiement carte : dette remboursée par carte (v2.55)
  | 'daily_payouts_cron' // lots quotidiens générés par le cron (v2.55)
  | 'daily_batch_paid' // lot quotidien marqué comme viré (v2.55)
  | 'driver_left' // chauffeur : compte fermé, caution remboursée (v2.55)
  | 'stripe_webhook_error'; // webhook Stripe : événement reconnu, traitement en échec (v2.55)

/** Consigne un événement d'audit. Ne lève jamais d'exception. */
export async function logAudit(
  supabase: SupabaseClient,
  event: AuditEvent,
  details: Record<string, unknown> & { actorId?: string | null; rideId?: string | null }
): Promise<void> {
  try {
    const { actorId, rideId, ...rest } = details;
    const { error } = await supabase.from('audit_log').insert({
      actor_id: actorId ?? null,
      event,
      ride_id: rideId ?? null,
      details: rest,
    });
    if (error) console.error('[audit]', event, error.message);
  } catch (err) {
    console.error('[audit]', event, err);
  }
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  event: string;
  ride_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor_name?: string | null;
}

/** Libellés français des événements (affichage admin). */
export const AUDIT_LABELS: Record<string, string> = {
  fare_computed: 'Tarif calculé',
  price_rejected: 'Prix refusé (hors bornes)',
  commission_recorded: 'Commission enregistrée',
  double_ride_awarded: 'Course Double attribuée',
  quest_bonus_awarded: 'Bonus de quête versé',
  points_awarded: 'Points attribués (quête)',
  points_redeemed: 'Points échangés (courses sans commission)',
  deposit_recorded: 'Dépôt enregistré',
  settlement_recorded: 'Règlement enregistré',
  pin_failed: 'Code PIN faux',
  pin_locked: 'Course verrouillée (5 codes faux)',
  pin_unlocked: 'Course déverrouillée',
  anomaly_detected: 'Anomalie détectée',
  feedback_filed: 'Avis déposé',
  tier_changed: 'Niveau changé',
  verification_auto_verified: 'Vérification auto : vérifié',
  verification_auto_refused: 'Vérification auto : refusé',
  verification_ticket_created: 'Ticket de vérification créé',
  verification_ticket_resolved: 'Ticket de vérification résolu',
  dispute_opened: 'Litige ouvert',
  complaint_auto_replied: 'Plainte standard — réponse auto',
  complaint_escalated: 'Plainte escaladée après réponse auto',
  dispute_status_changed: 'Statut de litige changé',
  dispute_decided: 'Décision de litige (ajustement)',
  settlement_declared: 'Règlement déclaré (« J’ai payé »)',
  settlement_validated: 'Règlement validé par l’admin',
  weekly_settlements_generated: 'Relevés hebdo générés',
  weekly_report_sent: 'Rapport hebdo envoyé',
  ride_cancelled: 'Course annulée',
  sos_triggered: 'SOS déclenché',
  trusted_share_sent: 'Suivi partagé aux contacts de confiance',
  fraud_blocked: 'Suspicion de fraude — compte signalé / bloqué',
  fraud_unblocked: 'Compte débloqué après contrôle fraude',
  data_cleanup: 'Nettoyage hebdo des données (RGPD)',
  card_hold_created: 'Empreinte carte créée',
  card_hold_confirmed: 'Empreinte carte confirmée',
  card_hold_voided: 'Empreinte carte annulée',
  card_captured: 'Paiement carte encaissé',
  card_capture_failed: 'Capture carte en échec',
  card_capture_without_earnings: 'Capture carte sans gains clôturés',
  card_deposit_paid: 'Caution carte versée',
  card_deposit_refunded: 'Caution carte remboursée',
  card_deposit_forfeited: 'Caution carte confisquée',
  card_debt_paid: 'Dette remboursée par carte',
  daily_payouts_cron: 'Lots quotidiens générés',
  daily_batch_paid: 'Lot quotidien viré',
  driver_left: 'Chauffeur parti (caution remboursée)',
  stripe_webhook_error: 'Webhook Stripe en erreur',
};

/** Derniers événements d'audit (admin). [] si la table n'existe pas. */
export async function getRecentAuditEvents(limit = 30): Promise<AuditLogEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('audit_log')
    .select('id, actor_id, event, ride_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) {
    if (error) console.error('[audit] lecture:', error.message);
    return [];
  }
  const rows = data as AuditLogEntry[];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', actorIds);
    const names = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name])
    );
    rows.forEach((r) => {
      r.actor_name = r.actor_id ? (names.get(r.actor_id) ?? null) : null;
    });
  }
  return rows;
}
