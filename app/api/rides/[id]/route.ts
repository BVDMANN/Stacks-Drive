import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { PAYMENT_METHODS, VEHICLE_TYPES } from '@/lib/neighborhoods';

const UpdateSchema = z
  .object({
    departure: z.string().trim().min(2).max(80).optional(),
    destination: z.string().trim().min(2).max(80).optional(),
    departureTime: z.string().datetime().optional(),
    seatsTotal: z.number().int().min(1).max(9).optional(),
    price: z.number().int().min(100).max(100000).optional(),
    rideType: z.enum(['solo', 'partagee']).optional(),
    vehicleType: z.enum(VEHICLE_TYPES).optional(),
    vehicleLabel: z.string().trim().max(120).optional(),
    paymentMethods: z.array(z.enum(PAYMENT_METHODS)).min(1).max(3).optional(),
    note: z.string().trim().max(1000).optional(),
    status: z.enum(['published', 'draft', 'closed']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification.' });

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/rides/[id] — modifier / fermer / republier une course (son chauffeur). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase n’est pas configuré sur ce déploiement.' },
      { status: 503 }
    );
  }
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }

  const { data: ride } = await supabase
    .from('rides')
    .select('id, driver_id, seats_total, seats_available, ride_type')
    .eq('id', id)
    .single();
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  if (ride.driver_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  // Changer le nombre de places alors que des réservations existent :
  // refusé (les places déjà vendues ne peuvent pas disparaître).
  if (v.seatsTotal !== undefined && v.seatsTotal !== ride.seats_total) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('ride_id', id)
      .neq('status', 'cancelled');
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Des réservations existent déjà : le nombre de places ne peut plus changer.' },
        { status: 400 }
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (v.departure !== undefined) patch.departure = v.departure;
  if (v.destination !== undefined) patch.destination = v.destination;
  if (v.departureTime !== undefined) {
    if (new Date(v.departureTime).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'La date de départ doit être dans le futur.' },
        { status: 400 }
      );
    }
    patch.departure_time = v.departureTime;
  }
  if (v.seatsTotal !== undefined) {
    patch.seats_total = v.seatsTotal;
    patch.seats_available = v.seatsTotal;
  }
  if (v.price !== undefined) patch.price = v.price;
  if (v.rideType !== undefined) {
    if (v.rideType === 'solo') {
      const seatsTotal = v.seatsTotal ?? ride.seats_total;
      if (seatsTotal !== 1) {
        return NextResponse.json(
          { error: 'Une course solo ne propose qu’une seule place.' },
          { status: 400 }
        );
      }
    }
    patch.ride_type = v.rideType;
  }
  if (v.vehicleType !== undefined) patch.vehicle_type = v.vehicleType;
  if (v.vehicleLabel !== undefined) patch.vehicle_label = v.vehicleLabel;
  if (v.paymentMethods !== undefined) patch.payment_methods = v.paymentMethods;
  if (v.note !== undefined) patch.note = v.note;
  if (v.status !== undefined) patch.status = v.status;

  const { error } = await supabase.from('rides').update(patch).eq('id', id);
  if (error) {
    console.error('[api/rides/[id]]', error.message);
    return NextResponse.json(
      { error: 'Modification impossible pour le moment.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
