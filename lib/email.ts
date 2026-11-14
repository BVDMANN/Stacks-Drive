/** Envoi d'e-mails Stacks Drive (v2.4) — Resend.
 *
 *  Actif SEULEMENT si RESEND_API_KEY est définie (Vercel > Settings >
 *  Environment Variables, ou .env.local). Sans clé : aucun envoi, un
 *  simple log serveur — le ticket reste visible dans /admin avec un
 *  bandeau « E-mails non configurés ».
 *
 *  Expéditeur par défaut : onboarding@resend.dev (plan gratuit Resend,
 *  qui autorise l'envoi vers l'e-mail du propriétaire du compte — ici
 *  l'admin, stacks.markett@gmail.com). Quand un domaine est vérifié
 *  dans Resend, définir EMAIL_FROM (ex : « Stacks Drive
 *  <noreply@stacksdrive.app> »).
 *
 *  Limites du plan gratuit (v2.24) : UN SEUL e-mail par événement,
 *  jamais de rafale — chaque envoi est dédupliqué (drapeau en base
 *  ou clé d'événement) et les alertes passent par le helper unique
 *  `lib/admin-alerts.ts`. Les e-mails aux chauffeurs partent
 *  uniquement vers l'adresse de leur compte (`profiles.email`).
 *
 *  AUCUNE clé en dur ici : tout passe par les variables d'environnement.
 *  Le propriétaire crée le compte Resend lui-même (voir SETUP.md, section v2.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { TicketUrgency } from '@/lib/verification';
import { CHECK_REASON_LABELS, URGENCY_LABELS } from '@/lib/verification';

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'stacks.markett@gmail.com';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** Envoi bas niveau partagé par tous les e-mails (v2.24) : un seul
 *  point d'appel Resend, jamais d'exception, false si désactivé ou
 *  en échec (journalisé). `context` sert uniquement au log. */
