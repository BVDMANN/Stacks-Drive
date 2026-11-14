/** Alertes d'exception UNIQUEMENT (v2.24) — point d'entrée unique
 *  pour tous les e-mails d'alerte à l'administrateur.
 *
 *  Ce qui déclenche une alerte (et seulement ça) :
 *  - `pin_locked` — 5 faux PIN, course verrouillée ;
 *  - `debt_cap` — chauffeur bloqué par la dette (plafond atteint) ;
 *  - `fraud_detected` — suspicion de fraude, dossier ouvert
 *    (v2.26, `lib/fraud.ts` : une seule alerte par utilisateur et
 *    par signal, délai 7 jours ; le dossier ouvert en base est
 *    l'anti-rafale principal) ;
 *  - `cron_failed` — une route cron en échec ;
 *  - `critical_error` — une route API en échec répété (compteur en
 *    mémoire, seuil de 5 échecs en 1 h pour la même route).
 *
 *  Ce qui ne passe JAMAIS par ici (propriétaires existants, ne pas
 *  dupliquer) :
 *  - litige ouvert → `sendDisputeEmail` (lot A v2.15) ;
 *  - ticket de vérification ambigu → `sendVerificationTicketEmail`
 *    (v2.4) ;
 *  - rapport hebdo avec alertes → `sendWeeklyReportEmail` (lot A).
 *  `notifyAdminAlert` refuse ces sortes (`owned-by:*`) : un appel
 *  futur ne pourra pas envoyer un deuxième e-mail pour le même
 *  événement.
 *
 *  Anti-spam : un seul e-mail par clé d'événement, avec délai
 *  minimum par sorte (en mémoire, par instance — best-effort sur
 *  serverless ; les clés portent l'événement lui-même, donc une
 *  rediffusion ne recrée pas un doublon : `pin-locked:<course>`,
 *  `debt-cap:<chauffeur>:<semaine>`, `cron-failed:<route>:<jour>`).
 *  Ne lève jamais d'exception ; sans Resend, simple log serveur. */

import { ADMIN_EMAIL, isEmailConfigured } from '@/lib/email';

export type AdminAlertKind =
  | 'pin_locked'
  | 'debt_cap'
  | 'fraud_detected'
  | 'cron_failed'
  | 'critical_error'
  /** RideCheck maison (v2.34) : check-in sans réponse, ou passager
   *  en difficulté — alerte d'exception, une seule par course et
   *  par signal (clé `ridecheck:<signal>:<course>`). */
  | 'ridecheck_no_response'
  | 'ridecheck_problem'
  /** Sortes possédées ailleurs — refusées ici (voir en-tête). */
  | 'dispute_opened'
  | 'verification_ticket'
  | 'weekly_report';

/** Propriétaire canonique de chaque sorte d'alerte (anti-doublon). */
export const ALERT_OWNERS: Record<AdminAlertKind, string> = {
  pin_locked: 'lib/admin-alerts.ts (v2.24)',
  debt_cap: 'lib/admin-alerts.ts (v2.24)',
  fraud_detected: 'lib/fraud.ts (v2.26)',
  ridecheck_no_response: 'lib/ridecheck.ts (v2.34)',
  ridecheck_problem: 'lib/ridecheck.ts (v2.34)',
  cron_failed: 'lib/admin-alerts.ts (v2.24)',
  critical_error: 'lib/admin-alerts.ts (v2.24)',
  dispute_opened: 'sendDisputeEmail — lot A v2.15',
  verification_ticket: 'sendVerificationTicketEmail — v2.4',
  weekly_report: 'sendWeeklyReportEmail — lot A v2.15',
};

/** Délai minimum entre deux e-mails de la même sorte et de la même
 *  clé (ms). Les clés portent déjà l'événement ; le délai ne sert
 *  qu'à absorber les rafales (retries, double-clics). */
const COOLDOWNS_MS: Record<AdminAlertKind, number> = {
  pin_locked: 24 * 60 * 60 * 1000,
  debt_cap: 7 * 24 * 60 * 60 * 1000,
  fraud_detected: 7 * 24 * 60 * 60 * 1000,
  ridecheck_no_response: 24 * 60 * 60 * 1000,
  ridecheck_problem: 24 * 60 * 60 * 1000,
  cron_failed: 24 * 60 * 60 * 1000,
  critical_error: 60 * 60 * 1000,
  dispute_opened: 0,
  verification_ticket: 0,
  weekly_report: 0,
};

