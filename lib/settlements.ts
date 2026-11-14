/** Règlements hebdomadaires + rapport hebdo (v2.15) — lectures et
 *  calculs côté serveur.
 *
 *  Semaine = lundi → dimanche, heure de Libreville (Afrique/Libreville,
 *  UTC+1). Le relevé de chaque chauffeur est généré le lundi par la
 *  route cron (`generate_weekly_settlements`, SECURITY DEFINER) : courses
 *  de la semaine, commission due de la semaine, dette totale, dépôt.
 *  Le chauffeur déclare son transfert (« J'ai payé ») ; l'admin valide
 *  en 1 clic → règlement classique (`driver_settlements`). Une
 *  déclaration NON validée ne réduit jamais la dette.
 *
 *  Si les tables v2.15 n'existent pas encore (migration non appliquée),
 *  les lectures renvoient des listes vides — jamais de crash.
 */

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { DEBT_CAP_FCFA, DEPOSIT_FCFA } from '@/lib/gamification';
import { getOpenDisputesCount, getStaleOpenDisputes } from '@/lib/disputes';
import type { DeclarationStatus, SettlementDeclaration, WeeklyAlert, WeeklyReport, WeeklySettlement, WeeklySettlementStatus } from '@/lib/settlement-types';

export type {
  DeclarationStatus,
  SettlementDeclaration,
  WeeklyAlert,
  WeeklyReport,
  WeeklySettlement,
  WeeklySettlementStatus,
} from '@/lib/settlement-types';
export { formatWeekLabel, lastCompletedWeek, librevilleMonday } from '@/lib/settlement-types';

interface WeeklySettlementRow {
  id: string;
  driver_id: string;
  week_start: string;
  week_end: string;
  rides_count: number;
  fares_total: number;
  commission_due: number;
  debt_total: number;
  deposit_paid: boolean;
  status: WeeklySettlementStatus;
  created_at: string;
  driver_email_sent_at?: string | null;
}

interface DeclarationRow {
  id: string;
  weekly_settlement_id: string | null;
  driver_id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: DeclarationStatus;
  created_at: string;
  validated_at: string | null;
}

async function fetchDriverNames(
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

/** Relevés hebdo (admin) : une semaine donnée, ou les plus récents.
 *  Le drapeau d'e-mail v2.24 est lu si la colonne existe, sinon on
 *  retombe sans lui (jamais de crash quand la migration n'est pas
 *  appliquée). */
export async function getWeeklySettlements(
  weekStart?: string
): Promise<WeeklySettlement[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const columns =
    'id, driver_id, week_start, week_end, rides_count, fares_total, commission_due, debt_total, deposit_paid, status, created_at, driver_email_sent_at';
  const run = async (
    cols: string
  ): Promise<{ data: unknown; error: { message: string } | null }> => {
    let query = supabase
      .from('weekly_settlements')
      .select(cols)
      .order('week_start', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);
    if (weekStart) query = query.eq('week_start', weekStart);
    return query as unknown as Promise<{ data: unknown; error: { message: string } | null }>;
  };
  let { data, error } = await run(columns);
  if (error && error.message.includes('driver_email_sent_at')) {
    ({ data, error } = await run(
      'id, driver_id, week_start, week_end, rides_count, fares_total, commission_due, debt_total, deposit_paid, status, created_at'
    ));
  }
  if (error || !data) {
    if (error) console.error('[settlements] lecture relevés:', error.message);
    return [];
  }
  const rows = data as unknown as WeeklySettlementRow[];
  const names = await fetchDriverNames(
    supabase,
    rows.map((r) => r.driver_id)
  );
  return rows.map((r) => ({
    id: r.id,
    driverId: r.driver_id,
    driverName: names.get(r.driver_id) ?? null,
    weekStart: r.week_start,
    weekEnd: r.week_end,
    ridesCount: r.rides_count,
    faresTotal: r.fares_total,
    commissionDue: r.commission_due,
    debtTotal: r.debt_total,
    depositPaid: r.deposit_paid,
    status: r.status,
    createdAt: r.created_at,
    emailSent: r.driver_email_sent_at ? true : r.driver_email_sent_at === null ? false : null,
  }));
}

/** Relevé de la semaine en cours / dernière semaine pour un chauffeur
 *  (son tableau de bord : « J'ai payé »). */
export async function getDriverWeeklyStatement(
  driverId: string
): Promise<WeeklySettlement | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const columns =
    'id, driver_id, week_start, week_end, rides_count, fares_total, commission_due, debt_total, deposit_paid, status, created_at, driver_email_sent_at';
  const run = async (
    cols: string
  ): Promise<{ data: unknown; error: { message: string } | null }> =>
    supabase
      .from('weekly_settlements')
      .select(cols)
      .eq('driver_id', driverId)
      .order('week_start', { ascending: false })
      .limit(1)
      .single() as unknown as Promise<{ data: unknown; error: { message: string } | null }>;
  let { data, error } = await run(columns);
  if (error && error.message.includes('driver_email_sent_at')) {
    ({ data, error } = await run(
      'id, driver_id, week_start, week_end, rides_count, fares_total, commission_due, debt_total, deposit_paid, status, created_at'
    ));
  }
  if (error || !data) return null;
  const r = data as unknown as WeeklySettlementRow;
  return {
    id: r.id,
    driverId: r.driver_id,
    driverName: null,
    weekStart: r.week_start,
    weekEnd: r.week_end,
    ridesCount: r.rides_count,
    faresTotal: r.fares_total,
    commissionDue: r.commission_due,
    debtTotal: r.debt_total,
    depositPaid: r.deposit_paid,
    status: r.status,
    createdAt: r.created_at,
    emailSent: r.driver_email_sent_at ? true : r.driver_email_sent_at === null ? false : null,
  };
}

