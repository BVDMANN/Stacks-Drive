/** Contacts de confiance (v2.23, plancher P0a) — partage automatique
 *  du suivi de course (Uber « Trusted Contacts »).
 *
 *  Le passager enregistre 1 à 5 contacts de confiance dans son compte
 *  (nom + téléphone, e-mail optionnel). Au départ de la course
 *  (démarrage validé par le code PIN, côté serveur), le lien de suivi
 *  en direct (/suivi/[token]) est envoyé automatiquement :
 *    - par e-mail aux contacts qui ont une adresse (Resend, via
 *      lib/email.ts — même contrat que les autres e-mails : jamais
 *      d'exception, false si Resend n'est pas configuré) ;
 *    - par WhatsApp / SMS en 1 tap depuis l'écran de course (liens
 *      `wa.me` / `sms:` pré-remplis) — il n'existe pas de fournisseur
 *      SMS branché à la plateforme, donc aucun envoi SMS direct côté
 *      serveur : le dire clairement vaut mieux qu'un faux envoi.
 *  Le partage manuel (copie du lien) existe déjà et reste disponible.
 *
 *  Confidentialité (v2.20) : les contacts ne sont visibles que par
 *  leur propriétaire (RLS, migration v2.23) — jamais exposés dans le
 *  lien de suivi public, jamais envoyés au chauffeur. Le numéro de
 *  téléphone du chauffeur n'apparaît toujours jamais. */

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_TRUSTED_CONTACTS = 5;

export interface TrustedContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  email: string | null;
  createdAt: string;
}

interface TrustedContactRow {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  email: string | null;
  created_at: string;
}

function mapRow(row: TrustedContactRow): TrustedContact {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
  };
}

/** Contacts de confiance du passager (ses seuls contacts). [] si la
 *  table n'existe pas encore (migration v2.23 non appliquée). */
export async function getTrustedContacts(
  supabase: SupabaseClient,
  userId: string
): Promise<TrustedContact[]> {
  const { data, error } = await supabase
    .from('trusted_contacts')
    .select('id, user_id, name, phone, email, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error || !data) return [];
  return (data as TrustedContactRow[]).map(mapRow);
}

/** Normalise un numéro pour wa.me / sms: : indicatif Gabon (241) si
 *  le numéro commence par 0, chiffres uniquement sinon. */
export function toSharePhoneNumber(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('0')) return `241${digits.slice(1)}`;
  return digits;
}

/** Texte envoyé aux contacts : lien de suivi + trajet + chauffeur. */
export function buildTrustedShareText(args: {
  shareUrl: string;
  pickup: string;
  destination: string;
  driverName: string | null;
  plate: string | null;
  price: string;
}): string {
  return (
    `Je suis en course Stacks Drive : ${args.pickup} → ${args.destination}. ` +
    `Suis mon trajet en direct : ${args.shareUrl}` +
    (args.driverName ? ` — Chauffeur : ${args.driverName}` : '') +
    (args.plate ? ` (plaque ${args.plate})` : '') +
    `. Prix : ${args.price}.`
  );
}

export function waShareLink(phone: string, text: string): string {
  return `https://wa.me/${toSharePhoneNumber(phone)}?text=${encodeURIComponent(text)}`;
}

export function smsShareLink(phone: string, text: string): string {
  return `sms:${toSharePhoneNumber(phone)}?body=${encodeURIComponent(text)}`;
}
