/** Litiges in-app (v2.15) — lectures côté serveur.
 *
 *  Un passager ou un chauffeur ouvre un litige depuis sa course (motif,
 *  montant concerné, message libre). Le dossier complet est visible dans
 *  /admin : course, prix accepté, messages in-app, dernière position
 *  connue, statut du code PIN. AUCUN numéro de téléphone n'est jamais
 *  exposé dans un dossier de litige (noms seulement).
 *
 *  Si les tables v2.15 n'existent pas encore (migration non appliquée),
 *  les lectures renvoient des listes vides — jamais de crash.
 */

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { Dispute, DisputeDecision, DisputeDossier, DisputeMessage, DisputeReason, DisputeStatus } from '@/lib/dispute-types';

export type {
  Dispute,
  DisputeDecision,
  DisputeDossier,
  DisputeMessage,
  DisputeReason,
  DisputeStatus,
} from '@/lib/dispute-types';
export {
  DISPUTE_REASONS,
  DISPUTE_REASON_LABELS,
  DISPUTE_STATUSES,
  DISPUTE_STATUS_LABELS,
} from '@/lib/dispute-types';

interface DisputeRow {
  id: string;
  ride_id: string;
  opened_by_id: string;
  opened_by_role: 'passager' | 'chauffeur';
  reason: DisputeReason;
  amount_concerned: number | null;
  message: string;
  status: DisputeStatus;
  created_at: string;
  resolved_at: string | null;
}

