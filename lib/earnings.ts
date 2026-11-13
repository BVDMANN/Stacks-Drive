/** Gains chauffeur — lectures côté serveur (v2.2).
 *
 *  Source de vérité : la table `driver_earnings` (1 ligne par course
 *  terminée, écrite par finalize_ride_earnings() — jamais par le
 *  client). Tout est calculé ici, jamais depuis des chiffres envoyés
 *  par l'appli. Si les tables v2.2 n'existent pas encore (migration
 *  non appliquée), les lectures renvoient des zéros et `tablesReady`
 *  vaut false — jamais de crash.
 *
 *  Fuseau : Libreville (Afrique/Libreville, UTC+1, pas de DST).
 *  Les périodes jour / semaine / mois sont calculées en heure locale.
 */

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  DAILY_QUEST,
  WEEKLY_QUEST,
  DEBT_CAP_FCFA,
  DEPOSIT_FCFA,
  POINTS_REDEEM_TARGET,
  POINTS_REDEEM_FREE_RIDES,
  getNextTier,
  getTierForStats,
  pointsForRide,
  NUDGE_REMAINING_RIDES,
  type DriverTierName,
} from '@/lib/gamification';

export interface PeriodStats {
  rides: number;
  fares: number;
  kept: number;
  commission: number;
  questBonus: number;
  platformCost: number;
}

export interface EarningRow {
  rideId: string;
  fare: number;
  commission: number;
  kept: number;
  isDoubleRide: boolean;
  /** Course sans commission (échange de points, v2.3). */
  isFreeRide: boolean;
  questBonus: number;
  platformCost: number;
  day: string;
}

export interface DriverEarningsSummary {
  tablesReady: boolean;
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  /** Commission due (non réglée) = Σ commissions − Σ règlements. */
  owed: number;
  /** Dernier règlement (ISO) et rappel automatique (v2.4) : dû > 0 et
   *  dernier règlement vieux de plus de 7 jours (ou aucun règlement). */
  lastSettlementAt: string | null;
  settlementReminder: { show: boolean; daysSince: number | null; owed: number };
  /** Dépôt de garantie. */
  deposit: { paid: boolean; amount: number; paidAt: string | null };
  /** Dette vs plafond. */
  debt: { amount: number; cap: number; blocked: boolean; progress: number };
  /** Niveau + progression. */
  tier: {
    current: DriverTierName;
    rate: number;
    next: DriverTierName | null;
    ridesLeft: number;
    ratingNeeded: number | null;
    perk: string;
  };
  /** Quête du jour + défi hebdo (bonus en POINTS depuis la v2.3). */
  quest: {
    day: { target: number; done: number; bonus: number; claimed: boolean };
    week: { target: number; done: number; bonus: number; claimed: boolean };
  };
  /** Points (v2.3) : solde, progression vers l'échange, courses
   *  sans commission restantes, points gagnés par course au niveau
   *  actuel. Le champ `bonus` des quêtes est aussi en points. */
  points: {
    balance: number;
    perRide: number;
    target: number;
    freeRides: number;
    progress: number;
    multiplier: number;
  };
  /** Série : jours d'affilée avec au moins une course. */
  streakDays: number;
  /** Nudge : il ne manque plus que N courses pour le bonus du jour. */
  nudge: { show: boolean; remaining: number; bonus: number } | null;
  badges: string[];
  completedRides: number;
  avgRating: number | null;
  driverOfWeek: { name: string | null; rides: number; rating: number | null } | null;
  recent: EarningRow[];
}

const EMPTY_PERIOD: PeriodStats = {
  rides: 0,
  fares: 0,
  kept: 0,
  commission: 0,
  questBonus: 0,
  platformCost: 0,
};

