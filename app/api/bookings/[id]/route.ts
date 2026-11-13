import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const UpdateSchema = z.object({
  status: z.enum(['confirmed', 'cancelled', 'completed']),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/bookings/[id] — changer le statut d'une réservation.
 *  - Le passager peut seulement annuler la sienne.
 *  - Le chauffeur de la course peut confirmer, terminer ou annuler.
 *  L'annulation libère les places (trigger SQL sur `bookings`). */
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

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const { status } = parsed.data;

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, passenger_id, status, rides!bookings_ride_id_fkey (driver_id)')
    .eq('id', id)
    .single();
  if (!booking) {
    return NextResponse.json({ error: 'Réservation introuvable.' }, { status: 404 });
  }
  if (booking.status === 'cancelled' || booking.status === 'completed') {
    return NextResponse.json(
      { error: 'Cette réservation est déjà clôturée.' },
      { status: 400 }
    );
  }

  const isPassenger = booking.passenger_id === user.id;
  const isDriver =
    (booking.rides as { driver_id?: string | null } | null)?.driver_id === user.id;

  if (isPassenger) {
    // Le passager ne peut qu'annuler.
    if (status !== 'cancelled') {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }
  } else if (isDriver) {
    // Le chauffeur ne peut pas revenir sur une demande en attente vers « confirmée »
    // si elle est déjà confirmée, ni terminer une demande non confirmée.
    if (status === 'completed' && booking.status !== 'confirmed') {
      return NextResponse.json(
        { error: 'Confirme d’abord la réservation avant de la marquer terminée.' },
        { status: 400 }
      );
    }
  } else {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('bookings')
    .update({ status })
    .eq('id', id);
  if (error) {
    console.error('[api/bookings/[id]]', error.message);
    return NextResponse.json(
      { error: 'Modification impossible pour le moment.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
