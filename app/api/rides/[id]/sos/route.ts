import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';
import { formatFcfa } from '@/lib/commission';

type Ctx = { params: Promise<{ id: string }> };

const SosSchema = z.object({
  /** Position GPS au moment de l'appel (navigateur du passager /
   *  du chauffeur — jamais inventée côté serveur). */
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().int().min(0).max(100000).optional(),
});

/** POST /api/rides/[id]/sos — SOS enrichi (v2.23, plancher P0a).
 *  Le bouton SOS appelle le 112 (tel:112, côté client) ; AU MÊME
 *  MOMENT, l'appli enregistre l'alerte avec la position GPS et les
 *  infos de la course (véhicule, plaque, chauffeur, passager, prix,
 *  lien de suivi) et prévient l'autre partie de la course par un
 *  message système dans la messagerie (visible en ~3 s). L'alerte
 *  est aussi tracée dans le journal d'audit (admin). Le 112 n'est
 *  jamais appelé par le serveur : c'est l'utilisateur qui appelle,
 *  avec les infos déjà copiées / affichées pour le dispatcher. */
export async function POST(request: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = SosSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Position invalide.' }, { status: 400 });
  }

  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, pickup, destination, proposed_price, estimated_price, loyalty_free, share_token, status')
    .eq('id', id)
    .single();
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  const isPassenger = ride.passenger_id === user.id;
  const isDriver = ride.driver_id === user.id;
  if (!isPassenger && !isDriver) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }

  const [{ data: passenger }, { data: driver }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', ride.passenger_id).single(),
    ride.driver_id
      ? supabase
          .from('profiles')
          .select('full_name, vehicle_brand, vehicle_model, vehicle_color, plate')
          .eq('id', ride.driver_id)
          .single()
        : Promise.resolve({ data: null }),
  ]);
  const driverName = (driver as { full_name?: string | null } | null)?.full_name ?? null;
  const vehicle = [driver?.vehicle_brand, driver?.vehicle_model, driver?.vehicle_color]
    .filter(Boolean)
    .join(' ');
  const plate = (driver as { plate?: string | null } | null)?.plate ?? null;
  const priceLabel = ride.loyalty_free
    ? '0 FCFA — offerte'
    : formatFcfa((ride.proposed_price as number | null) ?? (ride.estimated_price as number));
  const { lat, lng, accuracy } = parsed.data;
  const mapsUrl =
    lat !== undefined && lng !== undefined
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  const role = isPassenger ? 'passager' : 'chauffeur';
  await logAudit(supabase, 'sos_triggered', {
    actorId: user.id,
    rideId: id,
    triggeredBy: role,
    lat: lat ?? null,
    lng: lng ?? null,
    accuracyM: accuracy ?? null,
    driverName,
    plate,
    price: priceLabel,
  });

  // Alerte immédiate à l'autre partie (messagerie de course, si
  // elle est ouverte) : l'autre partie voit l'alerte en ~3 s.
  if (ride.driver_id && ['acceptee', 'en_cours'].includes(ride.status as string)) {
    try {
      await supabase.from('ride_messages').insert({
        ride_id: id,
        sender_id: user.id,
        sender_role: role,
        body:
          `[SOS] Déclenché par ${role === 'passager' ? 'le passager' : 'le chauffeur'} — ${ride.pickup} → ${ride.destination}` +
          (mapsUrl ? ` — Position : ${mapsUrl}` : ' — Position non partagée') +
          ` — Chauffeur : ${driverName ?? '—'}${plate ? ` (plaque ${plate})` : ''} — Prix : ${priceLabel}.`,
      });
    } catch {
      // Messagerie absente : l'audit garde la trace.
    }
  }

  return NextResponse.json({
    ok: true,
    sos: {
      lat: lat ?? null,
      lng: lng ?? null,
      accuracyM: accuracy ?? null,
      mapsUrl,
      pickup: ride.pickup,
      destination: ride.destination,
      driverName,
      vehicle,
      plate,
      passengerName: (passenger as { full_name?: string | null } | null)?.full_name ?? null,
      priceLabel,
      shareUrl: ride.share_token ? `/suivi/${ride.share_token}` : `/courses/${id}`,
    },
  });
}
