import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { expireStaleProposals, getMyProposals, getProposalsForRide, getDriverRating } from '@/lib/rides';
import { isComfortEligible } from '@/lib/comfort';
import { validateProposedPrice } from '@/lib/fare-guard';
import { getDriverOwed } from '@/lib/earnings';
import { DEBT_CAP_FCFA } from '@/lib/gamification';
import { canReceiveRide, getDriverAvailability } from '@/lib/seats';
import { logAudit } from '@/lib/audit';
import { isDifficultAccess, type Neighborhood } from '@/lib/neighborhoods';

const ProposeSchema = z.object({
  rideId: z.string().uuid(),
  proposedPrice: z.number().int().min(400, 'Prix minimum : 400 FCFA.').max(50000, 'Prix maximum : 50 000 FCFA.'),
  seatsLeft: z.number().int().min(1, 'Au moins 1 place.').max(9),
  firstStop: z.string().trim().min(2, 'Indique le premier arrêt.').max(120),
  /** Route non bitumée (v2.6) : le chauffeur prend la piste jusqu'à la
   *  destination (true) ou s'arrête au point de dépôt (false). */
  unpavedAccepted: z.boolean().default(false),
});

/** POST /api/proposals — le chauffeur en ligne propose un prix, des places
 *  et un premier arrêt sur une demande. La proposition expire après 60 s. */
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_verified, is_online, is_admin, fraud_blocked')
    .eq('id', user.id)
    .single();
  // v2.45 — compte admin = admin uniquement : l'admin ne propose
  // jamais de prix (il n'est pas chauffeur — le contrôle de rôle
  // ci-dessous le bloquerait déjà, l'admin étant « passager » en
  // base ; ce rejet explicite verrouille le cas où le rôle venait
  // à changer).
  if (profile?.is_admin === true) {
    return NextResponse.json(
      {
        error: 'Le compte administrateur ne propose pas de courses : il n’est pas chauffeur.',
        code: 'admin_not_allowed',
      },
      { status: 403 }
    );
  }
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'Seuls les chauffeurs peuvent proposer.' },
      { status: 403 }
    );
  }
  if (!profile.is_verified) {
    return NextResponse.json(
      { error: 'Fais vérifier ton compte (selfie + pièce d’identité) avant de proposer.' },
      { status: 403 }
    );
  }
  if (!profile.is_online) {
    return NextResponse.json(
      { error: 'Mets-toi en ligne pour recevoir et proposer des courses.' },
      { status: 403 }
    );
  }
  // Blocage temporaire pour fraude (v2.26) : le compte « à vérifier »
  // ne reçoit plus de demandes tant que l'administrateur ne l'a pas
  // débloqué dans /admin. Sans la migration v2.26, `fraud_blocked`
  // est absent (undefined) : le verrou est inactif.
  if ((profile as { fraud_blocked?: boolean }).fraud_blocked === true) {
    return NextResponse.json(
      {
        error: 'Ton compte est à vérifier : contacte l’administrateur pour le débloquer avant de proposer.',
        code: 'fraud_blocked',
      },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = ProposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  const { data: ride } = await supabase
    .from('rides')
    // select('*') : résilient si la migration v2.6 n'est pas encore
    // appliquée (unpaved_requested / drop_off_point absents → undefined).
    .select('*')
    .eq('id', v.rideId)
    .single();
  if (!ride || !['recherche', 'propositions'].includes(ride.status)) {
    return NextResponse.json(
      { error: 'Cette demande n’est plus ouverte aux propositions.' },
      { status: 404 }
    );
  }
  if (ride.passenger_id === user.id) {
    return NextResponse.json(
      { error: 'Tu ne peux pas proposer sur ta propre demande.' },
      { status: 400 }
    );
  }
  if (Date.now() - new Date(ride.created_at).getTime() > 15 * 60 * 1000) {
    return NextResponse.json(
      { error: 'Cette demande a expiré (plus de 15 minutes).' },
      { status: 400 }
    );
  }
  if (ride.ride_type === 'groupe' && v.seatsLeft < ride.seats) {
    return NextResponse.json(
      { error: `Le passager voyage à ${ride.seats} : il faut au moins ${ride.seats} place(s).` },
      { status: 400 }
    );
  }

  // Classe Confort (v2.34) : seuls les chauffeurs éligibles (clim +
  // note ≥ 4,5, vérifié côté serveur) peuvent proposer sur une
  // demande Confort — le dispatch filtre déjà, ce garde-fou couvre
  // la proposition directe.
  if ((ride as { comfort?: boolean }).comfort) {
    const { data: driverProfile } = await supabase
      .from('profiles')
      .select('has_air_conditioning')
      .eq('id', user.id)
      .single();
    const rating = await getDriverRating(user.id).catch(() => null);
    if (
      !isComfortEligible({
        hasAirConditioning: (driverProfile as { has_air_conditioning?: boolean | null } | null)
          ?.has_air_conditioning,
        averageRating: rating?.average ?? null,
      })
    ) {
      return NextResponse.json(
        {
          error:
            'Confort exige une voiture climatisée et une note moyenne de 4,5★ ou plus : déclare la climatisation dans ton profil et garde une bonne note pour y accéder.',
        },
        { status: 403 }
      );
    }
  }

  // Places / statut (v2.19) : on ne propose que sur les demandes
  // adaptées — Groupe avec au moins 1 place libre (y compris en
  // course Groupe avec des places restantes), Solo uniquement si le
  // véhicule est totalement vide, rien si Plein ou en Solo. Le
  // dispatch (GET /api/rides?scope=incoming) filtre déjà, mais une
  // proposition directe sur une demande vue avant ne doit pas passer.
  const availability = await getDriverAvailability(supabase, user.id);
  if (
    !canReceiveRide(ride.ride_type, {
      capacity: availability.capacity,
      freeSeats: availability.freeSeats,
      activeRideTypes: availability.activeRideTypes,
    })
  ) {
    return NextResponse.json(
      {
        error:
          ride.ride_type === 'solo'
            ? 'Une course Solo exige un véhicule totalement vide : termine ta course en cours avant de proposer sur une Solo.'
            : 'Tu n’as plus de place libre pour cette course Groupe.',
      },
      { status: 400 }
    );
  }
  if (v.seatsLeft > availability.freeSeats) {
    return NextResponse.json(
      {
        error: `Tu n’as que ${availability.freeSeats} place${availability.freeSeats > 1 ? 's' : ''} libre${availability.freeSeats > 1 ? 's' : ''} : tu ne peux pas proposer ${v.seatsLeft} place${v.seatsLeft > 1 ? 's' : ''}.`,
      },
      { status: 400 }
    );
  }

  // Garde-fou tarifaire (v2.11) : le prix proposé est revalidé côté
  // serveur contre les bornes absolues uniquement (400–50 000 FCFA) :
  // il n'y a plus de tarif de référence, le prix se décide entre le
  // passager et le chauffeur. Un prix hors bornes est refusé,
  // journalisé, et expliqué au chauffeur. Jamais de course créée avec
  // un prix fou.
  // Route non bitumée (v2.6) : le supplément n'est inclus que si le
  // chauffeur prend la piste — et seulement si la destination est
  // vraiment à accès difficile (sinon un chauffeur pourrait gonfler
  // son prix de 800 FCFA sur un trajet normal).
  const takesUnpaved =
    v.unpavedAccepted && isDifficultAccess(ride.destination as Neighborhood);
  const fareCheck = validateProposedPrice(v.proposedPrice);
  if (!fareCheck.ok) {
    await logAudit(supabase, 'price_rejected', {
      actorId: user.id,
      rideId: v.rideId,
      proposedPrice: v.proposedPrice,
      unpavedAccepted: takesUnpaved,
    });
    return NextResponse.json({ error: fareCheck.message }, { status: 400 });
  }

  // Plafond de dette (v2.2) : au-delà de ~5 000 FCFA de commissions
  // non réglées, plus de nouvelles propositions tant que ce n'est pas soldé.
  const owed = await getDriverOwed(user.id);
  if (owed >= DEBT_CAP_FCFA) {
    return NextResponse.json(
      {
        error: `Tu as atteint le plafond de dette (${DEBT_CAP_FCFA} FCFA de commissions non réglées). Règle tes commissions par transfert Mobile Money pour recevoir de nouvelles demandes.`,
      },
      { status: 403 }
    );
  }

  const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
  const proposalPayload: Record<string, unknown> = {
    ride_id: v.rideId,
    driver_id: user.id,
    proposed_price: v.proposedPrice,
    seats_left: v.seatsLeft,
    first_stop: v.firstStop,
    status: 'pending',
    expires_at: expiresAt,
    unpaved_accepted: takesUnpaved,
  };
  let { data: proposal, error } = await supabase
    .from('ride_proposals')
    .insert(proposalPayload)
    .select('id')
    .single();

  // Migration v2.6 pas encore appliquée : on enregistre la proposition
  // sans le champ v2.6 (le prix, lui, a déjà été validé avec le bon
  // référentiel — avec ou sans supplément).
  if (error && error.code === '42703') {
    delete proposalPayload.unpaved_accepted;
    ({ data: proposal, error } = await supabase
      .from('ride_proposals')
      .insert(proposalPayload)
      .select('id')
      .single());
  }

  if (error || !proposal) {
    if (error?.code === '23505') {
      return NextResponse.json(
        { error: 'Tu as déjà proposé sur cette demande.' },
        { status: 409 }
      );
    }
    console.error('[api/proposals]', error?.message ?? 'Proposition sans id.');
    return NextResponse.json(
      { error: 'Proposition impossible pour le moment.' },
      { status: 500 }
    );
  }

  // La demande passe en « propositions reçues » (politique RLS dédiée).
  await supabase
    .from('rides')
    .update({ status: 'propositions' })
    .eq('id', v.rideId)
    .eq('status', 'recherche');

  return NextResponse.json({ ok: true, proposalId: proposal.id, expiresAt }, { status: 201 });
}

/** GET /api/proposals?rideId= — propositions d'une demande (son passager,
 *  ou le chauffeur pour ses propres propositions).
 *  GET /api/proposals?scope=mine — propositions envoyées par le chauffeur
 *  connecté, avec le trajet de chaque demande. */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const url = new URL(request.url);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }

  if (url.searchParams.get('scope') === 'mine') {
    await expireStaleProposals();
    const proposals = await getMyProposals(user.id);
    // Joindre le trajet de chaque demande.
    const rideIds = [...new Set(proposals.map((p) => p.rideId))];
    const rides = new Map<string, { pickup: string; destination: string; rideType: string; status: string }>();
    if (rideIds.length > 0) {
      const { data } = await supabase
        .from('rides')
        .select('id, pickup, destination, ride_type, status')
        .in('id', rideIds);
      (data ?? []).forEach((r: { id: string; pickup: string; destination: string; ride_type: string; status: string }) =>
        rides.set(r.id, { pickup: r.pickup, destination: r.destination, rideType: r.ride_type, status: r.status })
      );
    }
    return NextResponse.json({
      ok: true,
      proposals: proposals.map((p) => ({ ...p, ride: rides.get(p.rideId) ?? null })),
    });
  }

  const rideId = url.searchParams.get('rideId');
  if (!rideId) {
    return NextResponse.json({ error: 'rideId requis.' }, { status: 400 });
  }
  const { data: ride } = await supabase
    .from('rides')
    .select('passenger_id, driver_id')
    .eq('id', rideId)
    .single();
  if (!ride || (ride.passenger_id !== user.id && ride.driver_id !== user.id)) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }
  await expireStaleProposals();
  const proposals = await getProposalsForRide(rideId);
  return NextResponse.json({ ok: true, proposals });
}
