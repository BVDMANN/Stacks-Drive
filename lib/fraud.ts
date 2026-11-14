/** Détection de fraude automatique (v2.26, lot D « Sécurité & qualité »).
 *
 *  Quatre signaux agrégés, construits sur les lots existants (jamais
 *  refaits) :
 *    - `cancellations` — annulations en série AU-DELÀ du signalement
 *      P0a (v2.23 : « À surveiller » = 3+ annulations ET taux > 25 %) :
 *      le seuil fraude est nettement plus haut (voir ci-dessous), pour
 *      ne jamais bloquer un chauffeur légitime qui annule parfois.
 *    - `impossible_speed` — vitesse moyenne impossible sur une course
 *      terminée (distance / durée incohérentes).
 *    - `pin_repeated` — faux PIN répétés AU-DELÀ du verrouillage lot B
 *      (v2.24 : 5 faux PIN = 1 course verrouillée `pin_locked`) : ici
 *      on compte les courses verrouillées, pas les tentatives.
 *    - `shared_phone` — plusieurs comptes avec le même numéro de
 *      téléphone (normalisé).
 *
 *  Effet d'un signal confirmé : UNE SEULE alerte admin (via
 *  `lib/admin-alerts.ts`, sorte `fraud_detected`, clé
 *  `fraud:<signal>:<userId>`, délai 7 jours — l'anti-rafale en base,
 *  c'est le dossier ouvert : un seul dossier `fraud_cases` ouvert par
 *  (utilisateur, signal)) + blocage temporaire automatique du compte
 *  (mise hors ligne + marqueur « à vérifier », réversible par
 *  l'admin dans /admin, tracé dans l'audit). Le blocage ne touche
 *  JAMAIS le paiement ni la dette : il coupe seulement la mise en
 *  ligne et la réception des demandes (propositions refusées,
 *  `is_online` forcé à false). Les courses en cours ne sont pas
 *  interrompues.
 *
 *  Seuils prudents (pas de faux positifs sur des chauffeurs
 *  légitimes) : chaque seuil exige une répétition ou une
 *  incohérence manifeste, jamais un événement isolé.
 *
 *  Résilience : sans la migration v2.26, l'enregistrement en base
 *  (dossier + marqueur) échoue proprement et la détection se limite
 *  à l'alerte e-mail — la course, l'annulation ou le démarrage ne
 *  bloquent jamais sur la fraude. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from './audit';
import { notifyAdminAlert } from './admin-alerts';
import { computeReliability, type ReliabilityStats } from './cancellations';
import { FRAUD_SIGNAL_LABELS, type FraudSignal } from './fraud-labels';

export type { FraudSignal } from './fraud-labels';
export { FRAUD_SIGNAL_LABELS } from './fraud-labels';

// ---------------------------------------------------------------------------
// Seuils (UNIQUES sources de vérité — le script de vérification
// `scripts/verify-lot-d.mjs` les relit depuis ce fichier).
// ---------------------------------------------------------------------------

/** Annulations en série (au-delà du P0a 3 / 25 %) : 6 annulations
 *  dont l'utilisateur est l'auteur, taux > 40 %, sur au moins 10
 *  courses clôturées. Un chauffeur qui annule 5 fois sur 20 courses
 *  (25 %) reste seulement « À surveiller », jamais bloqué. */
export const FRAUD_CANCEL_MIN_BY_ME = 6;
export const FRAUD_CANCEL_MIN_RATE = 0.4;
export const FRAUD_CANCEL_MIN_TOTAL = 10;

/** Vitesse moyenne impossible : au-delà de 150 km/h de moyenne sur
 *  une course, c'est incohérent à Libreville (ville + N1 limitée).
 *  Exigée sur une distance d'au moins 2 km et une durée d'au moins
 *  1 minute, pour ne pas déclencher sur les arrondis (course de
 *  300 m « terminée en 0 minute »). */
export const FRAUD_SPEED_MAX_KMH = 150;
export const FRAUD_SPEED_MIN_DISTANCE_KM = 2;
export const FRAUD_SPEED_MIN_DURATION_MIN = 1;

/** Faux PIN répétés (au-delà du verrouillage lot B) : 2 courses
 *  verrouillées (`pin_locked`) pour le même chauffeur sur 30 jours.
 *  Une seule course verrouillée = l'alerte `pin_locked` du lot B,
 *  pas un blocage. */
export const FRAUD_PIN_LOCKED_MIN = 2;
export const FRAUD_PIN_WINDOW_DAYS = 30;

