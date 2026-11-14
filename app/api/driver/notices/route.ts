import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDriverDebts } from '@/lib/settlements';
import {
  INACTIVE_AFTER_DAYS,
  INCOMPLETE_REMINDER_AFTER_HOURS,
  isDebtCapped,
  isInactiveDriver,
  isIncompleteDossier,
  type LifecycleProfile,
} from '@/lib/driver-lifecycle';

export const dynamic = 'force-dynamic';

/** Types de messages in-app chauffeur (v2.25, lot C). */
export type DriverNoticeKind =
  | 'welcome'
  | 'incomplete_dossier'
  | 'inactive'
  | 'debt_cap'
  /** Compte bloqué temporairement pour suspicion de fraude (v2.26,
   *  lot D) : mise hors ligne + marqueur « à vérifier », à
   *  débloquer par l'administrateur. */
  | 'fraud_blocked';

export interface DriverNotice {
  kind: DriverNoticeKind;
  title: string;
  message: string;
  /** Montant dû (debt_cap uniquement). */
  amount?: number;
  /** Plafond de dette (debt_cap uniquement). */
  cap?: number;
  /** Jours depuis la dernière mise en ligne (inactive uniquement,
   *  null = jamais en ligne). */
  daysSinceOnline?: number | null;
  /** Heures depuis l'inscription (incomplete_dossier uniquement). */
  hoursSinceSignup?: number;
}

const FULL_COLUMNS =
  'id, role, full_name, email, is_verified, verification_status, selfie_url, id_document_url, created_at, is_online, last_online_at, driver_welcome_seen_at, incomplete_reminder_sent_at, incomplete_reminder_2_sent_at, inactive_reminder_sent_at, referral_code';
const LEGACY_COLUMNS =
  'id, role, full_name, email, is_verified, verification_status, selfie_url, id_document_url, created_at, is_online';

