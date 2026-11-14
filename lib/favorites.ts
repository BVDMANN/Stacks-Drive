/** Chauffeur favori (v2.34, lot « Au-delà »).
 *
 *  Depuis l'historique (« Mes courses »), le passager peut choisir
 *  de reprendre avec un chauffeur déjà rencontré (« Reprendre avec
 *  ce chauffeur »). La demande part en priorité à ce chauffeur :
 *  exclusivité de 30 s pendant laquelle lui seul voit la demande,
 *  puis elle s'ouvre aux autres chauffeurs (dispatch normal) s'il
 *  n'a pas répondu. Visible uniquement pour le passager concerné :
 *  la liste des favoris et le choix du favori ne sont jamais
 *  exposés à un autre passager ni au chauffeur lui-même.
 *
 *  Stockage : `favorite_drivers` (passager → chauffeur, migration
 *  v2.34) + `rides.preferred_driver_id` / `rides.preferred_until`
 *  sur la demande elle-même. Le favori n'est qu'une priorité
 *  d'envoi : il ne garantit pas l'acceptation, et le chauffeur
 *  favori reste libre de refuser ou d'ignorer.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Délai d'exclusivité du chauffeur favori (secondes). */
export const FAVORITE_EXCLUSIVITY_SEC = 30;

export interface FavoriteDriver {
  driverId: string;
  driverName: string | null;
  createdAt: string;
}

type Db = SupabaseClient;

/** Chauffeurs favoris du passager (les plus récents d'abord). */
export async function listFavoriteDrivers(
  supabase: Db,
  passengerId: string
): Promise<FavoriteDriver[]> {
  const { data, error } = await supabase
    .from('favorite_drivers')
    .select('driver_id, created_at, driver:profiles!favorite_drivers_driver_id_fkey (full_name)')
    .eq('passenger_id', passengerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return ((data ?? []) as unknown as {
    driver_id: string;
    created_at: string;
    driver: { full_name: string | null } | { full_name: string | null }[] | null;
  }[]).map((r) => ({
    driverId: r.driver_id,
    driverName: Array.isArray(r.driver) ? (r.driver[0]?.full_name ?? null) : (r.driver?.full_name ?? null),
    createdAt: r.created_at,
  }));
}

/** Ajoute un chauffeur aux favoris (idempotent). Le chauffeur doit
 *  avoir déjà conduit le passager — vérifié côté route API. */
export async function addFavoriteDriver(
  supabase: Db,
  passengerId: string,
  driverId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('favorite_drivers')
    .upsert(
      { passenger_id: passengerId, driver_id: driverId },
      { onConflict: 'passenger_id,driver_id' }
    );
  return !error;
}

export async function removeFavoriteDriver(
  supabase: Db,
  passengerId: string,
  driverId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('favorite_drivers')
    .delete()
    .eq('passenger_id', passengerId)
    .eq('driver_id', driverId);
  return !error;
}

/** La demande est-elle encore dans la fenêtre d'exclusivité du favori ? */
export function isFavoriteExclusive(preferredUntil: string | null, nowMs: number = Date.now()): boolean {
  if (!preferredUntil) return false;
  return new Date(preferredUntil).getTime() > nowMs;
}