/** Téléphone partagé : 2 comptes avec le même numéro normalisé =
 *  alerte + marqueur « à vérifier » SANS mise hors ligne (un proche
 *  peut partager un téléphone) ; 3 comptes ou plus = blocage
 *  temporaire comme les autres signaux. */
export const FRAUD_SHARED_PHONE_ALERT_MIN = 2;
export const FRAUD_SHARED_PHONE_BLOCK_MIN = 3;

// ---------------------------------------------------------------------------
// Signaux — logique pure (testable sans base)
// ---------------------------------------------------------------------------

export interface FraudSignalResult {
  signal: FraudSignal;
  /** Le signal est-il confirmé (seuil atteint) ? */
  triggered: boolean;
  /** Faut-il bloquer temporairement le compte (mise hors ligne) ? */
  block: boolean;
  detail: string;
}

/** Annulations en série : au-delà du seuil P0a. `stats` vient de
 *  `computeReliability` (v2.23) — `cancelledByMe` = annulations
 *  dont l'utilisateur est l'auteur. */
export function evaluateCancellationFraud(stats: ReliabilityStats): FraudSignalResult {
  const triggered =
    stats.cancelledByMe >= FRAUD_CANCEL_MIN_BY_ME &&
    stats.cancelRate > FRAUD_CANCEL_MIN_RATE &&
    stats.total >= FRAUD_CANCEL_MIN_TOTAL;
  return {
    signal: 'cancellations',
    triggered,
    block: triggered,
    detail: `${stats.cancelledByMe} annulation(s) par l'utilisateur sur ${stats.total} course(s) clôturée(s) — taux ${Math.round(stats.cancelRate * 100)} % (seuil fraude : ${FRAUD_CANCEL_MIN_BY_ME}+ et > ${Math.round(FRAUD_CANCEL_MIN_RATE * 100)} %).`,
  };
}

/** Vitesse moyenne d'une course terminée (km/h), ou null si les
 *  données ne permettent pas de conclure (distance / durée
 *  manquantes ou trop petites — on ne signale jamais sur un
 *  arrondi). */
export function averageSpeedKmh(
  distanceKm: number | null | undefined,
  durationMin: number | null | undefined
): number | null {
  if (distanceKm == null || durationMin == null) return null;
  if (
    !Number.isFinite(distanceKm) ||
    !Number.isFinite(durationMin) ||
    distanceKm < FRAUD_SPEED_MIN_DISTANCE_KM ||
    durationMin < FRAUD_SPEED_MIN_DURATION_MIN
  ) {
    return null;
  }
  return distanceKm / (durationMin / 60);
}

/** Vitesse impossible sur une course terminée. */
export function evaluateSpeedFraud(
  distanceKm: number | null | undefined,
  durationMin: number | null | undefined
): FraudSignalResult {
  const speed = averageSpeedKmh(distanceKm, durationMin);
  const triggered = speed !== null && speed > FRAUD_SPEED_MAX_KMH;
  return {
    signal: 'impossible_speed',
    triggered,
    block: triggered,
    detail:
      speed === null
        ? 'Distance ou durée insuffisante pour conclure.'
        : `${distanceKm} km en ${durationMin} min = ${Math.round(speed)} km/h de moyenne (seuil : ${FRAUD_SPEED_MAX_KMH} km/h).`,
  };
}

/** Faux PIN répétés : nombre de courses verrouillées (`pin_locked`)
 *  pour le chauffeur sur la fenêtre. */
export function evaluatePinFraud(lockedRidesInWindow: number): FraudSignalResult {
  const triggered = lockedRidesInWindow >= FRAUD_PIN_LOCKED_MIN;
  return {
    signal: 'pin_repeated',
    triggered,
    block: triggered,
    detail: `${lockedRidesInWindow} course(s) verrouillée(s) après 5 codes PIN faux sur ${FRAUD_PIN_WINDOW_DAYS} jours (seuil : ${FRAUD_PIN_LOCKED_MIN}).`,
  };
}

/** Normalise un numéro de téléphone pour la comparaison : chiffres
 *  uniquement, indicatif gabonais (+241 / 00241) et zéro initial
 *  retirés — `+241 06 12 34 56`, `00241 6123456` et `06123456`
 *  sont le même numéro. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  const withoutPrefix = digits.replace(/^(00241|241)/, '').replace(/^0/, '');
  return withoutPrefix.length >= 8 ? withoutPrefix : null;
}

/** Téléphone partagé : combien de comptes portent ce numéro. */
export function evaluateSharedPhoneFraud(accountsWithPhone: number): FraudSignalResult {
  const triggered = accountsWithPhone >= FRAUD_SHARED_PHONE_ALERT_MIN;
  return {
    signal: 'shared_phone',
    triggered,
    block: triggered && accountsWithPhone >= FRAUD_SHARED_PHONE_BLOCK_MIN,
    detail: `${accountsWithPhone} compte(s) avec le même numéro de téléphone (alerte dès ${FRAUD_SHARED_PHONE_ALERT_MIN}, blocage dès ${FRAUD_SHARED_PHONE_BLOCK_MIN}).`,
  };
}

