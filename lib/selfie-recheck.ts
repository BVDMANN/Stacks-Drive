/** Re-vérification selfie ponctuelle (v2.30, plancher P1).
 *
 *  Principe : de temps en temps, le chauffeur doit refaire un selfie
 *  avant de pouvoir se mettre en ligne. Contrôle = simple présence
 *  d'un visage (réutilise la détection v2.4, FaceDetector natif côté
 *  client) — JAMAIS de reconnaissance faciale biométrique ni
 *  d'identification (aucune comparaison avec le selfie d'origine, la
 *  photo n'est pas conservée : seul le résultat du contrôle est
 *  enregistré). En cas de doute (aucun visage détecté), le dossier
 *  part dans la file des tickets admin (v2.4) et le chauffeur reste
 *  hors ligne le temps de la vérification humaine — jamais de blocage
 *  définitif automatique.
 *
 *  Quand la re-vérification est-elle due ?
 *  - drapeau `selfie_recheck_required` posé par l'admin (après un
 *    signalement / litige — POST /api/disputes le pose en meilleur
 *    effort) ou par le balayage hebdo ;
 *  - ou dernier contrôle vieux de plus de 30 jours (balayage hebdo :
 *    `flagDueSelfieRechecks`, au plus 5 chauffeurs par semaine, les
 *    plus anciens d'abord — donc pas plus d'1 fois par mois et par
 *    chauffeur, et jamais en rafale).
 *  La migration v2.30 pose `last_selfie_check_at = now()` pour les
 *  chauffeurs déjà vérifiés : personne n'est bloqué le jour de la
 *  migration. Sans la migration, le drapeau est absent (undefined) :
 *  la re-vérification est inactive, rien d'autre ne change.
 */

import type { createClient } from '@/lib/supabase/server';

export const SELFIE_RECHECK_MAX_DAYS = 30;
export const SELFIE_RECHECK_WEEKLY_CAP = 5;

type RecheckProfile = {
  selfie_recheck_required?: boolean | null;
  last_selfie_check_at?: string | null;
  is_verified?: boolean | null;
};

/** Due ? Drapeau posé, ou dernier contrôle vieux de plus de 30 jours. */
export function isSelfieRecheckDue(profile: RecheckProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.selfie_recheck_required === true) return true;
  const last = profile.last_selfie_check_at;
  if (!last) return false; // sans historique, on ne bloque pas
  const ageMs = Date.now() - new Date(last).getTime();
  return ageMs > SELFIE_RECHECK_MAX_DAYS * 24 * 60 * 60 * 1000;
}

/** Balayage hebdo (appelé par le cron `/api/cron/weekly-report`) :
 *  pose le drapeau pour les chauffeurs vérifiés dont le dernier
 *  contrôle date de plus de 30 jours — au plus 5 par semaine, les
 *  plus anciens d'abord. Meilleur effort, jamais bloquant. */
export async function flagDueSelfieRechecks(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<number> {
  try {
    const cutoff = new Date(
      Date.now() - SELFIE_RECHECK_MAX_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'chauffeur')
      .eq('is_verified', true)
      .eq('selfie_recheck_required', false)
      .lt('last_selfie_check_at', cutoff)
      .order('last_selfie_check_at', { ascending: true })
      .limit(SELFIE_RECHECK_WEEKLY_CAP);
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) return 0;
    await supabase
      .from('profiles')
      .update({
        selfie_recheck_required: true,
        selfie_recheck_reason: 'controle_periodique',
      })
      .in('id', ids);
    return ids.length;
  } catch {
    return 0;
  }
}