const lastSentByKey = new Map<string, number>();
const SUBJECTS: Record<Exclude<AdminAlertKind, 'dispute_opened' | 'verification_ticket' | 'weekly_report'>, string> = {
  pin_locked: 'Course verrouillée — 5 codes PIN faux',
  debt_cap: 'Chauffeur bloqué — plafond de dette atteint',
  fraud_detected: 'Suspicion de fraude — compte à vérifier',
  ridecheck_no_response: 'RideCheck — passager sans réponse pendant une course',
  ridecheck_problem: 'RideCheck — passager signale un problème pendant une course',
  cron_failed: 'Cron en échec',
  critical_error: 'Erreur critique répétée',
};

export interface AdminAlertInput {
  kind: AdminAlertKind;
  /** Clé d'événement unique, ex. `pin-locked:<courseId>`. */
  key: string;
  /** Détail humain (trajet, chauffeur, montant, route). */
  detail: string;
  adminUrl?: string;
}

/** Envoie (au plus une fois par clé + délai) l'e-mail d'alerte à
 *  l'admin. Renvoie `{ sent, reason }` — `sent: false` quand
 *  l'alerte est possédée ailleurs, déjà envoyée, ou quand Resend
 *  n'est pas configuré. */
export async function notifyAdminAlert(
  input: AdminAlertInput
): Promise<{ sent: boolean; reason: string }> {
  if (input.kind === 'dispute_opened' || input.kind === 'verification_ticket' || input.kind === 'weekly_report') {
    return { sent: false, reason: `owned-by:${ALERT_OWNERS[input.kind]}` };
  }
  const dedupeKey = `${input.kind}:${input.key}`;
  const now = Date.now();
  const last = lastSentByKey.get(dedupeKey);
  if (last !== undefined && now - last < COOLDOWNS_MS[input.kind]) {
    return { sent: false, reason: 'duplicate-cooldown' };
  }
  lastSentByKey.set(dedupeKey, now);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://stacks-drive.vercel.app';
  const subject = `[Stacks Drive] ALERTE — ${SUBJECTS[input.kind]}`;
  const text = [
    `Bonjour,`,
    ``,
    `Une exception demande ton attention sur Stacks Drive.`,
    ``,
    `${input.detail}`,
    ``,
    `Voir l'administration : ${input.adminUrl ?? `${baseUrl}/admin`}`,
    ``,
    `— Stacks Drive (alerte automatique, un seul e-mail par événement).`,
  ].join('\n');
  try {
    if (!isEmailConfigured()) {
      console.log(`[admin-alert] Resend non configuré — alerte ${dedupeKey} non envoyée.`);
      return { sent: false, reason: 'email-not-configured' };
    }
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY as string);
    const from = process.env.EMAIL_FROM ?? 'Stacks Drive <onboarding@resend.dev>';
    const { error } = await resend.emails.send({ from, to: ADMIN_EMAIL, subject, text });
    if (error) {
      console.error('[admin-alert] Resend:', error.message);
      return { sent: false, reason: 'resend-error' };
    }
    return { sent: true, reason: 'sent' };
  } catch (err) {
    console.error('[admin-alert] envoi impossible:', err);
    return { sent: false, reason: 'error' };
  }
}

// ---------------------------------------------------------------------------
// Erreurs API répétées : compteur en mémoire, seuil puis une alerte.
// ---------------------------------------------------------------------------

const apiFailures = new Map<string, { count: number; windowStart: number; alerted: boolean }>();
const API_FAILURE_WINDOW_MS = 60 * 60 * 1000;
const API_FAILURE_THRESHOLD = 5;

/** Signale un échec d'une route API. Au 5e échec de la même route
 *  en moins d'1 h, une seule alerte `critical_error` part à l'admin
 *  (clé : route + heure) — les échecs isolés ne déclenchent rien. */
export async function reportApiFailure(route: string, errorDetail: string): Promise<void> {
  const now = Date.now();
  const entry = apiFailures.get(route);
  if (!entry || now - entry.windowStart > API_FAILURE_WINDOW_MS) {
    apiFailures.set(route, { count: 1, windowStart: now, alerted: false });
    return;
  }
  entry.count += 1;
  if (entry.count >= API_FAILURE_THRESHOLD && !entry.alerted) {
    entry.alerted = true;
    const hour = new Date(now).toISOString().slice(0, 13);
    await notifyAdminAlert({
      kind: 'critical_error',
      key: `${route}:${hour}`,
      detail: `La route ${route} a échoué ${entry.count} fois en moins d'une heure.\nDernier détail : ${errorDetail}`,
    });
  }
}
