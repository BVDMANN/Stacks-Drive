import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  mapDriverProfile,
  mapProposalRow,
  mapRideRow,
  stripDriverPhone,
  type ProfileRow,
  type RideProposalRow,
  type RideRow,
} from '@/lib/db-types';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import { DISPATCH_WIDENED_RADIUS_KM, DRIVERS_AROUND_RADIUS_KM, haversineKm } from '@/lib/geo';
import { canReceiveRide, deriveDriverStatus, getDriverAvailability } from '@/lib/seats';
import { checkAndLogUnansweredRides } from '@/lib/no-driver-zones';
import { isComfortEligible } from '@/lib/comfort';
import { isFavoriteExclusive } from '@/lib/favorites';
import { isOnWayToReturn } from '@/lib/return-trips';
import {
  AIRPORT_NEIGHBORHOOD,
  AIRPORT_QUEUE_EXCLUSIVITY_SEC,
  getAirportQueueHead,
} from '@/lib/airport-queue';
import type { DriverProfile, DriverStatus, Ride, RideProposal } from '@/types';

const PROFILE_SELECT = `id, email, full_name, phone, role, vehicle_type, vehicle_brand,
  vehicle_model, vehicle_color, plate, seats, is_online, is_verified,
  is_admin, is_demo, verification_status, selfie_url, id_document_url,
  id_document_type, verification_note, current_area, last_lat, last_lng, created_at`;

const RIDE_SELECT = `*, passenger:profiles!rides_passenger_id_fkey (${PROFILE_SELECT}),
  driver:profiles!rides_driver_id_fkey (${PROFILE_SELECT})`;

/** Marque comme expirées les propositions dont le délai de 60 s est passé
 *  (fonction SECURITY DEFINER côté base, créée par migration-v2.sql).
 *  Silencieux si la migration n'est pas encore appliquée. */
export async function expireStaleProposals(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const supabase = await createClient();
    await supabase.rpc('expire_proposals');
  } catch {
    // Migration v2 pas encore appliquée : l'expiration est aussi gérée
    // côté client via expires_at.
  }
}

/** Note moyenne d'un passager (v2.30) — moyenne des notes données par
 *  les chauffeurs après ses courses terminées (`rides.rating_passenger`,
 *  1 à 5, posée par FeedbackForm / /api/feedback dans les deux sens
 *  depuis la v2.2). Null = aucune course notée : le chauffeur voit
 *  « Nouveau passager », jamais 0. Aucune donnée inventée. */
export async function getPassengerRating(
  passengerId: string
): Promise<{ average: number; count: number } | null> {
  const all = await getPassengerRatings([passengerId]);
  return all.get(passengerId) ?? null;
}