// ---------------------------------------------------------------------------
// Dossiers — lecture / enregistrement (côté serveur uniquement)
// ---------------------------------------------------------------------------

export interface FraudCase {
  id: string;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  signal: FraudSignal;
  status: 'ouvert' | 'resolu' | 'rejete';
  details: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
}

/** Dossiers de fraude ouverts (admin). [] si la table n'existe pas
 *  (migration v2.26 non appliquée). */
export async function getOpenFraudCases(supabase: SupabaseClient): Promise<FraudCase[]> {
  try {
    const { data, error } = await supabase
      .from('fraud_cases')
      .select('id, user_id, signal, status, details, created_at, resolved_at')
      .eq('status', 'ouvert')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    const rows = data as {
      id: string;
      user_id: string;
      signal: FraudSignal;
      status: 'ouvert';
      details: Record<string, unknown>;
      created_at: string;
      resolved_at: string | null;
    }[];
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    let names = new Map<string, { name: string | null; phone: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', userIds);
      names = new Map(
        ((profiles ?? []) as { id: string; full_name: string | null; phone: string | null }[]).map(
          (p) => [p.id, { name: p.full_name, phone: p.phone }]
        )
      );
    }
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      userName: names.get(r.user_id)?.name ?? null,
      userPhone: names.get(r.user_id)?.phone ?? null,
      signal: r.signal,
      status: r.status,
      details: r.details ?? {},
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));
  } catch {
    return [];
  }
}

/** Comptes actuellement bloqués temporairement pour fraude (admin) :
 *  id → motif. [] si les colonnes n'existent pas. */
export async function getFraudBlockedUsers(
  supabase: SupabaseClient
): Promise<{ id: string; fullName: string | null; reason: string | null; blockedAt: string | null }[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, fraud_blocked_reason, fraud_blocked_at')
      .eq('fraud_blocked', true)
      .order('fraud_blocked_at', { ascending: false });
    if (error || !data) return [];
    return (data as { id: string; full_name: string | null; fraud_blocked_reason: string | null; fraud_blocked_at: string | null }[]).map(
      (p) => ({
        id: p.id,
        fullName: p.full_name,
        reason: p.fraud_blocked_reason,
        blockedAt: p.fraud_blocked_at,
      })
    );
  } catch {
    return [];
  }
}

export interface ReportFraudInput {
  userId: string;
  signal: FraudSignal;
  /** Détail humain (trajet, chiffres, compteur). */
  detail: string;
  /** Le compte doit-il être mis hors ligne (sinon : marqueur seul) ? */
  block: boolean;
}

/** Enregistre un cas de fraude (un seul dossier ouvert par
 *  utilisateur et par signal — l'appel répété ne crée rien et
 *  n'envoie pas une deuxième alerte) + bloque temporairement le
 *  compte si `block` (mise hors ligne + marqueur « à vérifier »).
 *  Passe par la fonction SECURITY DEFINER `report_fraud_case`
 *  (migration v2.26) : elle fonctionne sans session (cron) et pour
 *  un autre compte que l'appelant (téléphone partagé). Repli direct
 *  (insert + update) si la fonction n'existe pas encore — le
 *  blocage d'un autre compte peut alors échouer proprement (RLS) :
 *  l'alerte admin part quand même. Ne lève jamais d'exception.
 *  Renvoie `created` = un nouveau dossier a été ouvert. */
