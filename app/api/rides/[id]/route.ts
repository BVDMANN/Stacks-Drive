import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getRideRequestById } from '@/lib/rides';
import { mapDriverProfile } from '@/lib/db-types';

type Ctx = { params: Promise<{ id: string }> };

const ActionSchema = z.object({
  action: z.enum(['cancel', 'start', 'complete', 'rate']),
  rating: z.number().int().min(1).max(5).optional(),
  reason: z.string().trim().max(200).optional(),
});

/** GET /api/rides/[id] — demande + chauffeur assigné (avec sa note). */
export async function GET(_request: NextRequest, { params }: Ctx) {
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
  const found = await getRideRequestById(id, user.id);
  if (!found) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  const { ride, row } = found;
  let driver = null;
  if (row.driver) {
    driver = mapDriverProfile(row.driver);
    // Note moyenne du chauffeur.
    const { data: rated } = await supabase
      .from('rides')
      .select('rating_driver')
      .eq('driver_id', row.driver.id)
      .eq('status', 'terminee')
      .not('rating_driver', 'is', null);
    const ratings = (rated ?? []).map((r: { rating_driver: number | null }) => r.rating_driver ?? 0);
    if (ratings.length > 0) {
      driver.rating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
      driver.trips = ratings.length;
    }
  }
  return NextResponse.json({ ok: true, ride, driver });
}

/** PATCH /api/rides/[id] — annuler (passager ou chauffeur), démarrer /
 *  terminer (chauffeur assigné), noter (après course terminée). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
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
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Action invalide.' },
      { status: 400 }
    );
  }
  const { action } = parsed.data;

  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, status, rating_driver, rating_passenger')
    .eq('id', id)
    .single();
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  const isPassenger = ride.passenger_id === user.id;
  const isDriver = ride.driver_id === user.id;

  if (action === 'cancel') {
    if (!isPassenger && !isDriver) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }
    if (!['recherche', 'propositions', 'acceptee'].includes(ride.status)) {
      return NextResponse.json(
        { error: 'Cette course ne peut plus être annulée.' },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from('rides')
      .update({
        status: 'annulee',
        cancelled_by: isPassenger ? 'passager' : 'chauffeur',
        cancel_reason: parsed.data.reason ?? null,
      })
      .eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Annulation impossible.' }, { status: 500 });
    }
    // Les propositions en attente expirent toutes seules (60 s).
    return NextResponse.json({ ok: true });
  }

  if (action === 'start') {
    if (!isDriver) {
      return NextResponse.json({ error: 'Seul le chauffeur peut démarrer la course.' }, { status: 403 });
    }
    if (ride.status !== 'acceptee') {
      return NextResponse.json({ error: 'La course doit être confirmée pour démarrer.' }, { status: 400 });
    }
    const { error } = await supabase.from('rides').update({ status: 'en_cours' }).eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Démarrage impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'complete') {
    if (!isDriver) {
      return NextResponse.json({ error: 'Seul le chauffeur peut terminer la course.' }, { status: 403 });
    }
    if (ride.status !== 'en_cours') {
      return NextResponse.json({ error: 'La course doit être en cours pour se terminer.' }, { status: 400 });
    }
    const { error } = await supabase.from('rides').update({ status: 'terminee' }).eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Clôture impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // rate
  if (ride.status !== 'terminee') {
    return NextResponse.json(
      { error: 'On ne note qu’une course terminée.' },
      { status: 400 }
    );
  }
  const rating = parsed.data.rating;
  if (!rating) {
    return NextResponse.json({ error: 'Note de 1 à 5 requise.' }, { status: 400 });
  }
  if (isPassenger && ride.rating_driver === null) {
    const { error } = await supabase
      .from('rides')
      .update({ rating_driver: rating })
      .eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Note impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  if (isDriver && ride.rating_passenger === null) {
    const { error } = await supabase
      .from('rides')
      .update({ rating_passenger: rating })
      .eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Note impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Note déjà donnée ou non autorisée.' }, { status: 400 });
}