export async function getPassengerRatings(
  passengerIds: string[]
): Promise<Map<string, { average: number; count: number }>> {
  const out = new Map<string, { average: number; count: number }>();
  const ids = [...new Set(passengerIds.filter(Boolean))];
  if (!isSupabaseConfigured() || ids.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from('rides')
    .select('passenger_id, rating_passenger')
    .in('passenger_id', ids)
    .eq('status', 'terminee')
    .not('rating_passenger', 'is', null);
  const agg = new Map<string, { sum: number; count: number }>();
  (data ?? []).forEach((r: { passenger_id: string | null; rating_passenger: number | null }) => {
    if (!r.passenger_id || r.rating_passenger === null) return;
    const cur = agg.get(r.passenger_id) ?? { sum: 0, count: 0 };
    cur.sum += r.rating_passenger;
    cur.count += 1;
    agg.set(r.passenger_id, cur);
  });
  agg.forEach((a, id) => {
    out.set(id, { average: Math.round((a.sum / a.count) * 10) / 10, count: a.count });
  });
  return out;
}

/** Envoi des courses planifiées (v2.30) — déclenché par le sondage
 *  existant des demandes entrantes (chaque chauffeur en ligne sonde
 *  toutes les 10 s : c'est ce sondage qui fait office de déclencheur,
 *  sans nouveau cron ni service payant) et par la route cron dédiée
 *  `/api/cron/scheduled-dispatch` (filet de sécurité, à programmer
 *  seulement si le sondage ne suffit pas — voir SETUP.md).
 *
 *  - Une course `planifiee` dont l'heure prévue est dans moins de
 *    15 min passe en `recherche` (les chauffeurs proches la reçoivent
 *    au sondage suivant) et `dispatched_at` est posé.
 *  - Une course `planifiee` dont l'heure prévue est passée depuis
 *    plus de 30 min sans chauffeur passe en `expiree` : le passager
 *    la voit dans « Mes courses » avec une proposition de relancer.
 *  Idempotent (statut filtré avant mise à jour) et silencieux si la
 *  migration v2.30 n'est pas appliquée (colonne absente = abandon). */
export async function dispatchDueScheduledRides(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ dispatched: number; expired: number }> {
  const result = { dispatched: 0, expired: 0 };
  try {
    const now = new Date();
    const dispatchBefore = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const expireBefore = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const { data: due, error: dueError } = await supabase
      .from('rides')
      .select('id')
      .eq('status', 'planifiee')
      .not('scheduled_at', 'is', null)
      .lte('scheduled_at', dispatchBefore);
    if (dueError) return result; // migration v2.30 non appliquée
    const dueIds = ((due ?? []) as { id: string }[]).map((r) => r.id);
    if (dueIds.length === 0) return result;
    const { data: updated } = await supabase
      .from('rides')
      .update({ status: 'recherche', dispatched_at: now.toISOString() })
      .eq('status', 'planifiee')
      .in('id', dueIds)
      .select('id');
    result.dispatched = (updated ?? []).length;
    // Expirées : heure passée depuis plus de 30 min, jamais envoyées.
    const { data: expired } = await supabase
      .from('rides')
      .update({ status: 'expiree' })
      .eq('status', 'planifiee')
      .not('scheduled_at', 'is', null)
      .lt('scheduled_at', expireBefore)
      .select('id');
    result.expired = (expired ?? []).length;
  } catch {
    // Meilleur effort : le dispatch ne bloque jamais les demandes.
  }
  return result;
}

/** Chauffeurs réels en ligne et vérifiés, avec leur note moyenne.
 *  Sans Supabase configuré : liste vide (les chauffeurs démo, statiques,
 *  sont ajoutés côté client). */
export async function getOnlineDrivers(): Promise<DriverProfile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('role', 'chauffeur')
    .eq('is_online', true)
    .eq('is_verified', true)
    .eq('is_demo', false)
    // v2.45 — compte admin = admin uniquement : un admin n'apparaît
    // jamais dans les listes de chauffeurs (le filtre de rôle
    // l'exclurait déjà, l'admin étant « passager » en base — ce
    // filtre explicite verrouille le cas où le rôle venait à changer).
    .neq('is_admin', true);
  if (error || !data) {
    if (error) console.error('[stacks-drive] getOnlineDrivers:', error.message);
    return [];
  }
  const rows = data as ProfileRow[];
  const drivers = rows.map((r) => stripDriverPhone(mapDriverProfile(r))!);
  if (drivers.length === 0) return drivers;

  // Notes moyennes depuis les courses terminées.
  const ids = drivers.map((d) => d.id);
  const { data: rated } = await supabase
    .from('rides')
    .select('driver_id, rating_driver')
    .in('driver_id', ids)
    .eq('status', 'terminee')
    .not('rating_driver', 'is', null);
  const agg = new Map<string, { sum: number; count: number }>();
  (rated ?? []).forEach((r: { driver_id: string | null; rating_driver: number | null }) => {
    if (!r.driver_id || r.rating_driver === null) return;
    const cur = agg.get(r.driver_id) ?? { sum: 0, count: 0 };
    cur.sum += r.rating_driver;
    cur.count += 1;
    agg.set(r.driver_id, cur);
  });
  drivers.forEach((d) => {
    const a = agg.get(d.id);
    if (a && a.count > 0) {
      d.rating = Math.round((a.sum / a.count) * 10) / 10;
      d.trips = a.count;
    }
  });
  return drivers;
}

