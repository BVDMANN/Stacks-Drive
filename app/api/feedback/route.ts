import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';

const CATEGORIES = ['retard', 'comportement', 'proprete', 'itineraire', 'paiement', 'autre'] as const;

const FeedbackSchema = z
  .object({
    rideId: z.string().uuid(),
    kind: z.enum(['note', 'plainte', 'recommandation']),
    rating: z.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(500).optional(),
    category: z.enum(CATEGORIES).optional(),
  })
  .refine((v) => (v.kind === 'note' ? v.rating !== undefined : true), {
    message: 'Une note de 1 à 5 étoiles est requise.',
  })
  .refine((v) => (v.kind === 'plainte' ? v.category !== undefined : true), {
    message: 'Choisis une catégorie pour ta plainte.',
  })
  .refine(
    (v) => (v.kind === 'note' ? true : (v.comment ?? '').length >= 2),
    { message: 'Écris quelques mots pour expliquer.' }
  );

/** POST /api/feedback — noter (1-5), signaler (plainte) ou suggérer
 *  (recommandation) après une course terminée. Les deux côtés peuvent
 *  le faire : le passager note le chauffeur, le chauffeur note le
 *  passager. Une plainte signale la course pour révision admin
 *  (journal d'audit). Une note avec étoiles met aussi à jour la note
 *  de la course (rides.rating_driver / rating_passenger). */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, status, rating_driver, rating_passenger')
    .eq('id', v.rideId)
    .single();
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  if (ride.status !== 'terminee') {
    return NextResponse.json(
      { error: 'On ne donne un avis que sur une course terminée.' },
      { status: 400 }
    );
  }
  const isPassenger = ride.passenger_id === user.id;
  const isDriver = ride.driver_id === user.id;
  if (!isPassenger && !isDriver) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }
  const fromRole = isPassenger ? 'passager' : 'chauffeur';
  const toUserId = isPassenger ? ride.driver_id : ride.passenger_id;

  const { error } = await supabase.from('ride_feedback').insert({
    ride_id: v.rideId,
    from_user_id: user.id,
    from_role: fromRole,
    to_user_id: toUserId,
    rating: v.rating ?? null,
    comment: v.comment ?? null,
    category: v.category ?? null,
    kind: v.kind,
  });
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Tu as déjà déposé cet avis sur cette course.' },
        { status: 409 }
      );
    }
    console.error('[api/feedback]', error.message);
    return NextResponse.json({ error: 'Envoi impossible pour le moment.' }, { status: 500 });
  }

  // Une note avec étoiles met à jour la note de la course (une seule fois).
  if (v.kind === 'note' && v.rating) {
    if (isPassenger && ride.rating_driver === null) {
      await supabase
        .from('rides')
        .update({ rating_driver: v.rating })
        .eq('id', v.rideId)
        .is('rating_driver', null);
    }
    if (isDriver && ride.rating_passenger === null) {
      await supabase
        .from('rides')
        .update({ rating_passenger: v.rating })
        .eq('id', v.rideId)
        .is('rating_passenger', null);
    }
  }

  await logAudit(supabase, 'feedback_filed', {
    actorId: user.id,
    rideId: v.rideId,
    kind: v.kind,
    category: v.category ?? null,
    rating: v.rating ?? null,
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}

/** GET /api/feedback?rideId= — mes retours déjà déposés sur cette course
 *  (pour masquer les formulaires déjà remplis). */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const rideId = new URL(request.url).searchParams.get('rideId');
  if (!rideId) {
    return NextResponse.json({ error: 'rideId requis.' }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }
  const { data, error } = await supabase
    .from('ride_feedback')
    .select('kind, rating, comment, category, created_at')
    .eq('ride_id', rideId)
    .eq('from_user_id', user.id);
  if (error) {
    console.error('[api/feedback]', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, feedback: data ?? [] });
}
