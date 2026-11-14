/** File d'attente virtuelle aéroport (v2.34, lot « Au-delà »).
 *
 *  Les chauffeurs présents à l'aéroport (zone Aéroport Léon-Mba)
 *  rejoignent une file virtuelle, premier arrivé premier servi
 *  (ordre d'arrivée `joined_at`). La prochaine demande dont le
 *  départ est l'aéroport part d'abord au premier de la file
 *  (exclusivité de 60 s — le temps de proposer), puis au suivant
 *  si le premier ne répond pas, puis aux chauffeurs hors file
 *  (dispatch normal). Position dans la file visible côté chauffeur ;
 *  sortie de file possible à tout moment (bouton « Quitter la file »).
 *  La file ne bloque jamais une demande : passé le délai, ou file
 *  vide, le dispatch normal reprend.
 *
 *  Présence à l'aéroport = position GPS dans
 *  AIRPORT_QUEUE_RADIUS_KM de l'aéroport OU quartier courant
 *  « Aéroport Léon-Mba ». La file vit en base (`airport_queue`,
 *  migration v2.34) : une ligne par chauffeur, RLS propriétaire +
 *  admin, suppression automatique à la mise hors ligne (meilleur
 *  effort, côté serveur).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NEIGHBORHOOD_COORDS } from './neighborhoods';
import { haversineKm } from './geo';

/** Quartier de l'aéroport (zone de la file). */
export const AIRPORT_NEIGHBORHOOD = 'Aéroport Léon-Mba' as const;
/** Rayon de présence à l'aéroport autour de ses coordonnées (km). */
export const AIRPORT_QUEUE_RADIUS_KM = 2;
/** Exclusivité du premier de la file sur une demande aéroport (secondes). */
export const AIRPORT_QUEUE_EXCLUSIVITY_SEC = 60;

export interface AirportQueueEntry {
  driverId: string;
  joinedAt: string;
  /** Position dans la file (1 = premier). */
  position: number;
}

/** Le chauffeur est-il physiquement à l'aéroport ? */
export function isAtAirport(args: {
  lat: number | null;
  lng: number | null;
  currentArea: string | null;
}): boolean {
  if (args.currentArea === AIRPORT_NEIGHBORHOOD) return true;
  if (args.lat === null || args.lng === null) return false;
  const coords = NEIGHBORHOOD_COORDS[AIRPORT_NEIGHBORHOOD];
  if (!coords) return false;
  return haversineKm(args.lat, args.lng, coords.lat, coords.lng) <= AIRPORT_QUEUE_RADIUS_KM;
}

type Db = SupabaseClient;

/** File complète, dans l'ordre d'arrivée. [] si la table n'existe pas encore. */
export async function getAirportQueue(supabase: Db): Promise<AirportQueueEntry[]> {
  const { data, error } = await supabase
    .from('airport_queue')
    .select('driver_id, joined_at')
    .order('joined_at', { ascending: true });
  if (error) return [];
  return ((data ?? []) as { driver_id: string; joined_at: string }[]).map((r, i) => ({
    driverId: r.driver_id,
    joinedAt: r.joined_at,
    position: i + 1,
  }));
}

/** Premier de la file (null si file vide). */
export async function getAirportQueueHead(supabase: Db): Promise<AirportQueueEntry | null> {
  const queue = await getAirportQueue(supabase);
  return queue[0] ?? null;
}

/** Position d'un chauffeur dans la file (null = pas dans la file). */
export async function getAirportQueuePosition(
  supabase: Db,
  driverId: string
): Promise<number | null> {
  const queue = await getAirportQueue(supabase);
  const entry = queue.find((e) => e.driverId === driverId);
  return entry ? entry.position : null;
}

export async function joinAirportQueue(supabase: Db, driverId: string): Promise<boolean> {
  const { error } = await supabase
    .from('airport_queue')
    .upsert({ driver_id: driverId }, { onConflict: 'driver_id' });
  return !error;
}

export async function leaveAirportQueue(supabase: Db, driverId: string): Promise<boolean> {
  const { error } = await supabase.from('airport_queue').delete().eq('driver_id', driverId);
  return !error;
}