/** Une demande par son jeton public de partage (/suivi/[token]).
 *  Lecture publique, sans compte : le proche voit le trajet, le chauffeur
 *  et le statut en direct. Passe par la fonction SECURITY DEFINER
 *  `get_public_ride` (la RLS bloque la lecture anonyme directe). */
export async function getRideByShareToken(
  token: string
): Promise<{ ride: Ride; driver: DriverProfile | null } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_public_ride', { p_token: token });
  if (error || !data) {
    if (error) console.error('[stacks-drive] getRideByShareToken:', error.message);
    return null;
  }
  const payload = data as { ride: RideRow | null; driver: ProfileRow | null };
  if (!payload.ride) return null;
  return {
    ride: mapRideRow(payload.ride),
    // v2.20 : le lien de suivi est public — jamais de téléphone, même
    // si la fonction SQL venait à en renvoyer un jour.
    driver: payload.driver ? stripDriverPhone(mapDriverProfile(payload.driver)) : null,
  };
}

/** Une demande de course par son id, avec passager et chauffeur éventuels.
 *  Visible par son passager, son chauffeur, ou un admin. */
export async function getRideRequestById(
  id: string,
  viewerId?: string | null
): Promise<{ ride: Ride; row: RideRow } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select(RIDE_SELECT)
    .eq('id', id)
    .single();
  if (error || !data) return null;
  const row = data as RideRow;
  const isOwner = row.passenger_id === viewerId;
  const isDriver = row.driver_id === viewerId;
  const { data: viewer } = viewerId
    ? await supabase.from('profiles').select('is_admin').eq('id', viewerId).single()
    : { data: null };
  if (!isOwner && !isDriver && !viewer?.is_admin) return null;
  return { ride: mapRideRow(row), row };
}

/** Historique du passager (v2.10) : courses terminées ou annulées, avec
 *  le nom du chauffeur. Le passager ne voit QUE ses propres courses.
 *  Ni code PIN, ni position, ni messages dans l'historique. */
