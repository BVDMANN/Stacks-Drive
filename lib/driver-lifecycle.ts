/** Cycle de vie chauffeur — onboarding, parrainage, relances, dépôt (v2.25, lot C).
 *
 *  Ce module est la logique du lot C : il ne touche NI à la vérification
 *  automatique (v2.4 — décision auto, tickets), NI aux e-mails déjà
 *  envoyés par le lot B (bienvenue chauffeur, récap hebdo, rappel de
 *  règlement — `lib/email.ts`), NI aux commissions (`lib/commission.ts`
 *  : 5 % / 8 % / plafond 10 %, inchangées).
 *
 *  Ce que le lot C AJOUTE :
 *  1. Onboarding autonome : bienvenue in-app (en complément de l'e-mail
 *     du lot B) + rappel si le dossier de vérification est incomplet
 *     après 48 h (une fois), puis une relance à J+7 si toujours incomplet.
 *  2. Parrainage chauffeurs : chaque chauffeur vérifié a un code unique ;
 *     bonus en POINTS (système existant, `lib/gamification.ts` : 100
 *     points/course, 10 000 points = 5 courses sans commission) quand le
 *     filleul est vérifié ET a terminé ses 5 premières courses —
 *     1 000 points au parrain, 500 points au filleul. Le parrainage est
 *     SILENCIEUX : jamais annoncé sur les pages publiques, visible
 *     uniquement côté chauffeur (tableau de bord) et côté admin. Le
 *     parrainage passager vient dans un lot ultérieur — pas ici.
 *  3. Relances chauffeurs inactifs : vérifié, jamais en ligne, ou absent
 *     depuis 7 jours sans mise en ligne → message auto (in-app + e-mail,
 *     max 1/semaine/chauffeur). Jamais le même message pour un chauffeur
 *     bloqué (dette au plafond) ou refusé : le bloqué reçoit le message
 *     de l'item 4, le refusé reçoit le rappel de dossier incomplet.
 *  4. Rappel du dépôt / dette au plafond : message automatique côté
 *     CHAUFFEUR (« régularise pour reprendre », montant dû + moyen de
 *     règlement), visible sur son tableau de bord et son accueil. Il ne
 *     duplique ni l'alerte admin ni le rappel e-mail du lot B.
 *
 *  Les relances et récompenses hebdomadaires passent par les crons
 *  existants (`/api/cron/weekly-report`) — aucun nouveau cron Vercel.
 *  Tout le code est résilient si la migration v2.25 n'est pas encore
 *  appliquée : colonnes/tables absentes = fonctionnalité désactivée
 *  proprement (jamais de crash, jamais d'envoi en rafale).
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DEBT_CAP_FCFA, POINTS_REDEEM_TARGET } from './gamification';

/** Délai avant le 1er rappel « dossier incomplet » (heures). */
export const INCOMPLETE_REMINDER_AFTER_HOURS = 48;
/** Délai avant la 2e relance « dossier incomplet » (jours). */
export const INCOMPLETE_REMINDER_AGAIN_DAYS = 7;
/** Seuil d'inactivité : jours sans mise en ligne avant relance. */
export const INACTIVE_AFTER_DAYS = 7;
/** Courses terminées par le filleul pour débloquer le bonus. */
export const REFERRAL_MILESTONE_RIDES = 5;
/** Points versés au parrain quand le filleul atteint le palier.
 *  v2.34 — PARRAINAGE DOUBLE : 1 000 → 2 000 points (décision du
 *  lot « Au-delà » ; la fonction SQL `credit_referral_bonus` est
 *  remplacée par la migration v2.34 avec les mêmes montants).
 *  Toujours SILENCIEUX : jamais annoncé sur les pages publiques. */
export const REFERRAL_BONUS_REFERRER_POINTS = 2000;
/** Points versés au filleul quand il atteint le palier.
 *  v2.34 — PARRAINAGE DOUBLE : 500 → 1 000 points. */
export const REFERRAL_BONUS_REFEREE_POINTS = 1000;
/** Fenêtre de la relance inactif : au plus 1 e-mail par semaine. */
export const INACTIVE_REMINDER_MIN_GAP_DAYS = 7;

// ---------------------------------------------------------------------------
// Parrainage — code
// ---------------------------------------------------------------------------

/** Code de parrainage déterministe : préfixe + nom normalisé + hash
 *  court de l'id. Le même chauffeur obtient toujours le même code —
 *  on peut donc le (re)calculer sans base, et la contrainte unique en
 *  base ne sert que de garde-fou. Format : `SD-MARTIN-8F3A`. */
export function generateReferralCode(fullName: string | null, userId: string): string {
  const namePart =
    (fullName ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z]+/g, '')
      .slice(0, 8)
      .toUpperCase() || 'DRIVER';
  const hash = createHash('sha256').update(userId).digest('hex').slice(0, 4).toUpperCase();
  return `SD-${namePart}-${hash}`;
}