export async function reportFraudCase(
  supabase: SupabaseClient,
  input: ReportFraudInput
): Promise<{ created: boolean }> {
  const label = FRAUD_SIGNAL_LABELS[input.signal];
  let created = false;
  try {
    const { data, error } = await supabase.rpc('report_fraud_case', {
      p_user_id: input.userId,
      p_signal: input.signal,
      p_details: { detail: input.detail, block: input.block },
      p_block: input.block,
    });
    if (!error) {
      created = data === true;
    } else {
      // Fonction absente (migration v2.26 non appliquée) : repli.
      created = await reportFraudCaseFallback(supabase, input);
    }
  } catch {
    try {
      created = await reportFraudCaseFallback(supabase, input);
    } catch {
      created = false;
    }
  }
  if (!created) return { created: false };
  // Une seule alerte par cas (clé = signal + utilisateur, délai
  // 7 jours côté lib/admin-alerts.ts) — jamais de rafale.
  try {
    await notifyAdminAlert({
      kind: 'fraud_detected',
      key: `fraud:${input.signal}:${input.userId}`,
      detail: `Suspicion de fraude — ${label}.\n${input.detail}\n${input.block ? 'Compte mis hors ligne temporairement (« à vérifier ») — à débloquer dans /admin après contrôle.' : 'Compte signalé « à vérifier » (pas de mise hors ligne pour ce signal).'} Le paiement et la dette ne sont pas touchés.`,
    });
  } catch {
    // Alerte ratée : le dossier reste visible dans /admin.
  }
  try {
    await logAudit(supabase, 'fraud_blocked', {
      actorId: input.userId,
      rideId: null,
      signal: input.signal,
      detail: input.detail,
      blocked: input.block,
    });
  } catch {
    // Audit indisponible (cron sans session) : le dossier fait foi.
  }
  return { created: true };
}

/** Repli sans la fonction SECURITY DEFINER : insert direct dans
 *  `fraud_cases` (dédup par l'index unique partiel sur les dossiers
 *  ouverts) + mise hors ligne du compte. Échoue proprement si la
 *  table / les colonnes n'existent pas. */
async function reportFraudCaseFallback(
  supabase: SupabaseClient,
  input: ReportFraudInput
): Promise<boolean> {
  const { data, error } = await supabase
    .from('fraud_cases')
    .insert({
      user_id: input.userId,
      signal: input.signal,
      status: 'ouvert',
      details: { detail: input.detail, block: input.block },
    })
    .select('id')
    .single();
  if (error || !data) return false;
  if (input.block) {
    await supabase
      .from('profiles')
      .update({
        is_online: false,
        fraud_blocked: true,
        fraud_blocked_at: new Date().toISOString(),
        fraud_blocked_reason: FRAUD_SIGNAL_LABELS[input.signal],
      })
      .eq('id', input.userId);
  } else {
    await supabase
      .from('profiles')
      .update({
        fraud_blocked_reason: FRAUD_SIGNAL_LABELS[input.signal],
      })
      .eq('id', input.userId);
  }
  return true;
}

/** Débloque un compte (admin) : marqueur levé, remise en ligne
 *  autorisée (le chauffeur devra se remettre en ligne lui-même),
 *  dossiers ouverts du compte marqués résolus. Tracé dans l'audit.
 *  Ne touche ni au paiement ni à la dette. */
export async function unblockFraudUser(
  supabase: SupabaseClient,
  adminId: string,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('resolve_fraud_case', {
      p_user_id: userId,
      p_admin_id: adminId,
    });
    if (!error) {
      await logAudit(supabase, 'fraud_unblocked', { actorId: adminId, rideId: null, userId });
      return data === true;
    }
  } catch {
    // Repli direct ci-dessous.
  }
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ fraud_blocked: false, fraud_blocked_at: null, fraud_blocked_reason: null })
      .eq('id', userId);
    if (error) return false;
    await supabase
      .from('fraud_cases')
      .update({ status: 'resolu', resolved_at: new Date().toISOString(), resolved_by: adminId })
      .eq('user_id', userId)
      .eq('status', 'ouvert');
    await logAudit(supabase, 'fraud_unblocked', { actorId: adminId, rideId: null, userId });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Vérifications déclenchées par les événements (jamais bloquantes)
// ---------------------------------------------------------------------------

/** Après une annulation : l'auteur dépasse-t-il le seuil fraude
 *  (au-delà du signalement P0a) ? Appelé en meilleur effort après
 *  `recordCancellation` — ne bloque jamais l'annulation. */
export async function checkCancellationFraud(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('ride_cancellations')
      .select('ride_id')
      .eq('cancelled_by_user_id', userId);
    let byMe: number;
    let total: number;
    if (!error && data) {
      byMe = data.length;
      const { data: rides } = await supabase
        .from('rides')
        .select('id')
        .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
        .in('status', ['terminee', 'annulee']);
      total = (rides ?? []).length;
      // Taux = annulations de l'auteur / courses clôturées.
      const stats = computeReliability(total - byMe, byMe, byMe);
      const result = evaluateCancellationFraud(stats);
      if (result.triggered) {
        await reportFraudCase(supabase, { userId, signal: 'cancellations', detail: result.detail, block: result.block });
      }
      return;
    }
    // Repli sans la table v2.23 : fiabilité lue depuis `rides`.
    const { data: rides } = await supabase
      .from('rides')
      .select('status, cancelled_by')
      .or(`passenger_id.eq.${userId},driver_id.eq.${userId}`)
      .in('status', ['terminee', 'annulee']);
    const rows = (rides ?? []) as { status: string; cancelled_by: string | null }[];
    const completed = rows.filter((r) => r.status === 'terminee').length;
    const cancelled = rows.filter((r) => r.status === 'annulee').length;
    const result = evaluateCancellationFraud(computeReliability(completed, cancelled, cancelled));
    if (result.triggered) {
      await reportFraudCase(supabase, { userId, signal: 'cancellations', detail: result.detail, block: result.block });
    }
  } catch {
    // Détection indisponible : l'annulation a déjà abouti.
  }
}