export async function getPassengerRideHistory(
  userId: string,
  limit = 20
): Promise<{ ride: Ride; driverName: string | null }[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('passenger_id', userId)
    .in('status', ['terminee', 'annulee'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[stacks-drive] getPassengerRideHistory:', error.message);
    return [];
  }
  const rows = (data ?? []) as RideRow[];
  const driverIds = [...new Set(rows.map((r) => r.driver_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (driverIds.length > 0) {
    const { data: drivers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', driverIds);
    (drivers ?? []).forEach((d: { id: string; full_name: string | null }) =>
      names.set(d.id, d.full_name ?? 'Chauffeur')
    );
  }
  return rows.map((row) => ({
    ride: mapRideRow(row),
    driverName: row.driver_id ? names.get(row.driver_id) ?? null : null,
  }));
}

/** Historique du chauffeur (v2.10) : courses terminées ou annulées, avec
 *  le nom du passager et les gains de la course (driver_earnings quand
 *  disponible, sinon les montants figés dans la course : commission et
 *  part gardée). Le chauffeur ne voit QUE ses propres courses. */
export async function getDriverRideHistory(
  userId: string,
  limit = 30
): Promise<{
  ride: Ride;
  passengerName: string | null;
  earning: { fare: number; commission: number; kept: number } | null;
}[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', userId)
    .in('status', ['terminee', 'annulee'])
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('[stacks-drive] getDriverRideHistory:', error.message);
    return [];
  }
  const rows = (data ?? []) as RideRow[];
  const passengerIds = [...new Set(rows.map((r) => r.passenger_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (passengerIds.length > 0) {
    const { data: passengers } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', passengerIds);
    (passengers ?? []).forEach((p: { id: string; full_name: string | null }) =>
      names.set(p.id, p.full_name ?? 'Passager')
    );
  }
  // Gains par course (table driver_earnings, 1 ligne par course terminée).
  // Si la table n'existe pas encore (migration v2.2 non appliquée), on
  // se replie sur les montants figés dans la course.
  const earnings = new Map<string, { fare: number; commission: number; kept: number }>();
  const rideIds = rows.map((r) => r.id);
  if (rideIds.length > 0) {
    const { data: earn, error: earnError } = await supabase
      .from('driver_earnings')
      .select('ride_id, fare_amount, commission_amount, driver_kept_amount')
      .in('ride_id', rideIds);
    if (!earnError && earn) {
      (earn as { ride_id: string; fare_amount: number; commission_amount: number; driver_kept_amount: number }[]).forEach(
        (e) =>
          earnings.set(e.ride_id, {
            fare: e.fare_amount,
            commission: e.commission_amount,
            kept: e.driver_kept_amount,
          })
      );
    }
  }
  return rows.map((row) => {
    const ride = mapRideRow(row);
    return {
      ride,
      passengerName: row.passenger_id ? names.get(row.passenger_id) ?? null : null,
      earning:
        earnings.get(row.id) ?? {
          fare: ride.proposedPrice ?? ride.estimatedPrice,
          commission: ride.platformFee,
          kept: ride.driverShare,
        },
    };
  });
}

/** Demandes du passager connecté (actives puis historique). */
export async function getMyRideRequests(userId: string): Promise<Ride[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('passenger_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[stacks-drive] getMyRideRequests:', error.message);
    return [];
  }
  return ((data ?? []) as RideRow[]).map(mapRideRow);
}

/** Courses du chauffeur connecté (assignées, historique). */
export async function getDriverRides(userId: string): Promise<Ride[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[stacks-drive] getDriverRides:', error.message);
    return [];
  }
  return ((data ?? []) as RideRow[]).map(mapRideRow);
}

/** Note moyenne d'un chauffeur (v2.34 — classe Confort) : moyenne
 *  des notes `rating_driver` de ses courses terminées. Null = aucune
 *  course notée. */
export async function getDriverRating(
  driverId: string
): Promise<{ average: number; count: number } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('rides')
    .select('rating_driver')
    .eq('driver_id', driverId)
    .eq('status', 'terminee')
    .not('rating_driver', 'is', null);
  const ratings = ((data ?? []) as { rating_driver: number | null }[])
    .map((r) => r.rating_driver)
    .filter((v): v is number => v !== null);
  if (ratings.length === 0) return null;
  const sum = ratings.reduce((a, b) => a + b, 0);
  return { average: Math.round((sum / ratings.length) * 10) / 10, count: ratings.length };
}

/** Demandes entrantes pour un chauffeur en ligne : statut recherche ou
 *  propositions, créées il y a moins de 15 minutes, à proximité.
 *  Premier rayon = le périmètre « chauffeurs autour de toi »
 *  (DRIVERS_AROUND_RADIUS_KM, même valeur que la vue passager) les
 *  30 premières secondes, puis élargi à DISPATCH_WIDENED_RADIUS_KM
 *  (« on élargit la recherche »).
 *  Filtre places / statut (v2.19), EN PLUS du rayon — jamais à la
 *  place : Groupe → au moins 1 place libre (y compris en course
 *  Groupe avec des places restantes) ; Solo → véhicule totalement
 *  vide (aucune course en cours) ; Plein (0 place libre) ou Solo en
 *  cours → plus aucune demande.
 *  Filtres v2.34 (EN PLUS, jamais à la place des précédents) :
 *  favori (exclusivité 30 s pour le chauffeur choisi), Confort
 *  (clim + note ≥ 4,5 vérifiées côté serveur), retour (le chauffeur
 *  ne reçoit que les demandes sur son chemin de retour), file
 *  aéroport (la demande aéroport part d'abord au premier de la file).
 *  Pourquoi 15 minutes : une demande plus vieille est abandonnée (le
 *  passager a renoncé ou recommencé) — la garder visible ferait
 *  proposer des chauffeurs sur des courses mortes. Pourquoi 30 s
 *  avant d'élargir : laisser d'abord la chance aux chauffeurs proches
 *  (ETA courte), puis seulement chercher plus loin. */
export async function getIncomingRequests(driver: {
  id: string;
  currentArea: Neighborhood | null;
  lat: number | null;
  lng: number | null;
}): Promise<Ride[]> {
  if (!isSupabaseConfigured()) return [];
  await expireStaleProposals();
  // Courses planifiées (v2.30) : le sondage des demandes entrantes
  // fait office de déclencheur d'envoi (~15 min avant l'heure prévue)
  // et d'expiration — sans nouveau cron, en meilleur effort.
  const supabase = await createClient();
  await dispatchDueScheduledRides(supabase).catch(() => undefined);
  // Zones sans chauffeur (v2.27) : chaque sondage des demandes
  // entrantes (re)vérifie les demandes sans proposition depuis plus
  // de 2 min et les journalise (une seule alerte par demande) — sans
  // nouveau cron, en meilleur effort (jamais bloquant).
  await checkAndLogUnansweredRides(supabase).catch(() => undefined);
  // Disponibilité du chauffeur (places libres + courses en cours) :
  // c'est elle qui décide quelles demandes il peut recevoir.
  const availability = await getDriverAvailability(supabase, driver.id);
  // Préférences v2.34 du chauffeur (Confort / retour) + file aéroport :
  // lues en une fois, résilientes si la migration v2.34 n'est pas
  // encore appliquée (colonnes absentes = filtres désactivés).
  let driverPrefs: {
    has_air_conditioning: boolean | null;
    return_destination: string | null;
    return_filter_enabled: boolean | null;
  } = { has_air_conditioning: null, return_destination: null, return_filter_enabled: null };
  try {
    const { data: prefRow } = await supabase
      .from('profiles')
      .select('has_air_conditioning, return_destination, return_filter_enabled')
      .eq('id', driver.id)
      .single();
    if (prefRow) driverPrefs = prefRow as typeof driverPrefs;
  } catch {
    /* migration v2.34 non appliquée : filtres désactivés */
  }
  const driverRating = await getDriverRating(driver.id).catch(() => null);
  const airportHead = await getAirportQueueHead(supabase).catch(() => null);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .in('status', ['recherche', 'propositions'])
    .gt('created_at', since)
    .neq('passenger_id', driver.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[stacks-drive] getIncomingRequests:', error.message);
    return [];
  }
  const rows = (data ?? []) as RideRow[];
  const now = Date.now();
  return rows
    .filter((row) => {
      // Filtre places / statut (v2.19) : une demande Groupe ne part
      // que vers un chauffeur avec au moins 1 place libre, une Solo
      // que vers un chauffeur totalement vide, un chauffeur Plein
      // (ou en Solo) ne reçoit rien.
      if (
        !canReceiveRide(row.ride_type, {
          capacity: availability.capacity,
          freeSeats: availability.freeSeats,
          activeRideTypes: availability.activeRideTypes,
        })
      ) {
        return false;
      }
      // v2.34 — Chauffeur favori : pendant l'exclusivité (30 s), la
      // demande n'est visible que par le chauffeur choisi.
      if (
        row.preferred_driver_id &&
        isFavoriteExclusive(row.preferred_until ?? null) &&
        row.preferred_driver_id !== driver.id
      ) {
        return false;
      }
      // v2.34 — Classe Confort : clim garantie + note ≥ 4,5, vérifiées
      // côté serveur. Un chauffeur non éligible ne voit pas la demande.
      if (
        row.comfort &&
        !isComfortEligible({
          hasAirConditioning: driverPrefs.has_air_conditioning,
          averageRating: driverRating?.average ?? null,
        })
      ) {
        return false;
      }
      // v2.34 — Filtre destination de retour : le chauffeur ne reçoit
      // que les demandes qui vont dans sa direction de retour.
      if (
        driverPrefs.return_filter_enabled &&
        driverPrefs.return_destination &&
        row.pickup &&
        row.destination
      ) {
        const driverPos =
          driver.lat !== null && driver.lng !== null
            ? { lat: driver.lat, lng: driver.lng }
            : driver.currentArea
              ? NEIGHBORHOOD_COORDS[driver.currentArea]
              : null;
        if (
          driverPos &&
          !isOnWayToReturn({
            driverLat: driverPos.lat,
            driverLng: driverPos.lng,
            returnDestination: driverPrefs.return_destination as Neighborhood,
            ridePickup: row.pickup as Neighborhood,
            rideDestination: row.destination as Neighborhood,
          })
        ) {
          return false;
        }
      }
      const ageSec = (now - new Date(row.created_at).getTime()) / 1000;
      // v2.34 — File aéroport : pendant les 60 premières secondes,
      // une demande au départ de l'aéroport part d'abord au premier
      // de la file ; ensuite, dispatch normal pour tout le monde.
      if (
        row.pickup === AIRPORT_NEIGHBORHOOD &&
        airportHead &&
        airportHead.driverId !== driver.id &&
        ageSec <= AIRPORT_QUEUE_EXCLUSIVITY_SEC
      ) {
        return false;
      }
      const coords = NEIGHBORHOOD_COORDS[row.pickup as Neighborhood];
      if (!coords) return ageSec > 30; // quartier inconnu : seulement après élargissement
      if (driver.lat !== null && driver.lng !== null) {
        const dist = haversineKm(driver.lat, driver.lng, coords.lat, coords.lng);
        return dist <= (ageSec <= 30 ? DRIVERS_AROUND_RADIUS_KM : DISPATCH_WIDENED_RADIUS_KM);
      }
      // Pas de position GPS : même quartier d'abord, puis tout Libreville.
      if (ageSec <= 30) return driver.currentArea === row.pickup;
      return true;
    })
    .map(mapRideRow);
}

/** Propositions reçues pour une demande (côté passager), chauffeur joint. */
export async function getProposalsForRide(rideId: string): Promise<RideProposal[]> {
  if (!isSupabaseConfigured()) return [];
  await expireStaleProposals();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ride_proposals')
    .select(`*, driver:profiles!ride_proposals_driver_id_fkey (${PROFILE_SELECT})`)
    .eq('ride_id', rideId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[stacks-drive] getProposalsForRide:', error.message);
    return [];
  }
  return ((data ?? []) as RideProposalRow[]).map((row) => {
    const proposal = mapProposalRow(row);
    // v2.20 : une proposition révèle l'identité du chauffeur (prénom,
    // véhicule, plaque, note) — jamais son téléphone.
    if (proposal.driver) proposal.driver = stripDriverPhone(proposal.driver);
    return proposal;
  });
}

/** Propositions envoyées par le chauffeur connecté. */
export async function getMyProposals(driverId: string): Promise<RideProposal[]> {
  if (!isSupabaseConfigured()) return [];
  await expireStaleProposals();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ride_proposals')
    .select(`*, ride:rides!ride_proposals_ride_id_fkey (pickup, destination, ride_type, status)`)
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.error('[stacks-drive] getMyProposals:', error.message);
    return [];
  }
  return ((data ?? []) as RideProposalRow[]).map(mapProposalRow);
}

/** Chauffeurs en attente de vérification (admin). */
export async function getPendingVerifications(): Promise<ProfileRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('role', 'chauffeur')
    .eq('verification_status', 'en_attente')
    // v2.45 — un admin n'est jamais un chauffeur en attente.
    .neq('is_admin', true)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[stacks-drive] getPendingVerifications:', error.message);
    return [];
  }
  return (data ?? []) as ProfileRow[];
}

/** Statistiques globales (tableau de bord admin). */
export async function getAdminStats(): Promise<{
  ridesCount: number;
  proposalsCount: number;
  driversCount: number;
  pendingVerifications: number;
  totalVolume: number;
  totalCommission: number;
  totalDriverShare: number;
  drivers: ProfileRow[];
  recentRides: RideRow[];
}> {
  const empty = {
    ridesCount: 0,
    proposalsCount: 0,
    driversCount: 0,
    pendingVerifications: 0,
    totalVolume: 0,
    totalCommission: 0,
    totalDriverShare: 0,
    drivers: [] as ProfileRow[],
    recentRides: [] as RideRow[],
  };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();

  const [
    { count: ridesCount },
    { count: proposalsCount },
    { data: drivers },
    { count: pendingVerifications },
  ] = await Promise.all([
    supabase.from('rides').select('id', { count: 'exact', head: true }),
    supabase.from('ride_proposals').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('role', 'chauffeur')
      // v2.45 — compte admin = admin uniquement : l'admin n'est
      // jamais compté comme chauffeur dans /admin.
      .neq('is_admin', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'en_attente')
      // v2.45 — un admin n'est jamais une vérification en attente.
      .neq('is_admin', true),
  ]);

  const { data: money } = await supabase
    .from('rides')
    .select('proposed_price, platform_fee, driver_share')
    .in('status', ['acceptee', 'en_cours', 'terminee']);
  const totals = (money ?? []).reduce(
    (acc, r) => ({
      volume: acc.volume + (r.proposed_price ?? 0),
      commission: acc.commission + (r.platform_fee ?? 0),
      driverShare: acc.driverShare + (r.driver_share ?? 0),
    }),
    { volume: 0, commission: 0, driverShare: 0 }
  );

  const { data: recentRides } = await supabase
    .from('rides')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  // Places libres + statut par chauffeur (v2.19) : l'admin voit qui
  // est Vide / En course / Plein et combien de places chacun propose.
  // Résilient si la migration v2.19 n'est pas appliquée (colonne
  // absente → places déduites des courses en cours).
  const driverRows = (drivers ?? []) as ProfileRow[];
  if (driverRows.length > 0) {
    let freeById = new Map<string, number | null>();
    const { data: seatsRows, error: seatsError } = await supabase
      .from('profiles')
      .select('id, seats, free_seats')
      .eq('role', 'chauffeur')
      // v2.45 — un admin n'a pas de places libres.
      .neq('is_admin', true);
    if (!seatsError && seatsRows) {
      (seatsRows as { id: string; seats: number | null; free_seats: number | null }[]).forEach(
        (r) => freeById.set(r.id, r.free_seats ?? r.seats ?? null)
      );
    }
    const driverIds = driverRows.map((d) => d.id);
    const { data: activeRides } = await supabase
      .from('rides')
      .select('driver_id, ride_type')
      .in('driver_id', driverIds)
      .in('status', ['acceptee', 'en_cours']);
    const activeById = new Map<string, ('solo' | 'groupe')[]>();
    ((activeRides ?? []) as { driver_id: string | null; ride_type: string }[]).forEach((r) => {
      if (!r.driver_id || (r.ride_type !== 'solo' && r.ride_type !== 'groupe')) return;
      const list = activeById.get(r.driver_id) ?? [];
      list.push(r.ride_type);
      activeById.set(r.driver_id, list);
    });
    driverRows.forEach((d) => {
      const active = activeById.get(d.id) ?? [];
      // Avant la migration v2.19 : places déduites des courses en cours.
      let free = freeById.get(d.id);
      if (free === undefined) {
        free = active.includes('solo') ? 0 : Math.max(0, (d.seats ?? 0) - active.length);
      }
      d.free_seats = free;
      d.driver_status = deriveDriverStatus({
        capacity: d.seats ?? null,
        freeSeats: free,
        activeRideTypes: active,
      });
    });
  }

  return {
    ridesCount: ridesCount ?? 0,
    proposalsCount: proposalsCount ?? 0,
    driversCount: (drivers ?? []).length,
    pendingVerifications: pendingVerifications ?? 0,
    totalVolume: totals.volume,
    totalCommission: totals.commission,
    totalDriverShare: totals.driverShare,
    drivers: (drivers ?? []) as ProfileRow[],
    recentRides: (recentRides ?? []) as RideRow[],
  };
}