function emptySummary(): DriverEarningsSummary {
  return {
    tablesReady: false,
    today: { ...EMPTY_PERIOD },
    week: { ...EMPTY_PERIOD },
    month: { ...EMPTY_PERIOD },
    owed: 0,
    lastSettlementAt: null,
    settlementReminder: { show: false, daysSince: null, owed: 0 },
    deposit: { paid: false, amount: DEPOSIT_FCFA, paidAt: null },
    debt: { amount: 0, cap: DEBT_CAP_FCFA, blocked: false, progress: 0 },
    tier: {
      current: 'Bronze',
      rate: 0.05,
      next: 'Argent',
      ridesLeft: 20,
      ratingNeeded: null,
      perk: '',
    },
    quest: {
      day: { target: DAILY_QUEST.targetRides, done: 0, bonus: DAILY_QUEST.bonusPoints, claimed: false },
      week: { target: WEEKLY_QUEST.targetRides, done: 0, bonus: WEEKLY_QUEST.bonusPoints, claimed: false },
    },
    points: {
      balance: 0,
      perRide: 100,
      target: POINTS_REDEEM_TARGET,
      freeRides: 0,
      progress: 0,
      multiplier: 1,
    },
    streakDays: 0,
    nudge: null,
    badges: [],
    completedRides: 0,
    avgRating: null,
    driverOfWeek: null,
    recent: [],
  };
}

/** Dates locales de Libreville (jour, lundi de la semaine, 1er du mois). */
function librevillePeriods(now = new Date()): { day: string; week: string; month: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Libreville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '01';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  const week = monday.toISOString().slice(0, 10);
  const month = `${get('year')}-${get('month')}-01`;
  return { day, week, month };
}

interface EarningDbRow {
  ride_id: string;
  fare_amount: number;
  commission_amount: number;
  driver_kept_amount: number;
  is_double_ride: boolean;
  is_free_ride: boolean | null;
  quest_bonus: number;
  platform_cost: number;
  period_day: string;
  period_week: string;
  period_month: string;
}

/** Série de jours consécutifs avec au moins une course (en remontant
 *  depuis aujourd'hui, ou hier si aucune course aujourd'hui). */