/** Déclarations de paiement (admin : en attente d'abord). */
export async function getSettlementDeclarations(
  onlyPending = false
): Promise<SettlementDeclaration[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  let query = supabase
    .from('settlement_declarations')
    .select('id, weekly_settlement_id, driver_id, amount, method, reference, status, created_at, validated_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (onlyPending) query = query.eq('status', 'declare');
  const { data, error } = await query;
  if (error || !data) {
    if (error) console.error('[settlements] lecture déclarations:', error.message);
    return [];
  }
  const rows = data as DeclarationRow[];
  const names = await fetchDriverNames(
    supabase,
    rows.map((r) => r.driver_id)
  );
  return rows.map((r) => ({
    id: r.id,
    weeklySettlementId: r.weekly_settlement_id,
    driverId: r.driver_id,
    driverName: names.get(r.driver_id) ?? null,
    amount: r.amount,
    method: r.method,
    reference: r.reference,
    status: r.status,
    createdAt: r.created_at,
    validatedAt: r.validated_at,
  }));
}

/** Déclarations du chauffeur connecté (son tableau de bord). */
export async function getMyDeclarations(driverId: string): Promise<SettlementDeclaration[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settlement_declarations')
    .select('id, weekly_settlement_id, driver_id, amount, method, reference, status, created_at, validated_at')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return (data as DeclarationRow[]).map((r) => ({
    id: r.id,
    weeklySettlementId: r.weekly_settlement_id,
    driverId: r.driver_id,
    driverName: null,
    amount: r.amount,
    method: r.method,
    reference: r.reference,
    status: r.status,
    createdAt: r.created_at,
    validatedAt: r.validated_at,
  }));
}

/** Dernier rapport hebdo (admin). */
export async function getLatestWeeklyReport(): Promise<WeeklyReport | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('id, week_start, week_end, rides_count, commission_total, new_drivers, open_disputes, alerts, email_sent, created_at')
    .order('week_start', { ascending: false })
    .limit(1)
    .single();
  if (error || !data) return null;
  const r = data as {
    id: string;
    week_start: string;
    week_end: string;
    rides_count: number;
    commission_total: number;
    new_drivers: number;
    open_disputes: number;
    alerts: WeeklyAlert[];
    email_sent: boolean;
    created_at: string;
  };
  return {
    id: r.id,
    weekStart: r.week_start,
    weekEnd: r.week_end,
    ridesCount: r.rides_count,
    commissionTotal: r.commission_total,
    newDrivers: r.new_drivers,
    openDisputes: r.open_disputes,
    alerts: Array.isArray(r.alerts) ? r.alerts : [],
    emailSent: r.email_sent,
    createdAt: r.created_at,
  };
}