function mapDisputeRow(row: DisputeRow, names: Map<string, string | null>): Dispute {
  return {
    id: row.id,
    rideId: row.ride_id,
    openedById: row.opened_by_id,
    openedByRole: row.opened_by_role,
    openedByName: names.get(row.opened_by_id) ?? null,
    reason: row.reason,
    amountConcerned: row.amount_concerned,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

async function fetchNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>();
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return names;
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', unique);
  (data ?? []).forEach((p: { id: string; full_name: string | null }) =>
    names.set(p.id, p.full_name)
  );
  return names;
}

/** Tous les litiges (admin), les plus récents d'abord. [] si la table
 *  v2.15 n'existe pas encore. */
export async function getAdminDisputes(): Promise<Dispute[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('disputes')
    .select('id, ride_id, opened_by_id, opened_by_role, reason, amount_concerned, message, status, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error || !data) {
    if (error) console.error('[disputes] lecture admin:', error.message);
    return [];
  }
  const rows = data as DisputeRow[];
  const names = await fetchNames(
    supabase,
    rows.map((r) => r.opened_by_id)
  );
  return rows.map((r) => mapDisputeRow(r, names));
}

/** Nombre de litiges ouverts (pour le rapport hebdo). */
export async function getOpenDisputesCount(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('disputes')
    .select('id', { count: 'exact', head: true })
    .in('status', ['ouvert', 'en_cours']);
  if (error) return 0;
  return count ?? 0;
}

/** Litiges ouverts depuis plus de 7 jours (alerte du rapport hebdo). */
export async function getStaleOpenDisputes(): Promise<Dispute[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('disputes')
    .select('id, ride_id, opened_by_id, opened_by_role, reason, amount_concerned, message, status, created_at, resolved_at')
    .in('status', ['ouvert', 'en_cours'])
    .lt('created_at', weekAgo)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  const rows = data as DisputeRow[];
  const names = await fetchNames(
    supabase,
    rows.map((r) => r.opened_by_id)
  );
  return rows.map((r) => mapDisputeRow(r, names));
}

/** Dossier complet d'un litige (admin). Null si introuvable ou si la
 *  table v2.15 n'existe pas encore. */
export async function getDisputeDossier(disputeId: string): Promise<DisputeDossier | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('disputes')
    .select('id, ride_id, opened_by_id, opened_by_role, reason, amount_concerned, message, status, created_at, resolved_at')
    .eq('id', disputeId)
    .single();
  if (error || !data) {
    if (error) console.error('[disputes] dossier:', error.message);
    return null;
  }
  const row = data as DisputeRow;

  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, pickup, destination, ride_type, status, proposed_price, estimated_price, platform_fee, driver_share, pin_locked, pin_attempts, pin_code')
    .eq('id', row.ride_id)
    .single();
  if (!ride) return null;
  const rideRow = ride as {
    passenger_id: string | null;
    driver_id: string | null;
    pickup: string;
    destination: string;
    ride_type: string;
    status: string;
    proposed_price: number | null;
    estimated_price: number;
    platform_fee: number;
    driver_share: number;
    pin_locked: boolean;
    pin_attempts: number;
    pin_code: string | null;
  };

  const [names, messagesRes, locationRes, decisionsRes] = await Promise.all([
    fetchNames(supabase, [
      row.opened_by_id,
      rideRow.passenger_id ?? '',
      rideRow.driver_id ?? '',
    ]),
    supabase
      .from('ride_messages')
      .select('id, sender_role, body, created_at')
      .eq('ride_id', row.ride_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('driver_locations')
      .select('lat, lng, updated_at')
      .eq('ride_id', row.ride_id)
      .single(),
    supabase
      .from('dispute_decisions')
      .select('id, admin_id, debt_adjustment_fcfa, commission_adjustment_fcfa, reason, created_at')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: true }),
  ]);

  return {
    ...mapDisputeRow(row, names),
    pickup: rideRow.pickup,
    destination: rideRow.destination,
    rideType: rideRow.ride_type,
    rideStatus: rideRow.status,
    acceptedPrice: rideRow.proposed_price,
    estimatedPrice: rideRow.estimated_price,
    platformFee: rideRow.platform_fee,
    driverShare: rideRow.driver_share,
    passengerName: rideRow.passenger_id ? (names.get(rideRow.passenger_id) ?? null) : null,
    driverName: rideRow.driver_id ? (names.get(rideRow.driver_id) ?? null) : null,
    pinLocked: rideRow.pin_locked,
    pinAttempts: rideRow.pin_attempts,
    pinCode: rideRow.pin_code,
    messages: ((messagesRes.data ?? []) as {
      id: string;
      sender_role: string;
      body: string;
      created_at: string;
    }[]).map((m) => ({
      id: m.id,
      senderRole: m.sender_role,
      body: m.body,
      createdAt: m.created_at,
    })),
    lastLocation: locationRes.data
      ? {
          lat: (locationRes.data as { lat: number }).lat,
          lng: (locationRes.data as { lng: number }).lng,
          updatedAt: (locationRes.data as { updated_at: string }).updated_at,
        }
      : null,
    decisions: ((decisionsRes.data ?? []) as {
      id: string;
      admin_id: string;
      debt_adjustment_fcfa: number;
      commission_adjustment_fcfa: number;
      reason: string;
      created_at: string;
    }[]).map((d) => ({
      id: d.id,
      adminId: d.admin_id,
      debtAdjustmentFcfa: d.debt_adjustment_fcfa,
      commissionAdjustmentFcfa: d.commission_adjustment_fcfa,
      reason: d.reason,
      createdAt: d.created_at,
    })),
  };
}

/** Litiges déjà ouverts par l'utilisateur sur une course (pour masquer
 *  le formulaire sur la page course). */
export async function getMyDisputesForRide(
  userId: string,
  rideId: string
): Promise<Dispute[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('disputes')
    .select('id, ride_id, opened_by_id, opened_by_role, reason, amount_concerned, message, status, created_at, resolved_at')
    .eq('ride_id', rideId)
    .eq('opened_by_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  const rows = data as DisputeRow[];
  const names = await fetchNames(
    supabase,
    rows.map((r) => r.opened_by_id)
  );
  return rows.map((r) => mapDisputeRow(r, names));
}