function computeStreak(days: Set<string>, today: string): number {
  let streak = 0;
  let cursor = new Date(`${today}T12:00:00Z`);
  if (!days.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!days.has(key)) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Réparation paresseuse (v2.2) : si des courses terminées n'ont pas de
 *  ligne dans driver_earnings (ex : terminées avant l'application de
 *  la migration, ou finalize en échec), on les finalise maintenant.
 *  Idempotent côté base : jamais de double commission. */
export async function repairMissingEarnings(driverId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const { data: rides, error } = await supabase
    .from('rides')
    .select('id')
    .eq('driver_id', driverId)
    .eq('status', 'terminee')
    .order('completed_at', { ascending: false })
    .limit(20);
  if (error || !rides || rides.length === 0) return;
  const { data: existing } = await supabase
    .from('driver_earnings')
    .select('ride_id')
    .in(
      'ride_id',
      rides.map((r: { id: string }) => r.id)
    );
  const done = new Set((existing ?? []).map((r: { ride_id: string }) => r.ride_id));
  for (const ride of rides as { id: string }[]) {
    if (done.has(ride.id)) continue;
    const { error: rpcError } = await supabase.rpc('finalize_ride_earnings', {
      p_ride_id: ride.id,
    });
    if (rpcError) {
      console.error('[earnings] repair finalize:', rpcError.message);
      break; // fonction absente (migration non appliquée) : on arrête là
    }
  }
}

/** Résumé complet des gains d'un chauffeur. */
export async function getDriverEarningsSummary(
  driverId: string
): Promise<DriverEarningsSummary> {
  const summary = emptySummary();
  if (!isSupabaseConfigured()) return summary;
  const supabase = await createClient();
  const { day, week, month } = librevillePeriods();

  // 1. Gains (table v2.2). Si elle n'existe pas : zéros, tablesReady false.
  const { data: earnings, error: earningsError } = await supabase
    .from('driver_earnings')
    .select(
      'ride_id, fare_amount, commission_amount, driver_kept_amount, is_double_ride, is_free_ride, quest_bonus, platform_cost, period_day, period_week, period_month'
    )
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (earningsError || !earnings) {
    console.error('[earnings] driver_earnings indisponible:', earningsError?.message);
    return summary;
  }
  summary.tablesReady = true;
  const rows = earnings as EarningDbRow[];

  const fold = (list: EarningDbRow[]): PeriodStats =>
    list.reduce(
      (acc, r) => ({
        rides: acc.rides + 1,
        fares: acc.fares + r.fare_amount,
        kept: acc.kept + r.driver_kept_amount,
        commission: acc.commission + r.commission_amount,
        questBonus: acc.questBonus + r.quest_bonus,
        platformCost: acc.platformCost + r.platform_cost,
      }),
      { ...EMPTY_PERIOD }
    );
  summary.today = fold(rows.filter((r) => r.period_day === day));
  summary.week = fold(rows.filter((r) => r.period_week === week));
  summary.month = fold(rows.filter((r) => r.period_month === month));
  summary.completedRides = rows.length;
  summary.recent = rows.slice(0, 10).map((r) => ({
    rideId: r.ride_id,
    fare: r.fare_amount,
    commission: r.commission_amount,
    kept: r.driver_kept_amount,
    isDoubleRide: r.is_double_ride,
    isFreeRide: r.is_free_ride ?? false,
    questBonus: r.quest_bonus,
    platformCost: r.platform_cost,
    day: r.period_day,
  }));
  summary.streakDays = computeStreak(new Set(rows.map((r) => r.period_day)), day);

  // 2. Règlements → montant dû + rappel hebdomadaire (v2.4).
  const totalCommission = rows.reduce((s, r) => s + r.commission_amount, 0);
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select('amount, created_at')
    .eq('driver_id', driverId);
  const totalSettled = (settlements ?? []).reduce(
    (s: number, r: { amount: number }) => s + (r.amount ?? 0),
    0
  );
  const owed = Math.max(0, totalCommission - totalSettled);
  summary.owed = owed;
  // Dernier règlement : rappel affiché quand il y a un dû et que le
  // dernier règlement date de plus de 7 jours (ou qu'il n'y en a aucun).
  const lastSettlementAt = (settlements ?? [])
    .map((r: { created_at: string | null }) => r.created_at)
    .filter((d): d is string => typeof d === 'string' && d.length > 0)
    .sort()
    .pop() ?? null;
  summary.lastSettlementAt = lastSettlementAt;
  const daysSince =
    lastSettlementAt !== null
      ? Math.floor((Date.now() - new Date(lastSettlementAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
  summary.settlementReminder = {
    show: owed > 0 && (daysSince === null || daysSince > 7),
    daysSince,
    owed,
  };
  summary.debt = {
    amount: owed,
    cap: DEBT_CAP_FCFA,
    blocked: owed >= DEBT_CAP_FCFA,
    progress: Math.min(1, owed / DEBT_CAP_FCFA),
  };

  // 3. Dépôt + note moyenne (depuis les courses terminées) + courses
  // sans commission restantes (v2.3).
  const { data: profile } = await supabase
    .from('profiles')
    .select('deposit_paid, deposit_amount, deposit_paid_at, free_rides_remaining')
    .eq('id', driverId)
    .single();
  if (profile) {
    summary.deposit = {
      paid: profile.deposit_paid ?? false,
      amount: profile.deposit_amount ?? DEPOSIT_FCFA,
      paidAt: profile.deposit_paid_at ?? null,
    };
    summary.points.freeRides = profile.free_rides_remaining ?? 0;
  }
  const { data: rated } = await supabase
    .from('rides')
    .select('rating_driver')
    .eq('driver_id', driverId)
    .eq('status', 'terminee')
    .not('rating_driver', 'is', null);
  const ratings = (rated ?? []).map((r: { rating_driver: number | null }) => r.rating_driver ?? 0);
  summary.avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null;

  // 4. Niveau (recalculé depuis les vraies stats, jamais depuis la
  // colonne profiles.tier — un chauffeur ne peut pas s'auto-promouvoir).
  const tier = getTierForStats(summary.completedRides, summary.avgRating);
  const next = getNextTier(summary.completedRides, summary.avgRating);
  const { getDriverCommissionRate } = await import('@/lib/gamification');
  summary.tier = {
    current: tier.name,
    rate: getDriverCommissionRate(tier.name),
    next: next.tier?.name ?? null,
    ridesLeft: next.ridesLeft,
    ratingNeeded: next.ratingNeeded,
    perk: tier.perk,
  };

  // 5. Quêtes : progression + bonus déjà versé ce jour / cette semaine.
  const { data: claims } = await supabase
    .from('quest_bonus_claims')
    .select('period_type, period_start')
    .eq('driver_id', driverId)
    .in('period_start', [day, week]);
  const claimedDay = (claims ?? []).some(
    (c: { period_type: string; period_start: string }) =>
      c.period_type === 'jour' && c.period_start === day
  );
  const claimedWeek = (claims ?? []).some(
    (c: { period_type: string; period_start: string }) =>
      c.period_type === 'semaine' && c.period_start === week
  );
  summary.quest = {
    day: {
      target: DAILY_QUEST.targetRides,
      done: summary.today.rides,
      bonus: DAILY_QUEST.bonusPoints,
      claimed: claimedDay,
    },
    week: {
      target: WEEKLY_QUEST.targetRides,
      done: summary.week.rides,
      bonus: WEEKLY_QUEST.bonusPoints,
      claimed: claimedWeek,
    },
  };
  const remaining = DAILY_QUEST.targetRides - summary.today.rides;
  summary.nudge =
    remaining > 0 && remaining <= NUDGE_REMAINING_RIDES
      ? { show: true, remaining, bonus: DAILY_QUEST.bonusPoints }
      : null;

  // 6. Points (v2.3) : solde du registre driver_points + progression
  // vers l'échange. Si la table n'existe pas encore (migration v2.3
  // non appliquée) : solde 0, jamais de crash.
  const { data: pointRows } = await supabase
    .from('driver_points')
    .select('points')
    .eq('driver_id', driverId);
  const balance = (pointRows ?? []).reduce(
    (s: number, r: { points: number }) => s + (r.points ?? 0),
    0
  );
  const perRide = pointsForRide(tier.name, false);
  summary.points = {
    balance: Math.max(0, balance),
    perRide,
    target: POINTS_REDEEM_TARGET,
    freeRides: summary.points.freeRides,
    progress: Math.min(1, Math.max(0, balance) / POINTS_REDEEM_TARGET),
    multiplier: perRide / 100,
  };

  // 7. Badges.
  const { data: badges } = await supabase
    .from('driver_badges')
    .select('badge')
    .eq('driver_id', driverId);
  summary.badges = (badges ?? []).map((b: { badge: string }) => b.badge);

  // 8. Chauffeur de la semaine.
  const { data: dow } = await supabase.rpc('get_driver_of_week');
  if (dow && typeof dow === 'object' && (dow as { driver_id?: string }).driver_id) {
    const d = dow as { driver_id: string; name: string | null; rides: number; rating: number | null };
    summary.driverOfWeek = { name: d.name, rides: d.rides, rating: d.rating };
  }

  return summary;
}

/** Montant dû par un chauffeur (commission − règlements). 0 si les
 *  tables v2.2 ne sont pas encore là. Sert au blocage au plafond de
 *  dette (nouvelles demandes / propositions). */
export async function getDriverOwed(driverId: string): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { data: earnings, error } = await supabase
    .from('driver_earnings')
    .select('commission_amount')
    .eq('driver_id', driverId);
  if (error || !earnings) return 0;
  const total = (earnings as { commission_amount: number }[]).reduce(
    (s, r) => s + (r.commission_amount ?? 0),
    0
  );
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select('amount')
    .eq('driver_id', driverId);
  const settled = (settlements ?? []).reduce(
    (s: number, r: { amount: number }) => s + (r.amount ?? 0),
    0
  );
  return Math.max(0, total - settled);
}

/** Niveau réel d'un chauffeur (depuis ses stats) — utilisé à
 *  l'acceptation pour figer le taux de commission de la course. */
export async function getDriverTier(driverId: string): Promise<{
  tier: DriverTierName;
  rate: number;
  completedRides: number;
  avgRating: number | null;
}> {
  const { getDriverCommissionRate } = await import('@/lib/gamification');
  if (!isSupabaseConfigured()) {
    return { tier: 'Bronze', rate: 0.05, completedRides: 0, avgRating: null };
  }
  const supabase = await createClient();
  const { count } = await supabase
    .from('rides')
    .select('id', { count: 'exact', head: true })
    .eq('driver_id', driverId)
    .eq('status', 'terminee');
  const { data: rated } = await supabase
    .from('rides')
    .select('rating_driver')
    .eq('driver_id', driverId)
    .eq('status', 'terminee')
    .not('rating_driver', 'is', null);
  const ratings = (rated ?? []).map((r: { rating_driver: number | null }) => r.rating_driver ?? 0);
  const avgRating =
    ratings.length > 0
      ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
      : null;
  const tier = getTierForStats(count ?? 0, avgRating);
  return {
    tier: tier.name,
    rate: getDriverCommissionRate(tier.name),
    completedRides: count ?? 0,
    avgRating,
  };
}

/** Chauffeur de la semaine (nom, courses, note) — pour l'affichage. */
export async function getDriverOfWeek(): Promise<{
  name: string | null;
  rides: number;
  rating: number | null;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_driver_of_week');
  if (error || !data || typeof data !== 'object') return null;
  const d = data as { driver_id?: string; name?: string | null; rides?: number; rating?: number | null };
  if (!d.driver_id) return null;
  return { name: d.name ?? null, rides: d.rides ?? 0, rating: d.rating ?? null };
}

export interface AdminDriverMoney {
  driverId: string;
  name: string | null;
  phone: string | null;
  tier: string;
  depositPaid: boolean;
  depositAmount: number;
  owed: number;
  totalCommission: number;
  totalSettled: number;
  completedRides: number;
}

/** Vue argent par chauffeur (admin) : dépôt, commissions dues, règlements.
 *  [] si les tables v2.2 ne sont pas encore là. */
export async function getAdminDriverMoney(): Promise<AdminDriverMoney[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data: drivers, error: driversError } = await supabase
    .from('profiles')
    .select('id, full_name, phone, tier, deposit_paid, deposit_amount')
    .eq('role', 'chauffeur')
    .order('created_at', { ascending: false });
  if (driversError || !drivers) return [];
  const { data: earnings } = await supabase
    .from('driver_earnings')
    .select('driver_id, commission_amount');
  const { data: settlements } = await supabase
    .from('driver_settlements')
    .select('driver_id, amount');
  const { data: completed } = await supabase
    .from('rides')
    .select('driver_id')
    .eq('status', 'terminee');
  const commissionByDriver = new Map<string, number>();
  (earnings ?? []).forEach((r: { driver_id: string; commission_amount: number }) =>
    commissionByDriver.set(r.driver_id, (commissionByDriver.get(r.driver_id) ?? 0) + (r.commission_amount ?? 0))
  );
  const settledByDriver = new Map<string, number>();
  (settlements ?? []).forEach((r: { driver_id: string; amount: number }) =>
    settledByDriver.set(r.driver_id, (settledByDriver.get(r.driver_id) ?? 0) + (r.amount ?? 0))
  );
  const ridesByDriver = new Map<string, number>();
  (completed ?? []).forEach((r: { driver_id: string | null }) => {
    if (!r.driver_id) return;
    ridesByDriver.set(r.driver_id, (ridesByDriver.get(r.driver_id) ?? 0) + 1);
  });
  return (drivers as {
    id: string;
    full_name: string | null;
    phone: string | null;
    tier: string | null;
    deposit_paid: boolean | null;
    deposit_amount: number | null;
  }[]).map((d) => {
    const totalCommission = commissionByDriver.get(d.id) ?? 0;
    const totalSettled = settledByDriver.get(d.id) ?? 0;
    return {
      driverId: d.id,
      name: d.full_name,
      phone: d.phone,
      tier: d.tier ?? 'Bronze',
      depositPaid: d.deposit_paid ?? false,
      depositAmount: d.deposit_amount ?? 0,
      owed: Math.max(0, totalCommission - totalSettled),
      totalCommission,
      totalSettled,
      completedRides: ridesByDriver.get(d.id) ?? 0,
    };
  });
}
