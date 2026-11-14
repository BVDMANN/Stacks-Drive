import type { SupabaseClient } from '@supabase/supabase-js';
import type { DriverStatus, RideType } from '@/types';

/** Places libres + statut chauffeur (v2.19) — UNIQUE source de vérité.
 *
 *  Modèle : la capacité du véhicule est `profiles.seats` (déclarée dans
 *  le profil chauffeur). Les places libres sont `profiles.free_seats`
 *  (colonne ajoutée par `supabase/migration-v2.19-seats.sql`, NULL =
 *  pas encore déclarées = capacité entière libre).
 *
 *  Statut DÉRIVÉ (jamais stocké — il se recalcule à chaque lecture
 *  depuis les places libres + les courses en cours, donc il ne peut
 *  pas se désynchroniser) :
 *    - Vide : aucune course en cours, véhicule entièrement libre.
 *    - En course : course en cours avec des places encore libres, ou
 *      course Solo en cours (véhicule entier pris, sans disponibilité
 *      jusqu'à la fin de la course).
 *    - Plein : 0 place libre (hors course Solo — voir ci-dessus).
 *  L'interface affiche toujours le statut AVEC le compteur « X/Y
 *  places libres » : un chauffeur sans course mais avec des places
 *  partiellement déclarées reste « Vide » (disponible), le compteur
 *  dit combien de places il propose vraiment.
 *
 *  Matching (courses adaptées) :
 *    - Groupe : uniquement les chauffeurs avec au moins 1 place libre,
 *      y compris ceux déjà en course Groupe avec des places restantes
 *      (taxi partagé). Une course Solo en cours bloque tout (le
 *      véhicule entier est pris).
 *    - Solo : uniquement les chauffeurs TOTALEMENT vides (aucune
 *      course en cours, véhicule entier libre).
 *    - Plein (0 place libre) : plus aucune demande, quel que soit le type.
 *
 *  Transitions (côté serveur uniquement, jamais depuis le client) :
 *    - Acceptation Groupe : places libres − 1.
 *    - Acceptation Solo : places libres → 0.
 *    - Fin / annulation d'une course acceptée : Groupe + 1 (plafonné
 *      à la capacité), Solo → capacité entière.
 *  Groupe = 1 place, Solo = véhicule entier : aucun compteur de
 *  passagers côté passager. */

export type { DriverStatus };

/** Libellés du statut chauffeur (affichés côté chauffeur et admin). */
export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  vide: 'Vide',
  en_course: 'En course',
  plein: 'Plein',
};

/** Places libres effectives : NULL (jamais déclarées) = capacité entière. */
export function normalizeFreeSeats(
  capacity: number | null,
  freeSeats: number | null | undefined
): number {
  const cap = Math.max(0, capacity ?? 0);
  if (freeSeats === null || freeSeats === undefined) return cap;
  return Math.min(cap, Math.max(0, freeSeats));
}

/** Statut dérivé d'un chauffeur. `activeRideTypes` = types des courses
 *  en cours du chauffeur (statuts `acceptee` / `en_cours`). */
export function deriveDriverStatus(args: {
  capacity: number | null;
  freeSeats: number | null | undefined;
  activeRideTypes: RideType[];
}): DriverStatus {
  const free = normalizeFreeSeats(args.capacity, args.freeSeats);
  const hasActiveSolo = args.activeRideTypes.includes('solo');
  const hasActiveRide = args.activeRideTypes.length > 0;
  // Course Solo en cours : le véhicule entier est pris — « En course »
  // sans disponibilité, jusqu'à la fin de la course (même à 0 place).
  if (hasActiveSolo) return 'en_course';
  if (free <= 0) return 'plein';
  if (hasActiveRide) return 'en_course';
  return 'vide';
}

/** Ce chauffeur peut-il recevoir une demande de ce type ? Même règle
 *  que le dispatch (`getIncomingRequests`) et que le garde-fou de
 *  proposition (POST /api/proposals) — une seule fonction, trois
 *  appelants, pour ne jamais les désaligner. */
export function canReceiveRide(
  rideType: RideType,
  args: {
    capacity: number | null;
    freeSeats: number | null | undefined;
    activeRideTypes: RideType[];
  }
): boolean {
  const free = normalizeFreeSeats(args.capacity, args.freeSeats);
  const hasActiveSolo = args.activeRideTypes.includes('solo');
  const hasActiveRide = args.activeRideTypes.length > 0;
  // Une course Solo en cours bloque TOUT (véhicule entier pris).
  if (hasActiveSolo) return false;
  // Plein : plus aucune demande.
  if (free <= 0) return false;
  // Solo : véhicule TOTALEMENT vide (aucune course en cours).
  if (rideType === 'solo') return !hasActiveRide;
  // Groupe : au moins 1 place libre (taxi partagé : un chauffeur déjà
  // en course Groupe avec des places restantes reçoit encore des Groupes).
  return free >= 1;
}

