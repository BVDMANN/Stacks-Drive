/** Empreinte (pré-autorisation) d'une course par carte (v2.55).
 *
 *  POST { rideId } — passager, course acceptée, paiement 'carte',
 *  course non offerte. Crée un PaymentIntent XAF en capture
 *  manuelle du montant TOTAL (prix convenu + frais Stripe, gross-up
 *  arrondi à 50 FCFA) et renvoie le client_secret pour le Payment
 *  Element (3DS). Idempotent : la même course renvoie la même
 *  empreinte tant qu'elle est en vie.
 *  GET ?rideId= — statut de l'empreinte (passager ou chauffeur
 *  de la course, admin).
 *
 *  La course ne peut DÉMARRER que quand l'empreinte est confirmée
 *  (voir PATCH /api/rides/[id] action=start) — le chauffeur ne
 *  roule jamais sans garantie de paiement.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  CARD_CURRENCY,
  cardGrossUp,
  getStripe,
  isStripeConfigured,
} from '@/lib/stripe';
import { logAudit } from '@/lib/audit';

const BodySchema = z.object({ rideId: z.string().uuid() });

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured() || !isStripeConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Le paiement par carte n’est pas encore activé.' },
      { status: 503 }
    );
  }
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Connexion requise.' }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Demande invalide.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, status, payment_method, loyalty_free, proposed_price, estimated_price')
    .eq('id', parsed.data.rideId)
    .maybeSingle();
  if (!ride) {
    return NextResponse.json({ ok: false, error: 'Course introuvable.' }, { status: 404 });
  }
  if (ride.passenger_id !== sessionUser.id) {
    return NextResponse.json({ ok: false, error: 'Cette course n’est pas la tienne.' }, { status: 403 });
  }
  if (ride.payment_method !== 'carte') {
    return NextResponse.json({ ok: false, error: 'Cette course n’est pas payée par carte.' }, { status: 400 });
  }
  if (ride.loyalty_free) {
    return NextResponse.json({ ok: false, error: 'Course offerte — aucun paiement par carte.' }, { status: 400 });
  }
  if (ride.status !== 'acceptee' && ride.status !== 'en_cours') {
    return NextResponse.json({ ok: false, error: 'La course n’est plus en attente de paiement.' }, { status: 400 });
  }

  // Une empreinte en vie existe déjà ? On la renvoie (idempotence).
  const { data: existing } = await supabase
    .from('card_payments')
    .select('payment_intent_id, status, charged_fcfa')
    .eq('ride_id', ride.id)
    .maybeSingle();
  if (existing && (existing.status === 'hold_pending' || existing.status === 'hold_confirmed') && existing.payment_intent_id) {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(existing.payment_intent_id).catch(() => null);
    if (intent?.client_secret) {
      return NextResponse.json({
        ok: true,
        already: true,
        status: existing.status,
        chargedFcfa: existing.charged_fcfa,
        clientSecret: intent.client_secret,
      });
    }
  }

  // Montant FIGÉ côté serveur : prix convenu (jamais l'estimation
  // seule) + frais Stripe, gross-up, arrondi à 50 FCFA.
  const fare = ride.proposed_price ?? ride.estimated_price ?? 0;
  if (fare < 400 || fare > 50000) {
    return NextResponse.json({ ok: false, error: 'Prix de course invalide.' }, { status: 400 });
  }
  const { charged, fees } = cardGrossUp(fare);

  const stripe = getStripe();
  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: charged,
        currency: CARD_CURRENCY,
        capture_method: 'manual',
        payment_method_types: ['card'],
        description: `Stacks Drive — empreinte course ${ride.id}`,
        metadata: {
          type: 'ride_hold',
          ride_id: ride.id,
          passenger_id: ride.passenger_id,
          driver_id: ride.driver_id ?? '',
          fare_fcfa: String(fare),
        },
      },
      { idempotencyKey: `ride-hold-${ride.id}` }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Création de l’empreinte impossible.';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const { data: recorded, error: rpcError } = await supabase.rpc('record_card_hold', {
    p_ride_id: ride.id,
    p_intent_id: intent.id,
    p_fare: fare,
    p_fees: fees,
    p_charged: charged,
  });
  const rec = recorded as { ok?: boolean; error?: string; intent_id?: string } | null;
  if (rpcError || !rec?.ok) {
    // L'empreinte Stripe existe mais l'enregistrement a échoué :
    // on l'annule pour ne pas laisser une retenue orpheline.
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: rec?.error ?? 'Enregistrement de l’empreinte impossible.' },
      { status: 500 }
    );
  }

  await logAudit(supabase, 'card_hold_created', {
    actorId: sessionUser.id,
    rideId: ride.id,
    details: { charged, fare, fees },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    status: 'hold_pending',
    fareFcfa: fare,
    feesFcfa: fees,
    chargedFcfa: charged,
    clientSecret: intent.client_secret,
  });
}

export async function GET(request: NextRequest) {
  const rideId = request.nextUrl.searchParams.get('rideId');
  if (!rideId) {
    return NextResponse.json({ ok: false, error: 'rideId requis.' }, { status: 400 });
  }
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Connexion requise.' }, { status: 401 });
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('card_payments')
    .select('status, fare_fcfa, fees_fcfa, charged_fcfa, created_at, captured_at')
    .eq('ride_id', rideId)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: true, payment: null });
  return NextResponse.json({ ok: true, payment: data });
}