/** GET /api/driver/notices — messages in-app du chauffeur connecté.
 *
 *  Calculés à chaque lecture (jamais stockés, sauf la bienvenue vue) :
 *  bienvenue (vérifié, pas encore vue), dossier incomplet (48 h+),
 *  inactivité (7 jours sans mise en ligne), dette au plafond
 *  (« régularise pour reprendre », montant dû + règlement).
 *  Un chauffeur bloqué par la dette ne reçoit PAS la relance inactif
 *  (le message au plafond la remplace) ; un chauffeur refusé / non
 *  vérifié ne reçoit pas la relance inactif (rappel de dossier).
 *  Résilient sans la migration v2.25 : les colonnes absentes sont
 *  relues en mode dégradé (pas de bienvenue persistante, pas de
 *  dernière mise en ligne — l'inactivité retombe sur la date
 *  d'inscription). */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

  let profile: LifecycleProfile & { is_online: boolean } | null = null;
  const full = await supabase.from('profiles').select(FULL_COLUMNS).eq('id', user.id).single();
  if (!full.error && full.data) {
    profile = full.data as unknown as LifecycleProfile & { is_online: boolean };
  } else {
    const legacy = await supabase.from('profiles').select(LEGACY_COLUMNS).eq('id', user.id).single();
    if (legacy.error || !legacy.data) {
      return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
    }
    profile = legacy.data as unknown as LifecycleProfile & { is_online: boolean };
  }
  if (profile.role !== 'chauffeur') {
    return NextResponse.json({ ok: true, notices: [] });
  }

  const now = new Date();
  const notices: DriverNotice[] = [];

  // Compte bloqué temporairement pour suspicion de fraude (v2.26) :
  // premier message, il remplace les autres relances (inutile de
  // relancer un chauffeur qui ne peut pas se mettre en ligne).
  // Lecture gardée : sans la migration v2.26, la colonne n'existe
  // pas et ce message est simplement absent.
  let fraudBlocked = false;
  try {
    const { data: fraud } = await supabase
      .from('profiles')
      .select('fraud_blocked, fraud_blocked_reason')
      .eq('id', user.id)
      .single();
    fraudBlocked = (fraud as { fraud_blocked?: boolean } | null)?.fraud_blocked === true;
    if (fraudBlocked) {
      const reason = (fraud as { fraud_blocked_reason?: string | null } | null)?.fraud_blocked_reason;
      notices.push({
        kind: 'fraud_blocked',
        title: 'Ton compte est à vérifier',
        message:
          'Ton compte a été mis hors ligne temporairement après une détection automatique (annulations répétées, vitesse incohérente, codes PIN répétés ou téléphone partagé). Tes paiements et ta dette ne sont pas touchés — contacte l’administrateur pour vérifier ton compte et te remettre en ligne.' +
          (reason ? ` Motif signalé : ${reason}.` : ''),
      });
      return NextResponse.json({ ok: true, notices });
    }
  } catch {
    // Colonne absente ou illisible : pas de message fraude.
  }

  // Bienvenue in-app (en complément de l'e-mail du lot B) : une fois,
  // tant que le chauffeur ne l'a pas fermée.
  if (profile.is_verified && !profile.driver_welcome_seen_at) {
    notices.push({
      kind: 'welcome',
      title: 'Bienvenue sur Stacks Drive — ton compte est vérifié',
      message:
        'Tu peux te mettre en ligne et recevoir des demandes. Déclare tes places libres à chaque mise en ligne (Groupe = 1 place, Solo = véhicule entier), propose tes prix, et tu es payé directement par le passager.',
    });
  }

  // Dossier incomplet : pièces manquantes ou dossier refusé, 48 h+
  // après l'inscription (le rappel e-mail part en parallèle, cron hebdo).
  if (isIncompleteDossier(profile)) {
    const hoursSinceSignup = Math.floor(
      (now.getTime() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60)
    );
    if (hoursSinceSignup >= INCOMPLETE_REMINDER_AFTER_HOURS) {
      notices.push({
        kind: 'incomplete_dossier',
        title: 'Termine ton dossier pour te mettre en ligne',
        message:
          'Ton dossier de vérification est incomplet : il manque ton selfie et/ou ta pièce d’identité (ou ton permis). Sans vérification, tu ne peux pas te mettre en ligne ni proposer de courses.',
        hoursSinceSignup,
      });
    }
  }

  // Dette au plafond : message « régularise pour reprendre » (item 11).
  // Il remplace la relance inactif — on ne relance jamais un chauffeur
  // bloqué avec le message « remets-toi en ligne ».
  let debtCapped = false;
  let owed = 0;
  try {
    const debts = await getDriverDebts();
    const mine = debts.find((d) => d.driverId === user.id);
    owed = mine?.owed ?? 0;
    debtCapped = isDebtCapped(owed);
  } catch {
    // Dette illisible : pas de message au plafond (le blocage des
    // demandes, lui, est appliqué côté /api/rides).
  }
  if (debtCapped) {
    const { DEBT_CAP_FCFA } = await import('@/lib/gamification');
    notices.push({
      kind: 'debt_cap',
      title: 'Régularise pour reprendre',
      message:
        'Tu as atteint le plafond de dette : tu ne reçois plus de nouvelles demandes tant que tu n’as pas réglé tes commissions. Fais ton transfert Mobile Money (Airtel Money ou Moov Money), puis déclare ton paiement dans « J’ai payé » ci-dessous — une fois validé, tu reçois de nouveau des demandes.',
      amount: owed,
      cap: DEBT_CAP_FCFA,
    });
  } else if (isInactiveDriver(profile, profile.is_online, now)) {
    const reference = profile.last_online_at
      ? new Date(profile.last_online_at).getTime()
      : new Date(profile.created_at).getTime();
    const daysSinceOnline = Number.isNaN(reference)
      ? null
      : Math.floor((now.getTime() - reference) / (1000 * 60 * 60 * 24));
    notices.push({
      kind: 'inactive',
      title:
        daysSinceOnline === null
          ? 'Tu ne t’es encore jamais mis en ligne'
          : `Tu ne t’es pas mis en ligne depuis ${daysSinceOnline} jours`,
      message:
        'Les passagers autour de toi commandent — mets-toi en ligne et choisis ton quartier pour apparaître sur la carte et recevoir des demandes.',
      daysSinceOnline,
    });
  }

  // Le code de parrainage est exposé par /api/driver/referral (carte
  // dédiée du tableau de bord), pas dans les messages.
  return NextResponse.json({ ok: true, notices, inactivityThresholdDays: INACTIVE_AFTER_DAYS });
}

/** POST /api/driver/notices — marquer la bienvenue comme vue.
 *  Corps : { "action": "dismiss_welcome" }. Meilleur effort : sans
 *  la migration v2.25, la colonne manque et la bienvenue réapparaît
 *  à la prochaine visite (le client la masque aussi en local). */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.action !== 'dismiss_welcome') {
    return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
  }
  try {
    await supabase
      .from('profiles')
      .update({ driver_welcome_seen_at: new Date().toISOString() })
      .eq('id', user.id);
  } catch {
    // Colonne absente (migration non appliquée) : le client masque
    // la bienvenue en local, rien de bloquant.
  }
  return NextResponse.json({ ok: true });
}