/** Disponibilité complète d'un chauffeur, lue en base (Supabase).
 *  Résilient si la migration v2.19 n'est pas encore appliquée : la
 *  colonne `free_seats` absente (erreur 42703) est traitée comme
 *  « jamais déclarées » — les places libres sont alors déduites des
 *  courses en cours (capacité − nombre de Groupes en cours, 0 si une
 *  Solo est en cours). Le statut reste donc correct avant comme après
 *  la migration. */
export interface DriverAvailability {
  driverId: string;
  capacity: number | null;
  freeSeats: number;
  activeRideTypes: RideType[];
  status: DriverStatus;
}

export async function getDriverAvailability(
  supabase: SupabaseClient,
  driverId: string
): Promise<DriverAvailability> {
  // Profil : capacité + places libres déclarées.
  let capacity: number | null = null;
  let freeSeats: number | null | undefined = undefined;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('seats, free_seats')
    .eq('id', driverId)
    .single();
  if (!profileError && profile) {
    capacity = (profile as { seats?: number | null }).seats ?? null;
    freeSeats = (profile as { free_seats?: number | null }).free_seats ?? undefined;
  } else if (profileError?.code === '42703') {
    // Colonne absente (migration v2.19 pas appliquée) : on retente
    // sans free_seats pour récupérer au moins la capacité.
    const retry = await supabase
      .from('profiles')
      .select('seats')
      .eq('id', driverId)
      .single();
    capacity = (retry.data as { seats?: number | null } | null)?.seats ?? null;
  }

  // Courses en cours du chauffeur (acceptée / en cours).
  const { data: active } = await supabase
    .from('rides')
    .select('ride_type')
    .eq('driver_id', driverId)
    .in('status', ['acceptee', 'en_cours']);
  const activeRideTypes = ((active ?? []) as { ride_type?: string }[])
    .map((r) => r.ride_type)
    .filter((t): t is RideType => t === 'solo' || t === 'groupe');

  // Avant la migration v2.19 (free_seats jamais déclarées) : on déduit
  // les places libres des courses en cours — une Solo en cours = 0,
  // sinon capacité − nombre de Groupes en cours.
  let effectiveFree = freeSeats;
  if (effectiveFree === undefined) {
    if (activeRideTypes.includes('solo')) effectiveFree = 0;
    else effectiveFree = Math.max(0, (capacity ?? 0) - activeRideTypes.length);
  }
  const free = normalizeFreeSeats(capacity, effectiveFree);
  return {
    driverId,
    capacity,
    freeSeats: free,
    activeRideTypes,
    status: deriveDriverStatus({ capacity, freeSeats: free, activeRideTypes }),
  };
}

/** Occupation d'une place à l'acceptation d'une proposition (v2.19).
 *  Groupe : − 1 place. Solo : → 0 place. Silencieux si la migration
 *  v2.19 n'est pas appliquée (colonne absente) : le statut est alors
 *  déduit des courses en cours (voir getDriverAvailability). */
export async function occupySeat(
  supabase: SupabaseClient,
  driverId: string,
  rideType: RideType
): Promise<void> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('seats, free_seats')
    .eq('id', driverId)
    .single();
  if (error || !profile) return; // Colonne absente ou profil introuvable : rien à faire.
  const row = profile as { seats?: number | null; free_seats?: number | null };
  const capacity = row.seats ?? 0;
  const free = normalizeFreeSeats(capacity, row.free_seats ?? undefined);
  const next = rideType === 'solo' ? 0 : Math.max(0, free - 1);
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ free_seats: next })
    .eq('id', driverId);
  if (updateError && updateError.code !== '42703') {
    console.error('[seats] occupySeat:', updateError.message);
  }
}

/** Libération d'une place à la fin / annulation d'une course acceptée.
 *  Groupe : + 1 place (plafonnée à la capacité). Solo : capacité
 *  entière. Silencieux si la migration v2.19 n'est pas appliquée. */
export async function releaseSeat(
  supabase: SupabaseClient,
  driverId: string,
  rideType: RideType
): Promise<void> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('seats, free_seats')
    .eq('id', driverId)
    .single();
  if (error || !profile) return;
  const row = profile as { seats?: number | null; free_seats?: number | null };
  const capacity = row.seats ?? 0;
  const free = normalizeFreeSeats(capacity, row.free_seats ?? undefined);
  const next = rideType === 'solo' ? capacity : Math.min(capacity, free + 1);
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ free_seats: next })
    .eq('id', driverId);
  if (updateError && updateError.code !== '42703') {
    console.error('[seats] releaseSeat:', updateError.message);
  }
}
