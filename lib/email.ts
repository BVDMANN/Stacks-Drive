/** Envoi d'e-mails Stacks Drive (v2.4) — Resend.
 *
 *  Actif SEULEMENT si RESEND_API_KEY est définie (Vercel > Settings >
 *  Environment Variables, ou .env.local). Sans clé : aucun envoi, un
 *  simple log serveur — le ticket reste visible dans /admin avec un
 *  bandeau « E-mails non configurés ».
 *
 *  Expéditeur par défaut : onboarding@resend.dev (plan gratuit Resend,
 *  qui autorise l'envoi vers l'e-mail du propriétaire du compte — ici
 *  l'admin, boulinguirandy76@gmail.com). Quand un domaine est vérifié
 *  dans Resend, définir EMAIL_FROM (ex : « Stacks Drive
 *  <noreply@stacksdrive.app> »).
 *
 *  AUCUNE clé en dur ici : tout passe par les variables d'environnement.
 *  Randy crée le compte Resend lui-même (voir SETUP.md, section v2.4).
 */

import type { TicketUrgency } from '@/lib/verification';
import { CHECK_REASON_LABELS, URGENCY_LABELS } from '@/lib/verification';

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'boulinguirandy76@gmail.com';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[email] Resend non configuré — ticket ${input.ticketId} (${input.urgency}) non envoyé par e-mail. Destinataire : ${input.to}.`
    );
    return false;
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const from = process.env.EMAIL_FROM ?? 'Stacks Drive <onboarding@resend.dev>';
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
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject,
      text,
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
