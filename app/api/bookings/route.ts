import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { splitFare } from '@/lib/commission';
import { PAYMENT_METHODS } from '@/lib/neighborhoods';

const BookSchema = z.object({
  rideId: z.string().uuid(),
  seats: z.number().int().min(1, 'Au moins 1 place.').max(4),
  paymentMethod: z.enum(PAYMENT_METHODS),
  message: z.string().trim().max(1000).optional().default(''),
});

/** POST /api/bookings — réserver une place (passager connecté).
 *  La découpe du tarif (part chauffeur / frais plateforme) est calculée
 *  ici et figée dans la réservation. Aucun paiement réel en v1 : le
 *  règlement se fait directement avec le chauffeur. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase n’est pas configuré sur ce déploiement.' },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Connecte-toi pour réserver.' },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = BookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const { rideId, seats, paymentMethod, message } = parsed.data;

  // Rôle passager requis.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'passager') {
    return NextResponse.json(
      { error: 'Seuls les passagers peuvent réserver. Crée un compte passager.' },
      { status: 403 }
    );
  }

  // La course doit exister, être publiée et à venir.
  const { data: ride } = await supabase
    .from('rides')
    .select('id, price, seats_available, status, driver_id, departure_time, payment_methods')
    .eq('id', rideId)
    .single();
  if (!ride || ride.status !== 'published') {
    return NextResponse.json(
      { error: 'Cette course n’est plus disponible.' },
      { status: 404 }
    );
  }
  if (new Date(ride.departure_time).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Cette course est déjà passée.' },
      { status: 400 }
    );
  }
  if (ride.driver_id === user.id) {
    return NextResponse.json(
      { error: 'Tu ne peux pas réserver ta propre course.' },
      { status: 400 }
    );
  }
  if (seats > ride.seats_available) {
    return NextResponse.json(
      { error: `Plus que ${ride.seats_available} place(s) disponible(s) sur cette course.` },
      { status: 400 }
    );
  }
  if (!ride.payment_methods.includes(paymentMethod)) {
    return NextResponse.json(
      { error: 'Ce moyen de paiement n’est pas accepté sur cette course.' },
      { status: 400 }
    );
  }

  const total = ride.price * seats;
  const split = splitFare(total);

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      ride_id: rideId,
      passenger_id: user.id,
      seats,
      total_price: split.total,
      platform_fee: split.platformFee,
      driver_share: split.driverShare,
      payment_method: paymentMethod,
      message,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Tu as déjà réservé cette course.' },
        { status: 409 }
      );
    }
    console.error('[api/bookings]', error.message);
    return NextResponse.json(
      { error: 'Réservation impossible pour le moment. Réessaie.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, bookingId: booking.id });
}
