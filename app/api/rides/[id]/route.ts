import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getRideRequestById } from '@/lib/rides';
import { mapDriverProfile } from '@/lib/db-types';
import { getDriverEarningsSummary } from '@/lib/earnings';
import { formatFcfa } from '@/lib/commission';

type Ctx = { params: Promise<{ id: string }> };

const ActionSchema = z.object({
  action: z.enum(['cancel', 'start', 'complete', 'rate']),
  rating: z.number().int().min(1).max(5).optional(),
  reason: z.string().trim().max(200).optional(),
  /** Code PIN à 4 chiffres donné par le passager (démarrage, v2.2). */
  pin: z.string().regex(/^[0-9]{4}$/).optional(),
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

/** Données de la popup de célébration après une course terminée
 *  (v2.2, points en v2.3) : montant gardé en gros, % gardé, Course
 *  Double (points doublés), progression de la quête du jour, points
 *  gagnés, série, niveau. Les chiffres viennent de la base
 *  (driver_earnings + résumé), jamais du client. */
async function buildCelebration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rideId: string,
  driverId: string,
  finalized?: unknown
) {
  const { data: ride } = await supabase
    .from('rides')
    .select('proposed_price, estimated_price, platform_fee, driver_share, loyalty_free, is_double_ride')
    .eq('id', rideId)
    .single();
  const fare = ride?.proposed_price ?? ride?.estimated_price ?? 0;
  const kept = ride?.driver_share ?? 0;
  const commission = ride?.platform_fee ?? 0;
  const ratePct = fare > 0 ? Math.round(((fare - kept) / fare) * 100) : 0;
  const fin = (finalized ?? {}) as {
    quest_points?: number;
    points_earned?: number;
    tier?: string;
    streak?: number;
    completed_count?: number;
  };
  let summary = null;
  try {
    summary = await getDriverEarningsSummary(driverId);
  } catch {
    summary = null;
  }
  return {
    fare,
    fareLabel: formatFcfa(fare),
    kept,
    keptLabel: formatFcfa(kept),
    commission,
    commissionLabel: formatFcfa(commission),
    keptPct: 100 - ratePct,
    isDoubleRide: ride?.is_double_ride ?? false,
    loyaltyFree: ride?.loyalty_free ?? false,
    questBonus: fin.quest_points ?? 0,
    questDone: summary?.quest.day.done ?? 0,
    questTarget: summary?.quest.day.target ?? 8,
    questBonusAmount: summary?.quest.day.bonus ?? 1000,
    pointsEarned: fin.points_earned ?? 0,
    streakDays: summary?.streakDays ?? fin.streak ?? 0,
    tier: summary?.tier.current ?? fin.tier ?? 'Bronze',
    completedRides: summary?.completedRides ?? fin.completed_count ?? 0,
  };
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
    // Code PIN (v2.2) : le passager donne son code à 4 chiffres au
    // chauffeur. Vérification atomique côté base (verify_ride_pin) :
    // 5 codes faux = course verrouillée + signalée à l'admin.
    const pin = parsed.data.pin;
    if (!pin) {
      return NextResponse.json(
        { error: 'Demande le code à 4 chiffres au passager pour démarrer.' },
        { status: 400 }
      );
    }
    const { data: pinResult, error: pinError } = await supabase.rpc('verify_ride_pin', {
      p_ride_id: id,
      p_pin: pin,
    });
    if (pinError) {
      console.error('[api/rides/[id]] verify_ride_pin:', pinError.message);
      return NextResponse.json(
        { error: 'Vérification du code impossible pour le moment — la migration v2.2 doit être appliquée dans Supabase. Réessaie dans quelques minutes.' },
        { status: 503 }
      );
    }
    const result = pinResult as { ok: boolean; attempts_left?: number; locked?: boolean; error?: string };
    if (!result?.ok) {
      return NextResponse.json(
        {
          error: result?.error ?? 'Code faux.',
          attemptsLeft: result?.attempts_left ?? null,
          locked: result?.locked ?? false,
        },
        { status: result?.locked ? 423 : 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (action === 'complete') {
    if (!isDriver) {
      return NextResponse.json({ error: 'Seul le chauffeur peut terminer la course.' }, { status: 403 });
    }
    // Idempotence : si la course est déjà terminée (double clic, retry),
    // on ne la clôture pas deux fois — on renvoie la célébration.
    if (ride.status === 'terminee') {
      const celebration = await buildCelebration(supabase, id, user.id);
      return NextResponse.json({ ok: true, alreadyCompleted: true, celebration });
    }
    if (ride.status !== 'en_cours') {
      return NextResponse.json({ error: 'La course doit être en cours pour se terminer.' }, { status: 400 });
    }
    // Mise à jour conditionnelle : seul le passage en_cours → terminee
    // aboutit. Un double envoi concurrent ne crée pas de doublon.
    const { data: updated, error } = await supabase
      .from('rides')
      .update({ status: 'terminee', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'en_cours')
      .select('id');
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Clôture impossible.' }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      // Un autre appel vient de la terminer : idempotent.
      const celebration = await buildCelebration(supabase, id, user.id);
      return NextResponse.json({ ok: true, alreadyCompleted: true, celebration });
    }

    // Clôture des gains (idempotente côté base : jamais de double
    // commission). Si la fonction n'existe pas encore (migration v2.2
    // non appliquée), la course reste terminée et les gains seront
    // recalculés au prochain affichage du tableau de bord.
    const { data: finalized, error: finalizeError } = await supabase.rpc(
      'finalize_ride_earnings',
      { p_ride_id: id }
    );
    if (finalizeError) {
      console.error('[api/rides/[id]] finalize_ride_earnings:', finalizeError.message);
    }
    const celebration = await buildCelebration(supabase, id, user.id, finalized);
    return NextResponse.json({ ok: true, celebration });
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