async function sendResendEmail(input: {
  to: string;
  subject: string;
  text: string;
  context: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] Resend non configuré — ${input.context} non envoyé. Destinataire : ${input.to}.`);
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM ?? 'Stacks Drive <onboarding@resend.dev>';
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    if (error) {
      console.error('[email] Resend:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] envoi impossible:', err);
    return false;
  }
}

export interface DisputeEmailInput {
  to: string;
  disputeId: string;
  reasonLabel: string;
  openedByRole: string;
  openedByName: string | null;
  pickup: string;
  destination: string;
  acceptedPrice: number | null;
  amountConcerned: number | null;
  message: string;
  adminUrl: string;
}

/** Envoie l'e-mail de nouveau litige à l'admin. Ne lève jamais
 *  d'exception ; renvoie false si l'envoi est désactivé ou en échec
 *  (l'échec est journalisé, le litige reste visible dans /admin). */
export async function sendDisputeEmail(input: DisputeEmailInput): Promise<boolean> {
  const subject = `[Stacks Drive] Nouveau litige — ${input.reasonLabel} — ${input.pickup} → ${input.destination}`;
  const text = [
    `Bonjour,`,
    ``,
    `Un litige vient d'être ouvert sur Stacks Drive.`,
    ``,
    `Course : ${input.pickup} → ${input.destination}`,
    `Prix accepté : ${input.acceptedPrice !== null ? `${input.acceptedPrice.toLocaleString('fr-FR')} FCFA` : 'non fixé'}`,
    `Ouvert par : ${input.openedByRole === 'passager' ? 'le passager' : 'le chauffeur'}${input.openedByName ? ` (${input.openedByName})` : ''}`,
    `Motif : ${input.reasonLabel}`,
    `Montant concerné : ${input.amountConcerned !== null ? `${input.amountConcerned.toLocaleString('fr-FR')} FCFA` : 'non précisé'}`,
    ``,
    `Message :`,
    input.message,
    ``,
    `Voir le dossier complet (course, messages, positions, PIN) et décider :`,
    input.adminUrl,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici).`,
  ].join('\n');
  return sendResendEmail({ to: input.to, subject, text, context: `litige ${input.disputeId}` });
}

export interface WeeklyReportEmailInput {
  to: string;
  weekLabel: string;
  ridesCount: number;
  commissionTotal: number;
  newDrivers: number;
  openDisputes: number;
  alerts: { label: string }[];
  adminUrl: string;
}

/** Envoie le digest hebdomadaire à l'admin. Même contrat que
 *  sendDisputeEmail : jamais d'exception, false en cas d'échec. */
export async function sendWeeklyReportEmail(input: WeeklyReportEmailInput): Promise<boolean> {
  const subject = `[Stacks Drive] Rapport hebdo — ${input.weekLabel}`;
  const alertsText =
    input.alerts.length > 0
      ? input.alerts.map((a) => `• ${a.label}`).join('\n')
      : '• Aucune alerte cette semaine.';
  const text = [
    `Bonjour,`,
    ``,
    `Voici le rapport hebdomadaire Stacks Drive (${input.weekLabel}).`,
    ``,
    `Courses terminées : ${input.ridesCount}`,
    `Revenu commission : ${input.commissionTotal.toLocaleString('fr-FR')} FCFA`,
    `Nouveaux chauffeurs : ${input.newDrivers}`,
    `Litiges ouverts : ${input.openDisputes}`,
    ``,
    `Alertes :`,
    alertsText,
    ``,
    `Voir le détail dans l'administration :`,
    input.adminUrl,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici).`,
  ].join('\n');
  return sendResendEmail({ to: input.to, subject, text, context: `rapport hebdo (${input.weekLabel})` });
}

export interface TicketEmailInput {
  to: string;
  urgency: TicketUrgency;
  kindLabel: string;
  driverName: string;
  driverEmail: string;
  summary: string;
  reasons: string[];
  ticketId: string;
  adminUrl: string;
}

/** Envoie l'e-mail de ticket à l'admin. Renvoie true si l'e-mail est
 *  parti (ou si l'envoi est désactivé proprement), false sinon.
 *  Ne lève jamais d'exception. */
export async function sendVerificationTicketEmail(input: TicketEmailInput): Promise<boolean> {
  const subject = `[Stacks Drive] Ticket vérification — ${URGENCY_LABELS[input.urgency]} — ${input.driverName}`;
  const reasonsText = input.reasons
    .map((r) => `• ${CHECK_REASON_LABELS[r] ?? r}`)
    .join('\n');
  const text = [
    `Bonjour,`,
    ``,
    `Un dossier de vérification chauffeur demande votre attention.`,
    ``,
    `Chauffeur : ${input.driverName} (${input.driverEmail})`,
    `Problème : ${input.kindLabel}`,
    `Niveau d'urgence : ${URGENCY_LABELS[input.urgency]}`,
    ``,
    `Ce qui s'est passé :`,
    input.summary,
    ``,
    `Compte rendu des contrôles automatiques :`,
    reasonsText || '• Aucun détail disponible.',
    ``,
    `Voir le dossier et décider (approuver / refuser / demander de refaire) :`,
    input.adminUrl,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici ; répondez au chauffeur depuis l'application).`,
  ].join('\n');
  return sendResendEmail({ to: input.to, subject, text, context: `ticket ${input.ticketId} (${input.urgency})` });
}

export interface TrustedShareEmailInput {
  to: string;
  contactName: string;
  passengerName: string | null;
  pickup: string;
  destination: string;
  driverName: string | null;
  plate: string | null;
  priceLabel: string;
  shareUrl: string;
}

/** Envoie le lien de suivi à un contact de confiance au départ de la
 *  course (v2.23, partage automatique). Même contrat que les autres
 *  e-mails : jamais d'exception, false si Resend n'est pas configuré
 *  ou en cas d'échec — le départ de la course n'est jamais bloqué
 *  par un e-mail. */
