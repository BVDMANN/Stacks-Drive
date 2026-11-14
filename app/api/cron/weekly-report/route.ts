import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { requireCronSecret } from '@/lib/cron';
import {
  ADMIN_EMAIL,
  sendDriverWeeklyEarningsEmail,
  sendInactiveDriverReminderEmail,
  sendIncompleteDossierReminderEmail,
  sendSettlementReminderEmail,
  sendWeeklyReportEmail,
} from '@/lib/email';
import {
  incompleteReminderDue,
  isInactiveDriver,
  isDebtCapped,
  processReferralRewards,
  type LifecycleProfile,
} from '@/lib/driver-lifecycle';
import { notifyAdminAlert } from '@/lib/admin-alerts';
import { runWeeklyFraudSweep } from '@/lib/fraud';
import { runWeeklyCleanup } from '@/lib/data-cleanup';
import { DEBT_CAP_FCFA } from '@/lib/gamification';
import {
  buildWeeklyReport,
  getDriverDebts,
  getWeeklySettlements,
  lastCompletedWeek,
  formatWeekLabel,
} from '@/lib/settlements';

export const dynamic = 'force-dynamic';

/** GET /api/cron/weekly-report — rapport hebdo du lundi (cron Vercel,
 *  chaque lundi ~7h30, heure de Libreville).
 *
 *  Digest de la semaine terminée : courses, revenu commission, nouveaux
 *  chauffeurs, litiges ouverts, alertes (plafond de dette, dettes
 *  anciennes, litiges ouverts depuis plus de 7 jours, dépôts non
 *  versés). Le rapport est enregistré (insert_weekly_report, SECURITY
 *  DEFINER) — visible dans /admin — puis envoyé par e-mail à l'admin
 *  (Resend). Un échec d'e-mail est journalisé sans crash : le rapport
 *  reste visible dans /admin.
 *
 *  Protégé par CRON_SECRET, comme la route des relevés. */