export interface DriverDebt {
  driverId: string;
  driverName: string | null;
  driverEmail: string | null;
  owed: number;
  lastSettlementAt: string | null;
  depositPaid: boolean;
  /** Dernier rappel de règlement envoyé (migration v2.24) — null si
   *  la colonne n'existe pas encore ou si jamais envoyé. */
  reminderSentAt: string | null;
  /** Dette à 80 % ou plus du plafond (rappel « approche du plafond »). */
  nearCap: boolean;
  /** Dette > 0 sans règlement depuis 7 jours. */
  stale: boolean;
}

/** Dette de chaque chauffeur (v2.24) : commission totale − règlements
 *  validés + ajustements de litiges. Même calcul que partout ailleurs
 *  (tableau de bord, rapport hebdo) — une seule source de vérité.
 *  Les colonnes v2.24 (`email`, `settlement_reminder_sent_at`) sont
 *  lues si elles existent, sinon on retombe sans elles (jamais de
 *  crash quand la migration n'est pas appliquée). */
export async function getDriverDebts(): Promise<DriverDebt[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  interface DriverDebtRow {
    id: string;
    full_name: string | null;
    email?: string | null;
    deposit_paid: boolean | null;
    settlement_reminder_sent_at?: string | null;
  }
  let drivers: DriverDebtRow[] | null = null;
  const full = await supabase
    .from('profiles')
    .select('id, full_name, email, deposit_paid, settlement_reminder_sent_at')
    .eq('role', 'chauffeur');
  if (!full.error && full.data) {
    drivers = full.data as unknown as DriverDebtRow[];
  } else {
    const legacy = await supabase
      .from('profiles')
      .select('id, full_name, deposit_paid')
      .eq('role', 'chauffeur');
    if (legacy.error || !legacy.data) {
      if (legacy.error) console.error('[settlements] lecture chauffeurs:', legacy.error.message);
      return [];
    }
    drivers = legacy.data as unknown as DriverDebtRow[];
  }
  const driverIds = (drivers ?? []).map((d) => d.id);
  if (driverIds.length === 0) return [];
  const [
    { data: allEarnings },
    { data: allSettlements },
    { data: adjustments },
  ] = await Promise.all([
    supabase.from('driver_earnings').select('driver_id, commission_amount'),
    supabase.from('driver_settlements').select('driver_id, amount, created_at'),
    // Table v2.15 : absente = pas d'ajustements (jamais de crash).
    supabase.from('driver_debt_adjustments').select('driver_id, amount_fcfa'),
  ]);
  const commissionByDriver = new Map<string, number>();
  (allEarnings ?? []).forEach((r: { driver_id: string; commission_amount: number }) =>
    commissionByDriver.set(r.driver_id, (commissionByDriver.get(r.driver_id) ?? 0) + (r.commission_amount ?? 0))
  );
  const settledByDriver = new Map<string, number>();
  const lastSettlementByDriver = new Map<string, string>();
  (allSettlements ?? []).forEach((r: { driver_id: string; amount: number; created_at: string }) => {
    settledByDriver.set(r.driver_id, (settledByDriver.get(r.driver_id) ?? 0) + (r.amount ?? 0));
    const prev = lastSettlementByDriver.get(r.driver_id);
    if (!prev || r.created_at > prev) lastSettlementByDriver.set(r.driver_id, r.created_at);
  });
  const adjustmentsByDriver = new Map<string, number>();
  (adjustments ?? []).forEach((r: { driver_id: string; amount_fcfa: number }) =>
    adjustmentsByDriver.set(r.driver_id, (adjustmentsByDriver.get(r.driver_id) ?? 0) + (r.amount_fcfa ?? 0))
  );
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return (drivers ?? []).map((d) => {
    const owed = Math.max(
      0,
      (commissionByDriver.get(d.id) ?? 0) -
        (settledByDriver.get(d.id) ?? 0) +
        (adjustmentsByDriver.get(d.id) ?? 0)
    );
    const last = lastSettlementByDriver.get(d.id) ?? null;
    return {
      driverId: d.id,
      driverName: d.full_name,
      driverEmail: d.email ?? null,
      owed,
      lastSettlementAt: last,
      depositPaid: d.deposit_paid ?? false,
      reminderSentAt: d.settlement_reminder_sent_at ?? null,
      nearCap: owed >= Math.round(DEBT_CAP_FCFA * 0.8),
      stale: owed > 0 && (!last || new Date(last).getTime() < weekAgo),
    };
  });
}

