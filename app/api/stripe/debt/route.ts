/** Remboursement de dette par carte (v2.55).
 *
 *  POST { amountFcfa } — chauffeur : paie tout ou partie de sa
 *  dette de commission par carte (capture immédiate, sans frais
 *  supplémentaires pour le chauffeur — le montant payé est
 *  intégralement déduit de sa dette). Le règlement est appliqué
 *  AUTOMATIQUEMENT au grand livre dès la confirmation Stripe
 *  (webhook payment_intent.succeeded -> apply_card_debt_payment
 *  -> driver_settlements, méthode 'carte').
 *  GET — historique des remboursements de dette du chauffeur.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { CARD_CURRENCY, getStripe, isStripeConfigured } from '@/lib/stripe';
import { getDriverOwed } from '@/lib/earnings';

const BodySchema = z.object({ amountFcfa: z.number().int().min(50).max(500000) });

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
  if (!sessionUser.profile || sessionUser.profile.role !== 'chauffeur') {
    return NextResponse.json({ ok: false, error: 'Réservé aux chauffeurs.' }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Montant invalide.' }, { status: 400 });
  }
  const amount = parsed.data.amountFcfa;

  // Le montant est borné par la dette réelle (serveur uniquement).
  const owed = await getDriverOwed(sessionUser.id);
  if (owed <= 0) {
    return NextResponse.json({ ok: false, error: 'Tu n’as aucune dette à rembourser.' }, { status: 400 });
  }
  if (amount > owed) {
    return NextResponse.json(
      { ok: false, error: `Ta dette est de ${owed} FCFA — tu ne peux pas payer plus.` },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  let intent;
  try {
    intent = await stripe.paymentIntents.create(
      {
        amount,
        currency: CARD_CURRENCY,
        capture_method: 'automatic',
        payment_method_types: ['card'],
        description: `Stacks Drive — remboursement de dette ${amount} FCFA`,
        metadata: { type: 'debt_payment', driver_id: sessionUser.id, amount_fcfa: String(amount) },
      },
      { idempotencyKey: `debt-${sessionUser.id}-${amount}-${Date.now()}` }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Création du paiement impossible.';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const supabase = await createClient();
  const { data: recorded, error: rpcError } = await supabase.rpc('record_card_debt_payment', {
    p_driver_id: sessionUser.id,
    p_intent_id: intent.id,
    p_amount: amount,
  });
  const rec = recorded as { ok?: boolean; error?: string } | null;
  if (rpcError || !rec?.ok) {
    await stripe.paymentIntents.cancel(intent.id).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: rec?.error ?? 'Enregistrement du paiement impossible.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, amountFcfa: amount, clientSecret: intent.client_secret });
}

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Connexion requise.' }, { status: 401 });
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from('card_debt_payments')
    .select('id, amount_fcfa, status, created_at')
    .eq('driver_id', sessionUser.id)
    .order('created_at', { ascending: false })
    .limit(20);
  return NextResponse.json({ ok: true, payments: data ?? [] });
}