/** Le palier de parrainage est-il atteint (courses terminées du filleul) ? */
export function referralMilestoneReached(completedRides: number): boolean {
  return completedRides >= REFERRAL_MILESTONE_RIDES;
}

// ---------------------------------------------------------------------------
// Dossier de vérification incomplet
// ---------------------------------------------------------------------------

/** Profil minimal lu pour les relances (colonnes v2.25 tolérées absentes). */
export interface LifecycleProfile {
  id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  is_verified: boolean;
  verification_status: string | null;
  selfie_url: string | null;
  id_document_url: string | null;
  created_at: string;
  last_online_at?: string | null;
  driver_welcome_seen_at?: string | null;
  incomplete_reminder_sent_at?: string | null;
  incomplete_reminder_2_sent_at?: string | null;
  inactive_reminder_sent_at?: string | null;
  referral_code?: string | null;
}

/** Dossier incomplet = chauffeur non vérifié qui n'a pas (encore) soumis
 *  ses pièces, ou dont le dossier a été refusé sans nouvelle soumission.
 *  Un dossier « en_attente » attend l'administrateur, pas le chauffeur :
 *  on ne le relance pas (ce serait lui demander d'attendre plus vite). */
export function isIncompleteDossier(profile: LifecycleProfile): boolean {
  if (profile.role !== 'chauffeur') return false;
  if (profile.is_verified) return false;
  const status = profile.verification_status ?? 'non_verifie';
  if (status === 'en_attente' || status === 'verifie') return false;
  return !profile.selfie_url || !profile.id_document_url;
}

/** Quel rappel « dossier incomplet » est dû maintenant : 'first' (48 h,
 *  jamais envoyé), 'second' (J+7, premier envoyé), ou null. */
