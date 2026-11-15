import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { splitFare } from '@/lib/commission';
import { roundAcceptedPrice } from '@/lib/price-rounding';
import { neighborhoodPoint } from '@/lib/estimate-server';
import { fetchRoadRoute } from '@/lib/routing';
import { validateAcceptedPrice, validateProposedPrice, validateSplit } from '@/lib/fare-guard';
import { getDriverTier } from '@/lib/earnings';
import { rollDoubleRide } from '@/lib/gamification';
import { occupySeat } from '@/lib/seats';
import { logAudit } from '@/lib/audit';

type Ctx = { params: Promise<{ id: string }> };

const ActionSchema = z.object({
  action: z.enum(['accept', 'decline', 'accept_counter', 'reprice']),
  /** Nouveau prix proposé par le chauffeur (action 'reprice'). */
  proposedPrice: z.number().int().min(400).max(50000).optional(),
});

/** PATCH /api/proposals/[id] — le passager accepte ou refuse une proposition,
 *  le chauffeur accepte une contre-proposition ou propose un autre prix.
 *  Accepter fige le prix convenu et la découpe (commission 5 % puis 8 %)
 *  dans la course, assigne le chauffeur, et refuse les autres propositions.
 *  Fidélité : la 10e course du passager est offerte (il paie 0, le
 *  chauffeur touche l'intégralité du tarif, la plateforme absorbe).
 *
 *  Modèle exact (v2.11, décision du propriétaire 14/11/2026) : le prix final se
 *  décide entre le passager et le chauffeur — le chauffeur propose, le
 *  passager peut contre-proposer, le chauffeur peut accepter la
 *  contre-proposition ou proposer un autre prix. Une fois accepté, le
 *  prix est figé, jamais de surge. Le garde-fou serveur ne vérifie que
 *  les bornes absolues (400–50 000 FCFA) : il n'y a plus de tarif de
 *  référence. */
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
  const action = parsed.data.action;

  const { data: proposal } = await supabase
    .from('ride_proposals')
    // select('*') : résilient si la migration v2.6 / v2.10 n'est pas
    // encore appliquée (unpaved_accepted / counter_price absents →
    // undefined → false / null).
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
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }

  // Qui peut faire quoi : le passager accepte / refuse la proposition ;
  // le chauffeur accepte une contre-proposition ou propose un autre prix.
  const isPassenger = ride.passenger_id === user.id;
  const isDriver = proposal.driver_id === user.id;
  if ((action === 'accept' || action === 'decline') && !isPassenger) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }
  if ((action === 'accept_counter' || action === 'reprice') && !isDriver) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }

  if (action === 'decline') {
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

  // Reprice (v2.11) : le chauffeur propose un autre prix sur sa propre
  // proposition — par exemple après une contre-proposition du passager.
  // Le compteur de 60 s repart, la contre-proposition est effacée.
  if (action === 'reprice') {
    if (proposal.status !== 'pending') {
      return NextResponse.json({ error: 'Proposition déjà traitée.' }, { status: 400 });
    }
    if (new Date(proposal.expires_at).getTime() <= Date.now()) {
      await supabase.from('ride_proposals').update({ status: 'expired' }).eq('id', id);
      return NextResponse.json({ error: 'Cette proposition a expiré (60 secondes).' }, { status: 400 });
    }
    if (!['recherche', 'propositions'].includes(ride.status)) {
      return NextResponse.json({ error: 'Cette demande n’est plus ouverte.' }, { status: 400 });
    }
    const newPrice = parsed.data.proposedPrice;
    if (newPrice === undefined) {
      return NextResponse.json({ error: 'Indique le nouveau prix.' }, { status: 400 });
    }
    const fareCheck = validateProposedPrice(newPrice);
    if (!fareCheck.ok) {
      return NextResponse.json({ error: fareCheck.message }, { status: 400 });
    }
    const { error } = await supabase
      .from('ride_proposals')
      .update({
        proposed_price: newPrice,
        counter_price: null,
        expires_at: new Date(Date.now() + 60 * 1000).toISOString(),
      })
      .eq('id', id)
      .eq('status', 'pending');
    if (error) {
      console.error('[api/proposals/[id]]', error.message);
      return NextResponse.json({ error: 'Nouveau prix impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, proposedPrice: newPrice });
  }

  // Acceptation (passager : le prix proposé par le chauffeur ;
  // chauffeur : la contre-proposition du passager). Le prix convenu
  // entre les deux devient le prix figé de la course.
  let price =
    action === 'accept_counter' ? (proposal.counter_price as number | null) : proposal.proposed_price;
  if (price === null || price === undefined) {
    return NextResponse.json(
      { error: action === 'accept_counter' ? 'Aucune contre-proposition à accepter.' : 'Proposition sans prix.' },
      { status: 400 }
    );
  }

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
    .eq('passenger_id', ride.passenger_id)
    .eq('status', 'terminee');
  const loyaltyFree = ((completedCount ?? 0) % 10) === 9;

  // Garde-fou tarifaire (v2.11) : le prix convenu est revalidé côté
  // serveur contre les bornes absolues uniquement (400–50 000 FCFA).
  // Route non bitumée (v2.6) : le supplément n'est inclus que si le
  // chauffeur a accepté la piste dans sa proposition — le prix convenu
  // est le prix total, supplément compris le cas échéant.
  const unpavedAccepted = proposal.unpaved_accepted ?? false;
  const fareCheck = validateAcceptedPrice(price);
  if (!fareCheck.ok) {
    await logAudit(supabase, 'price_rejected', {
      actorId: user.id,
      rideId: ride.id,
      proposedPrice: price,
      unpavedAccepted,
    });
    return NextResponse.json({ error: fareCheck.message }, { status: 400 });
  }
  // Arrondi v2.34 (⚠️ À CONFIRMER PAR LE PROPRIÉTAIRE AVANT LE PUSH) :
  // le prix convenu est arrondi à 50 FCFA près, côté serveur, avant
  // la découpe commission / part chauffeur — qui se calcule sur le
  // montant ARRONDI. Le montant arrondi est affiché avant acceptation
  // (carte de proposition). Bornes revalidées après arrondi.
  const agreedPrice = price;
  price = roundAcceptedPrice(price);
  const roundedCheck = validateAcceptedPrice(price);
  if (!roundedCheck.ok) {
    return NextResponse.json({ error: roundedCheck.message }, { status: 400 });
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
  // Distance et durée routières (v2.50, ADR 0025) : revalidées à
  // l'acceptation sur les points exacts du trajet (épingle ou centre
  // de quartier) — la distance stockée à la demande est remplacée par
  // la route réelle. Repli OSRM indisponible : vol d'oiseau.
  const trip = await fetchRoadRoute(
    ride.pickup_lat != null && ride.pickup_lng != null
      ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
      : neighborhoodPoint(ride.pickup),
    ride.destination_lat != null && ride.destination_lng != null
      ? { lat: ride.destination_lat, lng: ride.destination_lng }
      : neighborhoodPoint(ride.destination)
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
      distance_km: trip.distanceKm,
      duration_min: trip.durationMin,
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

  // Places libres (v2.19) : l'acceptation occupe une place — Groupe
  // − 1, Solo → 0 (véhicule entier pris). La place se libère à la fin
  // ou à l'annulation de la course (PATCH /api/rides/[id]).
  await occupySeat(supabase, proposal.driver_id, ride.ride_type as 'solo' | 'groupe');

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
    acceptedVia: action === 'accept_counter' ? 'counter' : 'proposal',
  });
  if (isDoubleRide) {
    await logAudit(supabase, 'double_ride_awarded', {
      actorId: user.id,
      rideId: ride.id,
      fare: price,
      points: 200,
    });
  }

  return NextResponse.json({
    ok: true,
    loyaltyFree,
    pinCode,
    isDoubleRide,
    agreedPrice,
    roundedPrice: price,
  });
}