export async function sendTrustedShareEmail(input: TrustedShareEmailInput): Promise<boolean> {
  const subject = `[Stacks Drive] ${input.passengerName ?? 'Un proche'} est en course — suivi en direct`;
  const text = [
    `Bonjour ${input.contactName},`,
    ``,
    `${input.passengerName ?? 'Votre proche'} vient de démarrer une course Stacks Drive : ${input.pickup} → ${input.destination}.`,
    ``,
    `Suivez son trajet en direct : ${input.shareUrl}`,
    ``,
    input.driverName ? `Chauffeur : ${input.driverName}${input.plate ? ` (plaque ${input.plate})` : ''}` : '',
    `Prix de la course : ${input.priceLabel}`,
    ``,
    `Vous recevez ce message parce que ${input.passengerName ?? 'votre proche'} vous a enregistré comme contact de confiance sur Stacks Drive.`,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici).`,
  ]
    .filter((line) => line !== '')
    .join('\n');
  return sendResendEmail({ to: input.to, subject, text, context: 'partage de suivi' });
}

// ---------------------------------------------------------------------------
// E-mails automatiques (v2.24) — un seul e-mail par événement.
// ---------------------------------------------------------------------------

export interface WelcomeEmailInput {
  to: string;
  name: string | null;
  appUrl: string;
}

/** Bienvenue passager : envoyé une fois, à la première connexion
 *  confirmée (voir `maybeSendWelcomeEmail` — drapeau
 *  `profiles.welcome_email_sent_at`). */
export async function sendWelcomePassengerEmail(input: WelcomeEmailInput): Promise<boolean> {
  const firstName = input.name?.split(' ')[0] ?? '';
  const text = [
    `Bonjour${firstName ? ` ${firstName}` : ''},`,
    ``,
    `Bienvenue sur Stacks Drive, la solution du peuple pour se déplacer à Libreville.`,
    ``,
    `Comment ça marche :`,
    `• Tu demandes ta course (départ, destination, Solo ou Groupe) — une estimation indicative s'affiche.`,
    `• Les chauffeurs vérifiés autour de toi proposent leur prix — tu acceptes, tu refuses ou tu contre-proposes.`,
    `• Une fois accepté, ton prix est figé : il ne bougera plus.`,
    `• Tu paies directement ton chauffeur, en espèces ou Mobile Money (Airtel Money, Moov Money).`,
    ``,
    `Ton code PIN à 4 chiffres s'affiche quand ta course est confirmée : donne-le à ton chauffeur à son arrivée, c'est lui qui démarre la course.`,
    ``,
    `Une question ? La page d'aide répond aux questions courantes : ${input.appUrl}/aide`,
    ``,
    `Bonne route,`,
    `— Stacks Drive`,
  ].join('\n');
  return sendResendEmail({
    to: input.to,
    subject: 'Bienvenue sur Stacks Drive — comment commander ta première course',
    text,
    context: 'e-mail de bienvenue passager',
  });
}

/** Bienvenue chauffeur : envoyé une fois, quand la vérification
 *  passe à « vérifié » (route /api/verification, transition
 *  gardée côté appelant — jamais renvoyé à chaque visite). */
export async function sendWelcomeDriverEmail(input: WelcomeEmailInput): Promise<boolean> {
  const firstName = input.name?.split(' ')[0] ?? '';
  const text = [
    `Bonjour${firstName ? ` ${firstName}` : ''},`,
    ``,
    `Ton compte chauffeur est vérifié — bienvenue sur Stacks Drive, tu peux te mettre en ligne.`,
    ``,
    `Pour recevoir des demandes :`,
    `• Mets-toi en ligne et choisis ton quartier — tu apparais sur la carte des passagers.`,
    `• Déclare tes places libres à chaque mise en ligne (Groupe = 1 place, Solo = véhicule entier).`,
    `• Quand une demande arrive, propose ton prix — le passager accepte, refuse ou contre-propose.`,
    ``,
    `Tes gains : commission de 5 % au lancement, puis 8 %, plafonnée à 10 % pour toujours. Tu gardes le reste de chaque course. Tu règles tes commissions une fois par semaine, par transfert Mobile Money, et tu déclares ton paiement dans ton tableau de bord (« J'ai payé »).`,
    ``,
    `Ton tableau de bord : ${input.appUrl}/tableau-de-bord`,
    `La page d'aide : ${input.appUrl}/aide`,
    ``,
    `Bonne route,`,
    `— Stacks Drive`,
  ].join('\n');
  return sendResendEmail({
    to: input.to,
    subject: 'Compte chauffeur vérifié — tu peux te mettre en ligne',
    text,
    context: 'e-mail de bienvenue chauffeur',
  });
}

export interface DriverWeeklyEarningsEmailInput {
  to: string;
  driverName: string | null;
  weekLabel: string;
  ridesCount: number;
  faresTotal: number;
  commissionDue: number;
  debtTotal: number;
  depositPaid: boolean;
  dashboardUrl: string;
}

/** Récap hebdo des gains par chauffeur (v2.24) : un e-mail par
 *  chauffeur, le lundi, construit sur le relevé du lot A
 *  (`weekly_settlements`). Dédupliqué par
 *  `weekly_settlements.driver_email_sent_at` (cron hebdo). */