/** Après un verrouillage PIN (lot B) : le chauffeur a-t-il déjà
 *  d'autres courses verrouillées sur 30 jours ? */
export async function checkPinFraud(supabase: SupabaseClient, driverId: string): Promise<void> {
  try {
    const since = new Date(Date.now() - FRAUD_PIN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('rides')
      .select('id')
      .eq('driver_id', driverId)
      .eq('pin_locked', true)
      .gte('updated_at', since);
    if (error || !data) return;
    const result = evaluatePinFraud(data.length);
    if (result.triggered) {
      await reportFraudCase(supabase, { userId: driverId, signal: 'pin_repeated', detail: result.detail, block: result.block });
    }
  } catch {
    // Détection indisponible : le verrouillage lot B reste en place.
  }
}

/** À la clôture d'une course : la vitesse moyenne est-elle
 *  impossible (distance / durée incohérentes) ? `distanceKm` et
 *  `durationMin` viennent de la ligne `rides` (distance posée à la
 *  demande, durée calculée à la clôture) — null = on ne conclut
 *  pas. */
export async function checkSpeedFraud(
  supabase: SupabaseClient,
  driverId: string,
  rideId: string,
  distanceKm: number | null,
  durationMin: number | null
): Promise<void> {
  const result = evaluateSpeedFraud(distanceKm, durationMin);
  if (!result.triggered) return;
  try {
    await reportFraudCase(supabase, {
      userId: driverId,
      signal: 'impossible_speed',
      detail: `Course ${rideId} : ${result.detail}`,
      block: result.block,
    });
  } catch {
    // Détection indisponible : la course reste terminée.
  }
}

/** Balayage hebdomadaire (cron `/api/cron/weekly-report`) : pour
 *  chaque chauffeur, annulations + PIN (rattrape les cas manqués
 *  si un hook a échoué) ; pour tous les comptes, téléphones
 *  partagés. Renvoie le nombre de nouveaux dossiers ouverts.
 *  Meilleur effort, jamais bloquant pour le rapport hebdo. */
export async function runWeeklyFraudSweep(supabase: SupabaseClient): Promise<{
  checkedDrivers: number;
  checkedPhones: number;
  newCases: number;
}> {
  const summary = { checkedDrivers: 0, checkedPhones: 0, newCases: 0 };
  try {
    const { data: drivers, error } = await supabase
      .from('profiles')
      .select('id, phone')
      .eq('role', 'chauffeur');
    if (error || !drivers) return summary;
    const rows = drivers as { id: string; phone: string | null }[];
    summary.checkedDrivers = rows.length;
    for (const driver of rows) {
      try {
        await checkCancellationFraud(supabase, driver.id);
        await checkPinFraud(supabase, driver.id);
      } catch {
        // Un chauffeur illisible ne bloque pas le balayage.
      }
    }
    // Téléphones partagés : regroupement en mémoire (petit volume
    // au lancement — à passer en SQL si des milliers de comptes).
    const byPhone = new Map<string, string[]>();
    const { data: profiles } = await supabase.from('profiles').select('id, phone');
    for (const p of (profiles ?? []) as { id: string; phone: string | null }[]) {
      const normalized = normalizePhone(p.phone);
      if (!normalized) continue;
      const list = byPhone.get(normalized) ?? [];
      list.push(p.id);
      byPhone.set(normalized, list);
    }
    summary.checkedPhones = byPhone.size;
    for (const [phone, userIds] of byPhone) {
      if (userIds.length < FRAUD_SHARED_PHONE_ALERT_MIN) continue;
      const result = evaluateSharedPhoneFraud(userIds.length);
      for (const userId of userIds) {
        const res = await reportFraudCase(supabase, {
          userId,
          signal: 'shared_phone',
          detail: `Numéro ${phone} partagé par ${userIds.length} compte(s). ${result.detail}`,
          block: result.block,
        });
        if (res.created) summary.newCases += 1;
      }
    }
  } catch {
    // Balayage indisponible : le rapport hebdo continue.
  }
  return summary;
}
