/** Webhook Stripe (v2.55) — POST /api/stripe/webhook.
 *
 *  SÉCURITÉ MAX :
 *  - Signature vérifiée avec STRIPE_WEBHOOK_SECRET (constructEvent)
 *    — AUCUN événement non signé n'est traité.
 *  - Idempotence : chaque transition passe par une fonction SECURITY
 *    DEFINER qui refuse de ré-appliquer un état déjà atteint
 *    (rejeu d'un événement Stripe = sans effet).
 *  - Aucune écriture comptable sans passer par les RPC (le webhook
 *    ne fait jamais d'update direct sur les tables).
 *  - Les erreurs Stripe (réseau, etc.) ne font jamais échouer le
 *    webhook avec un 500 inutile : on journalise et on répond 200
 *    quand l'événement est reconnu mais non applicable.
 *
 *  Événements traités :
 *  - payment_intent.amount_capturable_updated : empreinte confirmée.
 *  - payment_intent.succeeded : capture terminée (course) ou
 *    paiement confirmé (caution / dette).
 *  - payment_intent.canceled : empreinte annulée (expiration 7 j).
 *  - charge.refunded : remboursement de caution confirmé.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getStripe, stripeFeeToFcfa } from '@/lib/stripe';
import { logAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

async function rpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return { ok: false, error: error.message };
  return (data ?? { ok: false }) as { ok?: boolean; error?: string };
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'STRIPE_WEBHOOK_SECRET non configuré.' },
      { status: 503 }
    );
  }
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ ok: false, error: 'Signature manquante.' }, { status: 400 });
  }

  const stripe = getStripe();
  const rawBody = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature invalide.';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'payment_intent.amount_capturable_updated': {
        const intent = event.data.object as { id: string; metadata?: Record<string, string> };
        if (intent.metadata?.type === 'ride_hold') {
          await rpc('confirm_card_hold', { p_intent_id: intent.id });
        }
        break;
      }
      case 'payment_intent.succeeded': {
        const intent = event.data.object as {
          id: string;
          metadata?: Record<string, string>;
          latest_charge?: string | { balance_transaction?: string | { fee?: number; exchange_rate?: number } };
        };
        const type = intent.metadata?.type;
        if (type === 'ride_hold') {
          // Capture terminée (la capture a été déclenchée par la
          // clôture de la course) : frais réels si disponibles.
          let feeFcfa: number | null = null;
          const charge = intent.latest_charge;
          if (charge && typeof charge !== 'string') {
            const bt = charge.balance_transaction;
            if (bt && typeof bt !== 'string') {
              feeFcfa = stripeFeeToFcfa(bt.fee, bt.exchange_rate);
            }
          }
          const supabase = await createClient();
          const { data: payment } = await supabase
            .from('card_payments')
            .select('fees_fcfa')
            .eq('payment_intent_id', intent.id)
            .maybeSingle();
          await rpc('apply_card_capture', {
            p_intent_id: intent.id,
            p_stripe_fee: feeFcfa ?? (payment as { fees_fcfa?: number } | null)?.fees_fcfa ?? 0,
          });
        } else if (type === 'deposit') {
          await rpc('confirm_card_deposit', { p_intent_id: intent.id });
        } else if (type === 'debt_payment') {
          await rpc('apply_card_debt_payment', { p_intent_id: intent.id });
        }
        break;
      }
      case 'payment_intent.canceled': {
        const intent = event.data.object as { id: string; metadata?: Record<string, string> };
        if (intent.metadata?.type === 'ride_hold') {
          await rpc('void_card_hold', { p_intent_id: intent.id });
        }
        break;
      }
      case 'charge.refunded': {
        const charge = event.data.object as {
          payment_intent?: string | null;
          amount_refunded?: number;
          metadata?: Record<string, string>;
        };
        if (charge.metadata?.type === 'deposit_refund' && charge.payment_intent) {
          const supabase = await createClient();
          const { data: deposit } = await supabase
            .from('card_deposits')
            .select('amount_fcfa')
            .eq('payment_intent_id', charge.payment_intent)
            .maybeSingle();
          const amount = charge.amount_refunded ?? 0;
          await rpc('record_deposit_refund', {
            p_intent_id: charge.payment_intent,
            p_refund_id: (charge as { id?: string }).id ?? null,
            p_amount: amount,
            p_note:
              amount >= ((deposit as { amount_fcfa?: number } | null)?.amount_fcfa ?? 0)
                ? 'Caution remboursée sur ta carte (5 à 10 jours ouvrés).'
                : 'Caution remboursée partiellement sur ta carte (dette déduite).',
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    const supabase = await createClient();
    await logAudit(supabase, 'stripe_webhook_error', {
      details: {
        type: event.type,
        error: err instanceof Error ? err.message : 'erreur inconnue',
      },
    }).catch(() => undefined);
    // Événement reconnu mais traitement en échec : on répond 200
    // pour éviter les rejeux en boucle de Stripe ; l'admin voit
    // l'erreur dans le journal d'audit.
  }

  return NextResponse.json({ received: true });
}