export function incompleteReminderDue(
  profile: LifecycleProfile,
  now: Date = new Date()
): 'first' | 'second' | null {
  if (!isIncompleteDossier(profile)) return null;
  const createdAt = new Date(profile.created_at).getTime();
  if (Number.isNaN(createdAt)) return null;
  const ageHours = (now.getTime() - createdAt) / (1000 * 60 * 60);
  if (!profile.incomplete_reminder_sent_at) {
    return ageHours >= INCOMPLETE_REMINDER_AFTER_HOURS ? 'first' : null;
  }
  if (!profile.incomplete_reminder_2_sent_at) {
    return ageHours >= INCOMPLETE_REMINDER_AGAIN_DAYS * 24 ? 'second' : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Inactivité
// ---------------------------------------------------------------------------

/** Chauffeur inactif = vérifié, pas en ligne, et sans mise en ligne
 *  depuis 7 jours (ou jamais en ligne depuis son inscription il y a
 *  plus de 7 jours). Les chauffeurs non vérifiés ne sont pas concernés
 *  (ils reçoivent le rappel de dossier incomplet), ni les chauffeurs
 *  bloqués par la dette au plafond (ils reçoivent le message « régularise
 *  pour reprendre » — voir `isDebtCapped` côté appelant). */
export function isInactiveDriver(
  profile: LifecycleProfile,
  isOnline: boolean,
  now: Date = new Date()
): boolean {
  if (profile.role !== 'chauffeur' || !profile.is_verified) return false;
  if (isOnline) return false;
  const lastOnline = profile.last_online_at
    ? new Date(profile.last_online_at).getTime()
    : null;
  const reference = lastOnline ?? new Date(profile.created_at).getTime();
  if (Number.isNaN(reference)) return false;
  const daysSince = (now.getTime() - reference) / (1000 * 60 * 60 * 24);
  return daysSince >= INACTIVE_AFTER_DAYS;
}

/** La relance e-mail « inactif » peut-elle partir (max 1/semaine) ? */
export function inactiveEmailDue(profile: LifecycleProfile, now: Date = new Date()): boolean {
  if (!profile.inactive_reminder_sent_at) return true;
  const last = new Date(profile.inactive_reminder_sent_at).getTime();
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= INACTIVE_REMINDER_MIN_GAP_DAYS * 24 * 60 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// Dette au plafond — message côté chauffeur (item 11)
// ---------------------------------------------------------------------------

/** Dette au plafond : le chauffeur ne reçoit plus de demandes tant qu'il
 *  n'a pas réglé. Le blocage existe déjà (v2.2 / lot A) ; ce lot ajoute
 *  seulement le message côté chauffeur. */
export function isDebtCapped(owed: number): boolean {
  return owed >= DEBT_CAP_FCFA;
}

/** Progression vers l'échange de points (réutilisée par la carte
 *  parrainage) : 10 000 points = 5 courses sans commission. */
export function pointsToRedeem(points: number): number {
  return Math.max(0, POINTS_REDEEM_TARGET - points);
}

// ---------------------------------------------------------------------------
// Récompenses de parrainage (cron hebdo) — côté serveur uniquement
// ---------------------------------------------------------------------------

export interface ReferralRewardResult {
  checked: number;
  rewarded: number;
  skipped: number;
}

/** Crédite les bonus de parrainage arrivés à échéance (cron hebdo).
 *  Pour chaque parrainage non récompensé : le filleul doit être vérifié
 *  ET avoir terminé 5 courses (`driver_earnings`, une ligne par course
 *  terminée). Le crédit passe par la fonction SECURITY DEFINER
 *  `credit_referral_bonus` (migration v2.25) : elle revérifie le palier
 *  en base et marque le parrainage récompensé — un double passage ne
 *  paie jamais deux fois. Sans migration : 0 récompense, 0 crash. */
export async function processReferralRewards(
  supabase: SupabaseClient
): Promise<ReferralRewardResult> {
  const result: ReferralRewardResult = { checked: 0, rewarded: 0, skipped: 0 };
  try {
    const { data: referrals, error } = await supabase
      .from('driver_referrals')
      .select('id, referrer_id, referee_id')
      .is('rewarded_at', null);
    if (error || !referrals) {
      if (error) console.error('[driver-lifecycle] parrainages illisibles:', error.message);
      return result;
    }
    result.checked = referrals.length;
    for (const ref of referrals as { id: string; referrer_id: string; referee_id: string }[]) {
      try {
        const [{ data: referee }, { count }] = await Promise.all([
          supabase
            .from('profiles')
            .select('is_verified')
            .eq('id', ref.referee_id)
            .single(),
          supabase
            .from('driver_earnings')
            .select('id', { count: 'exact', head: true })
            .eq('driver_id', ref.referee_id),
        ]);
        const verified = (referee as { is_verified?: boolean } | null)?.is_verified === true;
        const rides = count ?? 0;
        if (!verified || !referralMilestoneReached(rides)) {
          result.skipped += 1;
          continue;
        }
        const { error: creditError } = await supabase.rpc('credit_referral_bonus', {
          p_referrer_id: ref.referrer_id,
          p_referee_id: ref.referee_id,
        });
        if (creditError) {
          console.error('[driver-lifecycle] bonus parrainage impossible:', creditError.message);
          result.skipped += 1;
          continue;
        }
        result.rewarded += 1;
      } catch (err) {
        console.error('[driver-lifecycle] parrainage ignoré:', err);
        result.skipped += 1;
      }
    }
  } catch (err) {
    console.error('[driver-lifecycle] récompenses parrainage:', err);
  }
  return result;
}

/** Garantit un code de parrainage au chauffeur (meilleur effort, jamais
 *  bloquant) : fonction SQL d'abord (migration v2.25), sinon calcul
 *  local + mise à jour directe (colonne absente = abandon silencieux). */
export async function ensureReferralCode(
  supabase: SupabaseClient,
  driverId: string,
  fullName: string | null
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('ensure_referral_code', {
      p_driver_id: driverId,
    });
    if (!error && typeof data === 'string' && data) return data;
  } catch {
    // Pas de fonction (migration non appliquée) : repli local.
  }
  const code = generateReferralCode(fullName, driverId);
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ referral_code: code })
      .eq('id', driverId)
      .is('referral_code', null);
    if (error) return null;
    return code;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin — vue parrainage
// ---------------------------------------------------------------------------

export interface AdminReferralRow {
  referrerId: string;
  referrerName: string | null;
  referralCode: string;
  referralsCount: number;
  rewardedCount: number;
  pendingCount: number;
}

/** Parrainages vus par l'admin (tableau de bord /admin) : parrains,
 *  filleuls, bonus versés ou en attente. Sans migration v2.25 :
 *  liste vide, jamais de crash. */
export async function getAdminReferralStats(
  supabase: SupabaseClient
): Promise<AdminReferralRow[]> {
  try {
    const { data, error } = await supabase
      .from('driver_referrals')
      .select('referrer_id, referee_id, referral_code, rewarded_at')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    const rows = data as {
      referrer_id: string;
      referee_id: string;
      referral_code: string;
      rewarded_at: string | null;
    }[];
    if (rows.length === 0) return [];
    const referrerIds = [...new Set(rows.map((r) => r.referrer_id))];
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', referrerIds);
    const names = new Map<string, string | null>(
      ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [
        p.id,
        p.full_name,
      ])
    );
    const byReferrer = new Map<string, AdminReferralRow>();
    for (const r of rows) {
      const existing = byReferrer.get(r.referrer_id) ?? {
        referrerId: r.referrer_id,
        referrerName: names.get(r.referrer_id) ?? null,
        referralCode: r.referral_code,
        referralsCount: 0,
        rewardedCount: 0,
        pendingCount: 0,
      };
      existing.referralsCount += 1;
      if (r.rewarded_at) existing.rewardedCount += 1;
      else existing.pendingCount += 1;
      byReferrer.set(r.referrer_id, existing);
    }
    return [...byReferrer.values()].sort((a, b) => b.referralsCount - a.referralsCount);
  } catch {
    return [];
  }
}
