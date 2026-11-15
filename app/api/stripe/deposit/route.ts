/** Caution chauffeur par carte (v2.55).
 *
 *  POST — chauffeur : crée un PaymentIntent XAF en capture
 *  IMMÉDIATE de 5 000 FCFA + frais Stripe (gross-up, arrondi à
 *  50 FCFA : 5 450 FCFA débités, frais 450 à la charge du
 *  chauffeur). Idempotent : une seule caution par chauffeur.
 *  GET — statut de la caution du chauffeur connecté (ou de
 *  n'importe quel chauffeur pour l'admin).
 *
 *  Remboursement automatique au départ du chauffeur (voir
 *  POST /api/driver/leave et le cron quotidien) : intégral,
 *  sauf dette déduite ou fraude confirmée (CGU §7).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { CARD_CURRENCY, cardGrossUp, getStripe, isStripeConfigured } from '@/lib/stripe';
import { DEPOSIT_FCFA } from '@/lib/gamification';

export async function POST() {
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
  if (!sessionUser.profile || sessionUser.profile.role !== 'chauffeur') {
    return NextResponse.json({ ok: false, error: 'Réservé aux chauffeurs.' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('card_deposits')
    .select('payment_intent_id, status, charged_fcfa')
    .eq('driver_id', sessionUser.id)
    .maybeSingle();
  if (existing?.status === 'paye') {
    return NextResponse.json({ ok: false, error: 'Caution déjà versée.' }, { status: 400 });
  }
  if (existing && (existing.status === 'rembourse' || existing.status === 'rembourse_partiel' || existing.status === 'confisque')) {
    return NextResponse.json({ ok: false, error: 'Caution déjà clôturée — contacte Stacks Drive.' }, { status: 400 });
  }
  if (existing?.payment_intent_id && existing.status === 'en_attente') {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(existing.payment_intent_id).catch(() => null);
    if (intent?.client_secret) {
      return NextResponse.json({
        ok: true,
        already: true,
        depositFcfa: DEPOSIT_FCFA,
        chargedFcfa: existing.charged_fcfa,
        clientSecret: intent.client_secret,
      });
    }
  }

  const { charged, fees } = cardGrossUp(DEPOSIT_FCFA);
  const stripe = getStripe();
  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount: charged,
        currency: CARD_CURRENCY,
        capture_method: 'automatic',
        payment_method_types: ['card'],
        description: 'Stacks Drive — caution chauffeur 5 000 FCFA',
        metadata: { type: 'deposit', driver_id: sessionUser.id, deposit_fcfa: String(DEPOSIT_FCFA) },
      },
      { idempotencyKey: `deposit-${sessionUser.id}` }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Création du paiement impossible.';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const { data: recorded, error: rpcError } = await supabase.rpc('record_card_deposit', {
    p_driver_id: sessionUser.id,
    p_intent_id: intent.id,
    p_amount: DEPOSIT_FCFA,
    p_fees: fees,
    p_charged: charged,
  });
  const rec = recorded as { ok?: boolean; error?: string } | null;
  if (rpcError || !rec?.ok) {
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: rec?.error ?? 'Enregistrement de la caution impossible.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    depositFcfa: DEPOSIT_FCFA,
    feesFcfa: fees,
    chargedFcfa: charged,
    clientSecret: intent.client_secret,
  });
}

export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Connexion requise.' }, { status: 401 });
  }
  const driverId = request.nextUrl.searchParams.get('driverId') ?? sessionUser.id;
  if (driverId !== sessionUser.id && !sessionUser.profile?.is_admin) {
    return NextResponse.json({ ok: false, error: 'Non autorisé.' }, { status: 403 });
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('card_deposits')
    .select('status, amount_fcfa, fees_fcfa, charged_fcfa, refund_amount_fcfa, refund_note, refunded_at, created_at')
    .eq('driver_id', driverId)
    .maybeSingle();
  return NextResponse.json({ ok: true, deposit: data ?? null });
}
