import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  mapBookingRow,
  mapDriver,
  mapRideRow,
  type BookingRow,
  type ProfileRow,
  type RideRow,
} from '@/lib/db-types';
import type { Booking, DriverProfile, Ride } from '@/types';

const RIDE_SELECT = `*, profiles!rides_driver_id_fkey (
  id, email, full_name, phone, role, vehicle_type, vehicle_brand,
  vehicle_model, vehicle_color, plate, seats, is_online, is_verified,
  is_admin, is_demo, created_at
)`;

/** Courses publiées à venir, triées par heure de départ. Sans Supabase
 *  configuré : liste vide. */
export async function getPublishedRides(): Promise<{
  rides: Ride[];
  drivers: Record<string, DriverProfile>;
}> {
  if (!isSupabaseConfigured()) {
    console.warn('[stacks-drive] Supabase non configuré — aucune course à afficher.');
    return { rides: [], drivers: {} };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select(RIDE_SELECT)
    .eq('status', 'published')
    .gt('departure_time', new Date().toISOString())
    .order('departure_time', { ascending: true });
  if (error) {
    console.error('[stacks-drive] getPublishedRides:', error.message);
    return { rides: [], drivers: {} };
  }
  const rows = (data ?? []) as RideRow[];
  const rides = rows.map(mapRideRow);
  const drivers: Record<string, DriverProfile> = {};
  rows.forEach((row) => {
    drivers[mapRideRow(row).driverId ?? `demo-${row.id}`] = mapDriver(row);
  });
  return { rides, drivers };
}

/** Une course par son id, avec son chauffeur. Null si absente ou non publiée
 *  (sauf si le lecteur en est le chauffeur). */
export async function getRideById(
  id: string,
  viewerId?: string | null
): Promise<{ ride: Ride; driver: DriverProfile; row: RideRow } | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select(RIDE_SELECT)
    .eq('id', id)
    .single();
  if (error || !data) return null;
  const row = data as RideRow;
  if (row.status !== 'published' && row.driver_id !== viewerId) return null;
  return { ride: mapRideRow(row), driver: mapDriver(row), row };
}

/** Courses du chauffeur connecté. */
export async function getMyRides(userId: string): Promise<RideRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('driver_id', userId)
    .order('departure_time', { ascending: true });
  if (error) {
    console.error('[stacks-drive] getMyRides:', error.message);
    return [];
  }
  return (data ?? []) as RideRow[];
}

/** Réservations du chauffeur connecté (toutes ses courses), avec la course jointe. */
export async function getBookingsForDriver(
  userId: string
): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `*, rides!bookings_ride_id_fkey (
        id, departure, destination, departure_time, price, ride_type,
        vehicle_type, vehicle_label, status, driver_id, driver_name
      ), profiles!bookings_passenger_id_fkey (
        id, email, full_name, phone, role, vehicle_type, vehicle_brand,
        vehicle_model, vehicle_color, plate, seats, is_online, is_verified,
        is_admin, is_demo, created_at
      )`
    )
    .eq('rides.driver_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[stacks-drive] getBookingsForDriver:', error.message);
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Réservations du passager connecté, avec la course jointe. */
export async function getMyBookings(
  userId: string
): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select(
      `*, rides!bookings_ride_id_fkey (
        id, departure, destination, departure_time, price, ride_type,
        vehicle_type, vehicle_label, status, driver_id, driver_name
      )`
    )
    .eq('passenger_id', userId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[stacks-drive] getMyBookings:', error.message);
    return [];
  }
  return (data ?? []) as BookingRow[];
}

/** Le passager a-t-il déjà réservé cette course ? */
export async function hasBooked(
  userId: string,
  rideId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('bookings')
    .select('id')
    .eq('passenger_id', userId)
    .eq('ride_id', rideId)
    .neq('status', 'cancelled')
    .maybeSingle();
  return !!data;
}

/** Statistiques globales (tableau de bord admin — lecture directe, RLS admin). */
export async function getAdminStats(): Promise<{
  ridesCount: number;
  bookingsCount: number;
  driversCount: number;
  totalVolume: number;
  totalCommission: number;
  totalDriverShare: number;
  drivers: ProfileRow[];
  recentRides: RideRow[];
  recentBookings: BookingRow[];
}> {
  const empty = {
    ridesCount: 0,
    bookingsCount: 0,
    driversCount: 0,
    totalVolume: 0,
    totalCommission: 0,
    totalDriverShare: 0,
    drivers: [] as ProfileRow[],
    recentRides: [] as RideRow[],
    recentBookings: [] as BookingRow[],
  };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();

  const [{ count: ridesCount }, { count: bookingsCount }, { data: drivers }] =
    await Promise.all([
      supabase.from('rides').select('id', { count: 'exact', head: true }),
      supabase.from('bookings').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('*')
        .eq('role', 'chauffeur')
        .order('created_at', { ascending: false }),
    ]);

  const { data: money } = await supabase
    .from('bookings')
    .select('total_price, platform_fee, driver_share')
    .in('status', ['confirmed', 'completed']);
  const totals = (money ?? []).reduce(
    (acc, b) => ({
      volume: acc.volume + (b.total_price ?? 0),
      commission: acc.commission + (b.platform_fee ?? 0),
      driverShare: acc.driverShare + (b.driver_share ?? 0),
    }),
    { volume: 0, commission: 0, driverShare: 0 }
  );

  const { data: recentRides } = await supabase
    .from('rides')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);
  const { data: recentBookings } = await supabase
    .from('bookings')
    .select(
      `*, rides!bookings_ride_id_fkey (
        id, departure, destination, departure_time, price, ride_type,
        vehicle_type, vehicle_label, status, driver_id, driver_name
      ), profiles!bookings_passenger_id_fkey (
        id, email, full_name, phone, role, vehicle_type, vehicle_brand,
        vehicle_model, vehicle_color, plate, seats, is_online, is_verified,
        is_admin, is_demo, created_at
      )`
    )
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    ridesCount: ridesCount ?? 0,
    bookingsCount: bookingsCount ?? 0,
    driversCount: (drivers ?? []).length,
    totalVolume: totals.volume,
    totalCommission: totals.commission,
    totalDriverShare: totals.driverShare,
    drivers: (drivers ?? []) as ProfileRow[],
    recentRides: (recentRides ?? []) as RideRow[],
    recentBookings: (recentBookings ?? []) as BookingRow[],
  };
}

export { mapBookingRow };
export type { Booking };