export async function sendDriverWeeklyEarningsEmail(input: DriverWeeklyEarningsEmailInput): Promise<boolean> {
  const firstName = input.driverName?.split(' ')[0] ?? '';
  const text = [
    `Bonjour${firstName ? ` ${firstName}` : ''},`,
    ``,
    `Voici ton récapitulatif Stacks Drive pour la ${input.weekLabel}.`,
    ``,
    `Courses terminées : ${input.ridesCount}`,
    `Total des prix de course : ${input.faresTotal.toLocaleString('fr-FR')} FCFA`,
    `Commission de la semaine : ${input.commissionDue.toLocaleString('fr-FR')} FCFA`,
    `Total que tu dois (commissions non réglées) : ${input.debtTotal.toLocaleString('fr-FR')} FCFA`,
    input.depositPaid
      ? `Dépôt de garantie : versé.`
      : `Dépôt de garantie : pas encore versé (5 000 FCFA).`,
    ``,
    input.debtTotal > 0
      ? `Pour régler, fais ton transfert Mobile Money puis déclare ton paiement dans ton tableau de bord (« J'ai payé »).`
      : `Tu es à jour — rien à régler cette semaine.`,
    ``,
    `Ton tableau de bord : ${input.dashboardUrl}`,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici).`,
  ].join('\n');
  return sendResendEmail({
    to: input.to,
    subject: `[Stacks Drive] Tes gains — ${input.weekLabel}`,
    text,
    context: `récap hebdo chauffeur (${input.weekLabel})`,
  });
}

export interface SettlementReminderEmailInput {
  to: string;
  driverName: string | null;
  owed: number;
  debtCap: number;
  daysSinceSettlement: number | null;
  dashboardUrl: string;
}

/** Rappel de règlement (v2.24) : quand la dette approche du plafond
 *  ou dépasse 7 jours sans règlement — en complément du rappel
 *  in-app du lot A. Dédupliqué par
 *  `profiles.settlement_reminder_sent_at` (au plus 1 par semaine
 *  et par chauffeur). */
export async function sendSettlementReminderEmail(input: SettlementReminderEmailInput): Promise<boolean> {
  const firstName = input.driverName?.split(' ')[0] ?? '';
  const reason =
    input.owed >= input.debtCap
      ? `tu as atteint le plafond de dette (${input.debtCap.toLocaleString('fr-FR')} FCFA) : tu ne reçois plus de nouvelles demandes tant que tu n'as pas réglé.`
      : input.daysSinceSettlement === null
        ? `tu dois ${input.owed.toLocaleString('fr-FR')} FCFA et tu n'as encore jamais réglé.`
        : `tu dois ${input.owed.toLocaleString('fr-FR')} FCFA sans règlement depuis ${input.daysSinceSettlement} jours.`;
  const text = [
    `Bonjour${firstName ? ` ${firstName}` : ''},`,
    ``,
    `Petit rappel Stacks Drive : ${reason}`,
    ``,
    `Pour régler, fais ton transfert Mobile Money puis déclare ton paiement dans ton tableau de bord (« J'ai payé », montant + référence). Une fois validé par l'administrateur, ta dette baisse et tu reçois de nouveau des demandes.`,
    ``,
    `Ton tableau de bord : ${input.dashboardUrl}`,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici).`,
  ].join('\n');
  return sendResendEmail({
    to: input.to,
    subject: '[Stacks Drive] Rappel : tes commissions à régler',
    text,
    context: 'rappel de règlement chauffeur',
  });
}

export interface IncompleteDossierReminderEmailInput {
  to: string;
  driverName: string | null;
  /** 'first' = 48 h après l'inscription, 'second' = relance à J+7. */
  round: 'first' | 'second';
  dashboardUrl: string;
}

/** Rappel « dossier incomplet » (v2.25, lot C) : le chauffeur n'a pas
 *  terminé sa vérification (selfie / pièce manquante, ou dossier
 *  refusé sans nouvelle soumission). Une seule fois à 48 h, puis une
 *  seule relance à J+7 — dédupliqué en base
 *  (`profiles.incomplete_reminder_sent_at` /
 *  `incomplete_reminder_2_sent_at`, cron hebdo). Ne concerne jamais
 *  un dossier « en attente » (il attend l'administrateur, pas le
 *  chauffeur). */
export async function sendIncompleteDossierReminderEmail(
  input: IncompleteDossierReminderEmailInput
): Promise<boolean> {
  const firstName = input.driverName?.split(' ')[0] ?? '';
  const text = [
    `Bonjour${firstName ? ` ${firstName}` : ''},`,
    ``,
    input.round === 'first'
      ? `Tu as créé ton compte chauffeur Stacks Drive il y a 2 jours, mais ton dossier de vérification n'est pas terminé.`
      : `Ton dossier de vérification Stacks Drive est toujours incomplet, une semaine après ton inscription.`,
    ``,
    `Pour te mettre en ligne et recevoir des demandes, il te manque encore ton selfie et/ou ta pièce d'identité (ou ton permis). Envoie-les depuis ton tableau de bord, rubrique vérification : la vérification est automatique, tu peux rouler dès qu'elle passe.`,
    ``,
    `Ton tableau de bord : ${input.dashboardUrl}`,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici).`,
  ].join('\n');
  return sendResendEmail({
    to: input.to,
    subject:
      input.round === 'first'
        ? '[Stacks Drive] Termine ton dossier chauffeur pour te mettre en ligne'
        : '[Stacks Drive] Ton dossier chauffeur est toujours incomplet',
    text,
    context: `rappel dossier incomplet (${input.round})`,
  });
}

export interface InactiveDriverReminderEmailInput {
  to: string;
  driverName: string | null;
  /** Jours depuis la dernière mise en ligne (null = jamais en ligne). */
  daysSinceOnline: number | null;
  dashboardUrl: string;
}

/** Relance « chauffeur inactif » (v2.25, lot C) : chauffeur vérifié,
 *  jamais en ligne ou absent depuis 7 jours. Au plus 1 par semaine et
 *  par chauffeur (drapeau `profiles.inactive_reminder_sent_at`, cron
 *  hebdo). Jamais envoyée à un chauffeur bloqué par la dette au plafond
 *  (il reçoit le message « régularise pour reprendre ») ni à un
 *  chauffeur refusé / non vérifié (rappel de dossier incomplet). */
export async function sendInactiveDriverReminderEmail(
  input: InactiveDriverReminderEmailInput
): Promise<boolean> {
  const firstName = input.driverName?.split(' ')[0] ?? '';
  const since =
    input.daysSinceOnline === null
      ? `tu ne t'es encore jamais mis en ligne`
      : `tu ne t'es pas mis en ligne depuis ${input.daysSinceOnline} jours`;
  const text = [
    `Bonjour${firstName ? ` ${firstName}` : ''},`,
    ``,
    `Petit rappel Stacks Drive : ${since}. Les passagers autour de toi commandent — mets-toi en ligne et choisis ton quartier pour apparaître sur la carte et recevoir des demandes.`,
    ``,
    `Comment ça marche :`,
    `• Mets-toi en ligne, déclare tes places libres (Groupe = 1 place, Solo = véhicule entier).`,
    `• Quand une demande arrive, propose ton prix — le passager accepte, refuse ou contre-propose.`,
    `• Tu es payé directement par le passager (espèces ou Mobile Money) ; tu gardes 95 % de chaque course au lancement (commission 5 %, puis 8 %, plafonnée à 10 %).`,
    ``,
    `Ton tableau de bord : ${input.dashboardUrl}`,
    ``,
    `— Stacks Drive (e-mail automatique, ne pas répondre directement ici).`,
  ].join('\n');
  return sendResendEmail({
    to: input.to,
    subject: '[Stacks Drive] Les passagers t’attendent — remets-toi en ligne',
    text,
    context: 'relance chauffeur inactif',
  });
}

