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
  | 'quest_bonus_awarded' // bonus de quête versé (coût plateforme)
  | 'deposit_recorded' // dépôt de garantie enregistré par l'admin
  | 'settlement_recorded' // règlement hebdomadaire enregistré par l'admin
  | 'pin_failed' // code PIN faux (tentative comptée)
  | 'pin_locked' // 5 échecs PIN → course verrouillée
  | 'pin_unlocked' // course déverrouillée par l'admin
  | 'anomaly_detected' // montant incohérent détecté et bloqué
  | 'feedback_filed' // note / plainte / recommandation déposée
  | 'tier_changed'; // niveau chauffeur (Bronze → Argent…)

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
  deposit_recorded: 'Dépôt enregistré',
  settlement_recorded: 'Règlement enregistré',
  pin_failed: 'Code PIN faux',
  pin_locked: 'Course verrouillée (5 codes faux)',
  pin_unlocked: 'Course déverrouillée',
  anomaly_detected: 'Anomalie détectée',
  feedback_filed: 'Avis déposé',
  tier_changed: 'Niveau changé',
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