/** Construit le digest d'une semaine (route cron du lundi) : courses,
 *  revenu commission, nouveaux chauffeurs, litiges ouverts, alertes.
 *  Les chiffres viennent des tables — jamais de chiffres envoyés par
 *  le client. */
export async function buildWeeklyReport(weekStart: string, weekEnd: string): Promise<{
  ridesCount: number;
  commissionTotal: number;
  newDrivers: number;
  openDisputes: number;
  alerts: WeeklyAlert[];
}> {
  const empty = {
    ridesCount: 0,
    commissionTotal: 0,
    newDrivers: 0,
    openDisputes: 0,
    alerts: [] as WeeklyAlert[],
  };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();

  // Courses terminées de la semaine + commission (driver_earnings).
  const { data: earnings } = await supabase
    .from('driver_earnings')
    .select('commission_amount')
    .eq('period_week', weekStart);
  const ridesCount = (earnings ?? []).length;
  const commissionTotal = (earnings ?? []).reduce(
    (s: number, r: { commission_amount: number }) => s + (r.commission_amount ?? 0),
    0
  );

  // Nouveaux chauffeurs inscrits pendant la semaine.
  const { count: newDrivers } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'chauffeur')
    .gte('created_at', `${weekStart}T00:00:00+01:00`)
    .lte('created_at', `${weekEnd}T23:59:59+01:00`);

  const openDisputes = await getOpenDisputesCount();
  const staleDisputes = await getStaleOpenDisputes();

  // Alertes : chauffeurs au plafond de dette, dettes anciennes sans
  // règlement depuis 7 jours, dépôt non versé, litiges ouverts > 7 j.
  // Le calcul des dettes est partagé avec les rappels (v2.24).
  const alerts: WeeklyAlert[] = [];
  const debts = await getDriverDebts();
  debts.forEach((d) => {
    if (d.owed >= DEBT_CAP_FCFA) {
      alerts.push({
        type: 'debt_cap',
        driverId: d.driverId,
        driverName: d.driverName,
        label: `${d.driverName ?? 'Chauffeur'} est au plafond de dette (${d.owed.toLocaleString('fr-FR')} FCFA) — plus de demandes tant qu'il n'a pas réglé.`,
      });
    } else if (d.stale) {
      alerts.push({
        type: 'old_debt',
        driverId: d.driverId,
        driverName: d.driverName,
        label: `${d.driverName ?? 'Chauffeur'} doit ${d.owed.toLocaleString('fr-FR')} FCFA sans règlement depuis plus de 7 jours.`,
      });
    }
    if (!d.depositPaid) {
      alerts.push({
        type: 'no_deposit',
        driverId: d.driverId,
        driverName: d.driverName,
        label: `${d.driverName ?? 'Chauffeur'} n'a pas encore versé son dépôt de garantie (${DEPOSIT_FCFA.toLocaleString('fr-FR')} FCFA).`,
      });
    }
  });
  staleDisputes.forEach((d) => {
    alerts.push({
      type: 'stale_dispute',
      disputeId: d.id,
      label: `Litige ouvert depuis plus de 7 jours (${d.openedByName ?? '—'} — ${d.reason}).`,
    });
  });

  return {
    ridesCount,
    commissionTotal,
    newDrivers: newDrivers ?? 0,
    openDisputes,
    alerts,
  };
}
