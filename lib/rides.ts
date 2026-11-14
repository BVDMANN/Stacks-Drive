import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  mapDriverProfile,
  mapProposalRow,
  mapRideRow,
  type ProfileRow,
  type RideProposalRow,
  type RideRow,
} from '@/lib/db-types';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import { haversineKm } from '@/lib/geo';
import type { DriverProfile, Ride, RideProposal } from '@/types';

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
    .eq('is_demo', false);
  if (error || !data) {
    if (error) console.error('[stacks-drive] getOnlineDrivers:', error.message);
    return [];
  }
  const rows = data as ProfileRow[];
  const drivers = rows.map(mapDriverProfile);
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
    driver: payload.driver ? mapDriverProfile(payload.driver) : null,
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

/** Demandes entrantes pour un chauffeur en ligne : statut recherche ou
 *  propositions, créées il y a moins de 15 minutes, à proximité.
 *  Rayon de 10 km les 30 premières secondes, puis élargi à 25 km
 *  (« on élargit la recherche »). */
export async function getIncomingRequests(driver: {
  id: string;
  currentArea: Neighborhood | null;
  lat: number | null;
  lng: number | null;
}): Promise<Ride[]> {
  if (!isSupabaseConfigured()) return [];
  await expireStaleProposals();
  const supabase = await createClient();
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
      const ageSec = (now - new Date(row.created_at).getTime()) / 1000;
      const coords = NEIGHBORHOOD_COORDS[row.pickup as Neighborhood];
      if (!coords) return ageSec > 30; // quartier inconnu : seulement après élargissement
      if (driver.lat !== null && driver.lng !== null) {
        const dist = haversineKm(driver.lat, driver.lng, coords.lat, coords.lng);
        return dist <= (ageSec <= 30 ? 10 : 25);
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
  return ((data ?? []) as RideProposalRow[]).map(mapProposalRow);
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
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'en_attente'),
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