export async function GET(request: NextRequest) {
  const auth = requireCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }

  const { weekStart, weekEnd } = lastCompletedWeek();
  const weekLabel = formatWeekLabel(weekStart, weekEnd);
  const report = await buildWeeklyReport(weekStart, weekEnd);

  const supabase = await createClient();
  const { data: reportId, error } = await supabase.rpc('insert_weekly_report', {
    p_week_start: weekStart,
    p_week_end: weekEnd,
    p_rides: report.ridesCount,
    p_commission: report.commissionTotal,
    p_new_drivers: report.newDrivers,
    p_open_disputes: report.openDisputes,
    p_alerts: report.alerts,
  });
  if (error) {
    console.error('[cron/weekly-report]', error.message);
    // Cron en échec (v2.24) : une seule alerte par route et par jour.
    await notifyAdminAlert({
      kind: 'cron_failed',
      key: `cron-failed:weekly-report:${new Date().toISOString().slice(0, 10)}`,
      detail: `La route /api/cron/weekly-report a échoué : ${error.message}`,
    });
    return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://stacks-drive.vercel.app';
  const emailSent = await sendWeeklyReportEmail({
    to: ADMIN_EMAIL,
    weekLabel,
    ridesCount: report.ridesCount,
    commissionTotal: report.commissionTotal,
    newDrivers: report.newDrivers,
    openDisputes: report.openDisputes,
    alerts: report.alerts,
    adminUrl: `${baseUrl}/admin`,
  });
  if (emailSent && typeof reportId === 'string') {
    await supabase.rpc('mark_weekly_report_emailed', { p_report_id: reportId });
  } else if (!emailSent) {
    console.error('[cron/weekly-report] e-mail admin non envoyé pour', weekLabel);
  }

  // --- Alertes d'exception (v2.24) : plafond de dette atteint ---
  // Une seule alerte par chauffeur et par semaine (clé = chauffeur +
  // semaine) — le rapport hebdo ci-dessus garde, lui, toutes les
  // alertes de la semaine (lot A, sans doublon d'e-mail : l'e-mail
  // admin du rapport n'est envoyé qu'une fois, plus haut).
  let debtCapAlertsSent = 0;
  for (const alert of report.alerts) {
    if (alert.type !== 'debt_cap' || !alert.driverId) continue;
    try {
      const res = await notifyAdminAlert({
        kind: 'debt_cap',
        key: `debt-cap:${alert.driverId}:${weekStart}`,
        detail: alert.label,
      });
      if (res.sent) debtCapAlertsSent += 1;
    } catch {
      // Une alerte ratée ne bloque jamais le rapport.
    }
  }

  // --- E-mails automatiques aux chauffeurs (v2.24) ---
  // Récap hebdo des gains (un e-mail par chauffeur ayant un relevé
  // cette semaine) + rappels de règlement (dette au plafond ou sans
  // règlement depuis 7 jours). Dédupliqués en base (drapeaux v2.24) :
  // sans migration appliquée, les marquages RPC échouent proprement
  // et sont journalisés — aucun envoi en rafale.
  // La route cron n'a pas de session : les marquages passent par les
  // fonctions SECURITY DEFINER (comme mark_weekly_report_emailed).
  let driverEmailsSent = 0;
  let driverEmailsFailed = 0;
  let remindersSent = 0;
  try {
    const debts = await getDriverDebts();
    const emailByDriver = new Map(debts.map((d) => [d.driverId, d.driverEmail]));
    const settlements = await getWeeklySettlements(weekStart);
    for (const settlement of settlements) {
      if (settlement.emailSent === true) continue;
      const to = emailByDriver.get(settlement.driverId);
      if (!to) continue;
      const sent = await sendDriverWeeklyEarningsEmail({
        to,
        driverName: settlement.driverName,
        weekLabel,
        ridesCount: settlement.ridesCount,
        faresTotal: settlement.faresTotal,
        commissionDue: settlement.commissionDue,
        debtTotal: settlement.debtTotal,
        depositPaid: settlement.depositPaid,
        dashboardUrl: `${baseUrl}/tableau-de-bord`,
      });
      if (!sent) {
        driverEmailsFailed += 1;
        continue;
      }
      driverEmailsSent += 1;
      const { error: markError } = await supabase.rpc('mark_weekly_settlement_emailed', {
        p_settlement_id: settlement.id,
      });
      if (markError) {
        console.error(
          '[cron/weekly-report] marquage e-mail chauffeur impossible (migration v2.24 ?) :',
          markError.message
        );
      }
    }
    // Rappels de règlement : au plus 1 par chauffeur et par semaine.
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const debt of debts) {
      if (!debt.driverEmail) continue;
      const atCap = debt.owed >= DEBT_CAP_FCFA;
      if (!atCap && !debt.stale) continue;
      if (debt.reminderSentAt && new Date(debt.reminderSentAt).getTime() > weekAgo) continue;
      const daysSince =
        debt.lastSettlementAt === null
          ? null
          : Math.max(0, Math.floor((Date.now() - new Date(debt.lastSettlementAt).getTime()) / (24 * 60 * 60 * 1000)));
      const sent = await sendSettlementReminderEmail({
        to: debt.driverEmail,
        driverName: debt.driverName,
        owed: debt.owed,
        debtCap: DEBT_CAP_FCFA,
        daysSinceSettlement: daysSince,
        dashboardUrl: `${baseUrl}/tableau-de-bord`,
      });
      if (!sent) continue;
      remindersSent += 1;
      const { error: markError } = await supabase.rpc('mark_settlement_reminder_sent', {
        p_driver_id: debt.driverId,
      });
      if (markError) {
        console.error(
          '[cron/weekly-report] marquage rappel impossible (migration v2.24 ?) :',
          markError.message
        );
      }
    }
  } catch (err) {
    console.error('[cron/weekly-report] e-mails chauffeurs:', err);
  }

  // --- Rappels chauffeurs (v2.25, lot C) : dossier incomplet, inactifs,
  //  récompenses de parrainage ---
  // Dossier incomplet : 1er rappel à 48 h, relance à J+7 (une seule
  // fois chacun, drapeaux v2.25). Inactifs : vérifiés, sans mise en
  // ligne depuis 7 jours, max 1 e-mail/semaine — jamais un chauffeur
  // bloqué par la dette au plafond (il reçoit le message « régularise
  // pour reprendre » côté chauffeur, pas cette relance) ni un chauffeur
  // refusé / non vérifié (rappel de dossier). Sans migration v2.25,
  // la lecture des colonnes échoue et TOUTE cette section est sautée
  // (jamais d'envoi en rafale sans drapeaux de déduplication).
  // Les bonus de parrainage sont crédités par `processReferralRewards`
  // (palier : filleul vérifié + 5 courses terminées).
  let incompleteRemindersSent = 0;
  let inactiveRemindersSent = 0;
  let referralRewards = { checked: 0, rewarded: 0, skipped: 0 };
  try {
    const { data: drivers, error: driversError } = await supabase
      .from('profiles')
      .select(
        'id, role, full_name, email, is_verified, verification_status, selfie_url, id_document_url, created_at, is_online, last_online_at, incomplete_reminder_sent_at, incomplete_reminder_2_sent_at, inactive_reminder_sent_at'
      )
      .eq('role', 'chauffeur');
    if (driversError || !drivers) {
      if (driversError) {
        console.error(
          '[cron/weekly-report] relances v2.25 ignorées (migration non appliquée ?) :',
          driversError.message
        );
      }
    } else {
      const debts = await getDriverDebts();
      const debtByDriver = new Map(debts.map((d) => [d.driverId, d.owed]));
      for (const raw of drivers as unknown as (LifecycleProfile & { is_online: boolean })[]) {
        if (!raw.email) continue;
        // Dossier incomplet (48 h, puis J+7).
        const round = incompleteReminderDue(raw, new Date());
        if (round) {
          const sent = await sendIncompleteDossierReminderEmail({
            to: raw.email,
            driverName: raw.full_name,
            round,
            dashboardUrl: `${baseUrl}/tableau-de-bord`,
          });
          if (sent) {
            incompleteRemindersSent += 1;
            await supabase.rpc('mark_driver_reminder_sent', {
              p_driver_id: raw.id,
              p_kind: round === 'first' ? 'incomplete_1' : 'incomplete_2',
            });
          }
          continue;
        }
        // Inactif (7 jours sans mise en ligne) — sauf dette au plafond.
        const owed = debtByDriver.get(raw.id) ?? 0;
        if (isDebtCapped(owed)) continue;
        if (!isInactiveDriver(raw, raw.is_online, new Date())) continue;
        const lastSent = raw.inactive_reminder_sent_at
          ? new Date(raw.inactive_reminder_sent_at).getTime()
          : null;
        if (lastSent && Date.now() - lastSent < 7 * 24 * 60 * 60 * 1000) continue;
        const reference = raw.last_online_at
          ? new Date(raw.last_online_at).getTime()
          : new Date(raw.created_at).getTime();
        const daysSince = Number.isNaN(reference)
          ? null
          : Math.max(0, Math.floor((Date.now() - reference) / (24 * 60 * 60 * 1000)));
        const sent = await sendInactiveDriverReminderEmail({
          to: raw.email,
          driverName: raw.full_name,
          daysSinceOnline: daysSince,
          dashboardUrl: `${baseUrl}/tableau-de-bord`,
        });
        if (sent) {
          inactiveRemindersSent += 1;
          await supabase.rpc('mark_driver_reminder_sent', {
            p_driver_id: raw.id,
            p_kind: 'inactive',
          });
        }
      }
    }
    referralRewards = await processReferralRewards(supabase);
  } catch (err) {
    console.error('[cron/weekly-report] relances v2.25:', err);
  }

  // --- Détection de fraude + nettoyage des données (v2.26, lot D) ---
  // Balayage hebdo (annulations, PIN, téléphones partagés — rattrape
  // les cas manqués si un hook a échoué) + nettoyage RGPD (positions
  // chauffeur anciennes, propositions expirées, comptes inactifs
  // COMPTÉS seulement, jamais supprimés). Aucun nouveau cron Vercel :
  // tout passe par cette route existante. Meilleur effort : un échec
  // ici ne bloque jamais le rapport hebdo.
  let fraudSweep = { checkedDrivers: 0, checkedPhones: 0, newCases: 0 };
  let cleanup = { ran: false, locationsDeleted: 0, proposalsExpired: 0, inactiveAccounts: 0 };
  try {
    fraudSweep = await runWeeklyFraudSweep(supabase);
    const cleanupResult = await runWeeklyCleanup(supabase);
    // Courses planifiées (v2.30) : le cron hebdo fait aussi office
    // de filet de sécurité pour le dispatch (le déclencheur normal
    // est le sondage des demandes entrantes) + balayage des
    // re-vérifications selfie dues (au plus 5 chauffeurs par
    // semaine, dernier contrôle vieux de plus de 30 jours).
    const { dispatchDueScheduledRides } = await import('@/lib/rides');
    await dispatchDueScheduledRides(supabase).catch(() => undefined);
    const { flagDueSelfieRechecks } = await import('@/lib/selfie-recheck');
    await flagDueSelfieRechecks(supabase).catch(() => undefined);
    cleanup = {
      ran: cleanupResult.ran,
      locationsDeleted: cleanupResult.locationsDeleted,
      proposalsExpired: cleanupResult.proposalsExpired,
      inactiveAccounts: cleanupResult.inactiveAccounts,
    };
  } catch (err) {
    console.error('[cron/weekly-report] fraude / nettoyage v2.26:', err);
  }

  // Pas de journal d'audit ici : la route cron n'a pas de session, la
  // RLS refuserait l'insertion — la trace, c'est weekly_reports (+ log).
  console.log(
    `[cron/weekly-report] rapport ${weekLabel} enregistré (e-mail ${emailSent ? 'envoyé' : 'non envoyé'}), alertes plafond ${debtCapAlertsSent}, e-mails chauffeurs ${driverEmailsSent} (${driverEmailsFailed} échecs), rappels ${remindersSent}, rappels dossier incomplet ${incompleteRemindersSent}, relances inactifs ${inactiveRemindersSent}, parrainages vérifiés ${referralRewards.checked} / bonus versés ${referralRewards.rewarded}, fraude : ${fraudSweep.checkedDrivers} chauffeurs balayés / ${fraudSweep.newCases} nouveau(x) dossier(s), nettoyage : ${cleanup.ran ? `${cleanup.locationsDeleted} position(s) supprimée(s), ${cleanup.proposalsExpired} proposition(s) expirée(s), ${cleanup.inactiveAccounts} compte(s) inactif(s)` : 'non exécuté (migration v2.26 ?)'} .`
  );
  return NextResponse.json({
    ok: true,
    weekStart,
    weekEnd,
    ridesCount: report.ridesCount,
    commissionTotal: report.commissionTotal,
    newDrivers: report.newDrivers,
    openDisputes: report.openDisputes,
    alertsCount: report.alerts.length,
    emailSent,
    debtCapAlertsSent,
    driverEmailsSent,
    driverEmailsFailed,
    remindersSent,
    incompleteRemindersSent,
    inactiveRemindersSent,
    referralRewards,
    fraudSweep,
    dataCleanup: cleanup,
  });
}