/** Envoie l'e-mail de bienvenue passager une seule fois (v2.24).
 *  Lit le drapeau `profiles.welcome_email_sent_at` et le pose
 *  après envoi. Si la colonne n'existe pas encore (migration v2.24
 *  non appliquée), ne renvoie RIEN — mieux vaut un e-mail manquant
 *  qu'un e-mail répété à chaque connexion. Ne lève jamais
 *  d'exception. `supabase` est le client serveur de l'appelant. */
export async function maybeSendWelcomeEmail(
  supabase: SupabaseClient,
  user: { id: string; email: string; fullName: string | null; role: string }
): Promise<boolean> {
  try {
    if (user.role !== 'passager') return false;
    const { data, error } = await supabase
      .from('profiles')
      .select('welcome_email_sent_at')
      .eq('id', user.id)
      .single();
    if (error || !data) return false;
    if (data.welcome_email_sent_at) return false;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://stacks-drive.vercel.app';
    const sent = await sendWelcomePassengerEmail({
      to: user.email,
      name: user.fullName,
      appUrl,
    });
    if (!sent) return false;
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', user.id);
    if (updateError) {
      console.error('[email] drapeau de bienvenue non posé pour', user.id);
    }
    return true;
  } catch (err) {
    console.error('[email] bienvenue impossible:', err);
    return false;
  }
}
