import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { splitFare } from '@/lib/commission';
import { estimateFare } from '@/lib/pricing';
import { validateAcceptedPrice, validateSplit } from '@/lib/fare-guard';
import { getDriverTier } from '@/lib/earnings';
import { rollDoubleRide } from '@/lib/gamification';
import { logAudit } from '@/lib/audit';
import type { Neighborhood } from '@/lib/neighborhoods';

type Ctx = { params: Promise<{ id: string }> };

const ActionSchema = z.object({
  action: z.enum(['accept', 'decline']),
});

/** PATCH /api/proposals/[id] — le passager accepte ou refuse une proposition.
 *  Accepter fige le prix et la découpe (commission 5 % puis 8 %) dans la
 *  course, assigne le chauffeur, et refuse les autres propositions.
 *  Fidélité : la 10e course du passager est offerte (il paie 0, le
 *  chauffeur touche l'intégralité du tarif, la plateforme absorbe). */
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
    return NextResponse.json({ error: 'Action invalide.' }, { status: 400 });
  }

  const { data: proposal } = await supabase
    .from('ride_proposals')
    // select('*') : résilient si la migration v2.6 n'est pas encore
    // appliquée (unpaved_accepted absent → undefined → false).
    .select('*')
    .eq('id', id)
    .single();
  if (!proposal) {
    return NextResponse.json({ error: 'Proposition introuvable.' }, { status: 404 });
  }

  const { data: ride } = await supabase
    .from('rides')
    .select('*')
    .eq('id', proposal.ride_id)
    .single();
  if (!ride || ride.passenger_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }

  if (parsed.data.action === 'decline') {
    if (proposal.status !== 'pending') {
      return NextResponse.json({ error: 'Proposition déjà traitée.' }, { status: 400 });
    }
    const { error } = await supabase
      .from('ride_proposals')
      .update({ status: 'declined' })
      .eq('id', id);
    if (error) {
      console.error('[api/proposals/[id]]', error.message);
      return NextResponse.json({ error: 'Refus impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // accept
  if (proposal.status !== 'pending') {
    return NextResponse.json(
      { error: 'Cette proposition n’est plus valable.' },
      { status: 400 }
    );
  }
  if (new Date(proposal.expires_at).getTime() <= Date.now()) {
    await supabase.from('ride_proposals').update({ status: 'expired' }).eq('id', id);
    return NextResponse.json(
      { error: 'Cette proposition a expiré (60 secondes).' },
      { status: 400 }
    );
  }
  if (!['recherche', 'propositions'].includes(ride.status)) {
    return NextResponse.json(
      { error: 'Cette demande n’est plus ouverte.' },
      { status: 400 }
    );
  }

  // Fidélité : 10e course offerte ?
  const { count: completedCount } = await supabase
    .from('rides')
    .select('id', { count: 'exact', head: true })
    .eq('passenger_id', user.id)
    .eq('status', 'terminee');
  const loyaltyFree = ((completedCount ?? 0) % 10) === 9;
  const price = proposal.proposed_price;

  // Garde-fou tarifaire (v2.2) : on recalcule le tarif depuis la matrice
  // et on refuse toute acceptation dont le prix ne correspond pas.
  // Route non bitumée (v2.6) : la référence reprend le choix du
  // chauffeur dans sa proposition — un prix avec supplément n'est
  // valable que s'il a accepté la piste.
  const unpavedAccepted = proposal.unpaved_accepted ?? false;
  const fareCheck = validateAcceptedPrice(
    ride.pickup as Neighborhood,
    ride.destination as Neighborhood,
    ride.ride_type as 'solo' | 'groupe',
    ride.vehicle_preference as 'voiture' | 'moto' | 'tous',
    price,
    { unpavedRoad: unpavedAccepted }
  );
  if (!fareCheck.ok) {
    await logAudit(supabase, 'price_rejected', {
      actorId: user.id,
      rideId: ride.id,
      proposedPrice: price,
      referencePrice: fareCheck.referencePrice ?? null,
      unpavedAccepted,
    });
    return NextResponse.json({ error: fareCheck.message }, { status: 400 });
  }

  // Taux de commission du chauffeur (v2.3) : le niveau ne change plus
  // le taux — 5 % au lancement puis 8 %, plafond 10 % pour tous.
  // Le niveau est recalculé depuis ses vraies stats, jamais depuis
  // profiles.tier.
  const { tier, rate } = await getDriverTier(proposal.driver_id);

  // Course Double (v2.3) : ~1 course sur 10, tirée au sort côté serveur.
  // Pas de tirage sur une course fidélité (déjà offerte à 100 %).
  // La Course Double ne donne PLUS la commission offerte : elle double
  // les points de la course à la clôture (200 au lieu de 100).
  const isDoubleRide = !loyaltyFree && rollDoubleRide();
  const split = loyaltyFree
    ? { platformFee: price, driverShare: price }
    : splitFare(price, rate);
  // Fidélité : la plateforme absorbe le tarif (le passager paie 0,
  // le chauffeur touche 100 %) : platform_fee = driver_share = prix.
  // La découpe ne s'additionne donc pas au tarif dans ce cas.
  const splitCheck = loyaltyFree
    ? split.platformFee === price && split.driverShare === price
      ? { ok: true as const }
      : { ok: false as const, message: 'Découpe fidélité incohérente — acceptation bloquée.' }
    : validateSplit(price, rate, split.platformFee, split.driverShare);
  if (!splitCheck.ok) {
    await logAudit(supabase, 'anomaly_detected', {
      actorId: user.id,
      rideId: ride.id,
      fare: price,
      rate,
      platformFee: split.platformFee,
      driverShare: split.driverShare,
    });
    return NextResponse.json(
      { error: 'Découpe tarifaire incohérente — acceptation bloquée pour vérification.' },
      { status: 400 }
    );
  }

  // Code PIN à 4 chiffres (v2.2) : le passager le donne au chauffeur
  // pour démarrer le trajet. Généré côté serveur, jamais par le client.
  const pinCode = String(Math.floor(1000 + Math.random() * 9000));
  const estimate = estimateFare(
    ride.pickup as Neighborhood,
    ride.destination as Neighborhood,
    ride.ride_type as 'solo' | 'groupe',
    ride.vehicle_preference as 'voiture' | 'moto' | 'tous'
  );

  const { error: acceptError } = await supabase
    .from('ride_proposals')
    .update({ status: 'accepted' })
    .eq('id', id)
    .eq('status', 'pending');
  if (acceptError) {
    console.error('[api/proposals/[id]]', acceptError.message);
    return NextResponse.json({ error: 'Acceptation impossible.' }, { status: 500 });
  }

  const { error: rideError } = await supabase
    .from('rides')
    .update({
      driver_id: proposal.driver_id,
      proposed_price: price,
      first_stop: proposal.first_stop,
      status: 'acceptee',
      platform_fee: split.platformFee,
      driver_share: split.driverShare,
      loyalty_free: loyaltyFree,
      pin_code: pinCode,
      pin_attempts: 0,
      pin_locked: false,
      distance_km: estimate.distanceKm,
      duration_min: estimate.durationMin,
      commission_rate: loyaltyFree ? 0 : rate,
      is_double_ride: isDoubleRide,
      platform_cost: 0,
    })
    .eq('id', ride.id)
    .in('status', ['recherche', 'propositions']);
  if (rideError) {
    console.error('[api/proposals/[id]]', rideError.message);
    return NextResponse.json(
      { error: 'Cette demande vient d’être confirmée avec un autre chauffeur.' },
      { status: 409 }
    );
  }

  // Route non bitumée (v2.6) : on fige le choix du chauffeur sur la
  // course. Mise à jour séparée et silencieuse : si la migration v2.6
  // n'est pas encore appliquée, l'acceptation reste valable (le prix
  // figé, lui, inclut ou non le supplément selon le choix).
  await supabase
    .from('rides')
    .update({ unpaved_accepted: unpavedAccepted })
    .eq('id', ride.id);

  // Les autres propositions en attente sont refusées.
  await supabase
    .from('ride_proposals')
    .update({ status: 'declined' })
    .eq('ride_id', ride.id)
    .eq('status', 'pending')
    .neq('id', id);

  await logAudit(supabase, 'fare_computed', {
    actorId: user.id,
    rideId: ride.id,
    fare: price,
    rate: loyaltyFree ? 0 : rate,
    tier,
    isDoubleRide,
    loyaltyFree,
    unpavedAccepted,
  });
  if (isDoubleRide) {
    await logAudit(supabase, 'double_ride_awarded', {
      actorId: user.id,
      rideId: ride.id,
      fare: price,
      points: 200,
    });
  }

  return NextResponse.json({ ok: true, loyaltyFree, pinCode, isDoubleRide });
}
