import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { PAYMENT_METHODS, VEHICLE_TYPES } from '@/lib/neighborhoods';

const RideSchema = z.object({
  departure: z.string().trim().min(2, 'Point de départ requis.').max(80),
  destination: z.string().trim().min(2, 'Destination requise.').max(80),
  departureTime: z.string().datetime('Date et heure invalides.'),
  seatsTotal: z.number().int().min(1, 'Au moins 1 place.').max(9),
  price: z.number().int().min(100, 'Prix minimum : 100 FCFA.').max(100000),
  rideType: z.enum(['solo', 'partagee']),
  vehicleType: z.enum(VEHICLE_TYPES),
  vehicleLabel: z.string().trim().max(120).default(''),
  paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1, 'Choisis au moins un moyen de paiement.').max(3),
  note: z.string().trim().max(1000).default(''),
}).refine((v) => v.departure.toLowerCase() !== v.destination.toLowerCase(), {
  message: 'Le départ et la destination doivent être différents.',
}).refine((v) => (v.rideType === 'solo' ? v.seatsTotal === 1 : true), {
  message: 'Une course solo ne propose qu’une seule place.',
});

async function requireDriver() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Connecte-toi pour publier une course.', status: 401 as const };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, phone, email, vehicle_type, vehicle_brand, vehicle_model, vehicle_color')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return { error: 'Seuls les chauffeurs peuvent publier des courses.', status: 403 as const };
  }
  return { supabase, user, profile };
}

/** POST /api/rides — publier une course (chauffeur connecté). */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase n’est pas configuré sur ce déploiement.' },
      { status: 503 }
    );
  }
  const auth = await requireDriver();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user, profile } = auth;

  const body = await request.json().catch(() => null);
  const parsed = RideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  if (new Date(v.departureTime).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'La date de départ doit être dans le futur.' },
      { status: 400 }
    );
  }

  const vehicleLabel =
    v.vehicleLabel ||
    [profile.vehicle_brand, profile.vehicle_model, profile.vehicle_color]
      .filter(Boolean)
      .join(' ');

  const { data: ride, error } = await supabase
    .from('rides')
    .insert({
      driver_id: user.id,
      departure: v.departure,
      destination: v.destination,
      departure_time: v.departureTime,
      seats_total: v.seatsTotal,
      seats_available: v.seatsTotal,
      price: v.price,
      ride_type: v.rideType,
      vehicle_type: v.vehicleType,
      vehicle_label: vehicleLabel,
      payment_methods: v.paymentMethods,
      note: v.note,
      status: 'published',
      driver_name: profile.full_name || 'Chauffeur Stacks Drive',
      driver_phone: profile.phone,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/rides]', error.message);
    return NextResponse.json(
      { error: 'Publication impossible pour le moment. Réessaie.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, rideId: ride.id }, { status: 201 });
}
