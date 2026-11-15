/** Grand livre carte — helpers serveur (v2.55).
 *
 *  Ces fonctions sont appelées par les routes API après les
 *  opérations Stripe (capture, annulation). Elles ne touchent
 *  JAMAIS aux taux de commission (lib/commission.ts) et ne
 *  créent AUCUNE écriture comptable en double : chaque transition
 *  passe par une fonction SECURITY DEFINER idempotente
 *  (migration v2.55).
 */

import { getStripe, isStripeConfigured, stripeFeeToFcfa } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit';

export type CardPaymentRow = {
  id: string;
  ride_id: string;
  passenger_id: string;
  driver_id: string;
  payment_intent_id: string | null;
  status: string;
  fare_fcfa: number;
  fees_fcfa: number;
  charged_fcfa: number;
  stripe_fee_fcfa: number | null;
  created_at: string;
  captured_at: string | null;
  voided_at: string | null;
};

/** Paiement carte d'une course (lecture seule, via RLS). */
export async function getCardPaymentForRide(rideId: string): Promise<CardPaymentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('card_payments')
    .select('*')
    .eq('ride_id', rideId)
    .maybeSingle();
  if (error || !data) return null;
  return data as CardPaymentRow;
}

/** Frais Stripe RÉELS d'un PaymentIntent (balance_transaction),
 *  convertis en FCFA. Renvoie null si indisponibles — l'appelant
 *  garde alors les frais estimés (gross-up). */
async function fetchRealStripeFeeFcfa(
  stripe: ReturnType<typeof getStripe>,
  paymentIntentId: string
): Promise<number | null> {
  try {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge.balance_transaction'],
    });
    const charge = intent.latest_charge;
    if (!charge || typeof charge === 'string') return null;
    const bt = charge.balance_transaction;
    if (!bt || typeof bt === 'string') return null;
    return stripeFeeToFcfa(bt.fee, bt.exchange_rate);
  } catch {
    return null;
  }
}

/** Capture l'empreinte d'une course terminée (appelée par PATCH
 *  /api/rides/[id] action=complete, APRÈS finalize_ride_earnings).
 *  - Capture le montant TOTAL autorisé (prix convenu + frais) :
 *    le passager a été informé du total avant la course.
 *  - En cas d'échec de capture : la course reste terminée, le
 *    paiement passe en 'capture_failed' et la part du chauffeur
 *    part dans le lot quotidien, financée par la plateforme —
 *    le chauffeur n'est JAMAIS pénalisé par un échec de capture.
 *  - Ne bloque JAMAIS la clôture de la course : toute erreur est
 *    journalisée et signalée, pas propagée.
 *  Renvoie { captured: boolean, reason?: string }. */
export async function captureCardRide(rideId: string): Promise<{ captured: boolean; reason?: string }> {
  if (!isStripeConfigured()) return { captured: false, reason: 'stripe_non_configure' };
  const payment = await getCardPaymentForRide(rideId);
  if (!payment?.payment_intent_id) return { captured: false, reason: 'aucune_empreinte' };
  if (payment.status === 'captured') return { captured: true };
  if (payment.status !== 'hold_confirmed' && payment.status !== 'hold_pending') {
    return { captured: false, reason: `etat_${payment.status}` };
  }

  const supabase = await createClient();
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.capture(payment.payment_intent_id, {
      amount_to_capture: payment.charged_fcfa,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'capture impossible';
    await supabase.rpc('record_card_capture_failed', {
      p_intent_id: payment.payment_intent_id,
      p_reason: reason.slice(0, 200),
    });
    await logAudit(supabase, 'card_capture_failed', {
      actorId: payment.driver_id,
      rideId,
      details: { reason: reason.slice(0, 200) },
    }).catch(() => undefined);
    return { captured: false, reason };
  }

  const realFee = await fetchRealStripeFeeFcfa(stripe, payment.payment_intent_id);
  await supabase.rpc('apply_card_capture', {
    p_intent_id: payment.payment_intent_id,
    p_stripe_fee: realFee ?? payment.fees_fcfa,
  });
  return { captured: true };
}

/** Annule l'empreinte d'une course annulée (void — rien n'est
 *  débité). Appelée par PATCH /api/rides/[id] action=cancel.
 *  Ne bloque jamais l'annulation. */
export async function voidCardHold(rideId: string): Promise<void> {
  if (!isStripeConfigured()) return;
  const payment = await getCardPaymentForRide(rideId);
  if (!payment?.payment_intent_id) return;
  if (payment.status === 'voided' || payment.status === 'captured') return;
  const supabase = await createClient();
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.cancel(payment.payment_intent_id);
  } catch {
    // L'empreinte a peut-être déjà expiré (7 jours) — on marque
    // quand même l'annulation en base, le webhook confirmera.
  }
  await supabase.rpc('void_card_hold', { p_intent_id: payment.payment_intent_id });
}

/** Rembourse une caution chauffeur via l'API Refunds (appelée par
 *  la route de départ et par le cron quotidien).
 *  Règles (CGU §7, ADR 0031) :
 *  - fraude confirmée -> confiscation (jamais de remboursement) ;
 *  - dette de commission impayée -> déduite du remboursement ;
 *  - sinon remboursement intégral (5 000 FCFA).
 *  Les frais Stripe de la caution (450 FCFA) ne sont pas remboursés
 *  au chauffeur (Stripe ne les reverse pas) : la plateforme les
 *  absorbe.
 *  ANTI-DOUBLE-DÉCLENCHEMENT (§6.7bis de la migration) : la
 *  caution a trois déclencheurs possibles (départ, route manuelle,
 *  cron quotidien). Avant tout appel Stripe, la fonction passe par
 *  le claim atomique `claim_deposit_refund` — un seul appelant
 *  bascule la caution en 'remboursement_en_cours', les autres
 *  s'arrêtent. L'appel Stripe porte en plus la clé d'idempotence
 *  `deposit-refund-{driverId}` : une reprise après échec réseau
 *  rejoue le même remboursement, elle n'en crée pas un second.
 *  Renvoie { refunded, amount, note }. */
export async function refundDriverDeposit(
  driverId: string,
  opts?: { adminForfeit?: boolean; forfeitReason?: string }
): Promise<{ refunded: boolean; amount: number; note: string }> {
  const supabase = await createClient();
  const { data: deposit } = await supabase
    .from('card_deposits')
    .select('*')
    .eq('driver_id', driverId)
    .maybeSingle();
  if (!deposit || !deposit.payment_intent_id) {
    return { refunded: false, amount: 0, note: 'Aucune caution versée par carte.' };
  }
  if (
    deposit.status !== 'paye' &&
    deposit.status !== 'remboursement_en_cours'
  ) {
    return { refunded: false, amount: 0, note: 'Aucune caution versée par carte.' };
  }

  // 1) Confiscation (admin, fraude confirmée) : aucun remboursement.
  //    La RPC verrouille la ligne et refuse si un remboursement est
  //    déjà en cours — pas de claim ici, la confiscation est elle-même
  //    atomique.
  if (opts?.adminForfeit) {
    const res = await supabase.rpc('forfeit_card_deposit', {
      p_driver_id: driverId,
      p_reason: opts.forfeitReason ?? 'Confiscation — fraude confirmée.',
    });
    const data = res.data as { ok?: boolean; error?: string } | null;
    if (!data?.ok) {
      return { refunded: false, amount: 0, note: data?.error ?? 'Confiscation impossible.' };
    }
    return { refunded: false, amount: 0, note: opts.forfeitReason ?? 'Caution confisquée.' };
  }

  // 2) Dette impayée déduite du remboursement.
  const { getDriverOwed } = await import('@/lib/earnings');
  const owed = await getDriverOwed(driverId);
  const refundable = Math.max(0, deposit.amount_fcfa - owed);

  if (refundable <= 0) {
    // La dette absorbe toute la caution : aucun virement, mais la
    // caution est clôturée (remboursement partiel de 0) et la dette
    // est soldée par un règlement 'carte' du même montant. Pas de
    // claim ici : record_deposit_refund verrouille la ligne et
    // refuse le second appel (statut déjà terminal).
    await supabase.rpc('record_deposit_refund', {
      p_intent_id: deposit.payment_intent_id,
      p_refund_id: null,
      p_amount: 0,
      p_note: `Dette de commission de ${owed} FCFA déduite de la caution — aucun montant à rembourser.`,
    });
    return {
      refunded: true,
      amount: 0,
      note: `Ta dette de ${owed} FCFA a été soldée avec ta caution — aucun remboursement à recevoir.`,
    };
  }

  // 3) Sans Stripe configuré, on ne prend pas le claim : la caution
  //    reste 'paye' et le prochain déclencheur réessaiera proprement.
  if (!isStripeConfigured()) {
    return { refunded: false, amount: 0, note: 'Paiement par carte non configuré — remboursement impossible.' };
  }

  // 4) Claim atomique : un seul appelant gagne le droit de
  //    rembourser. Les autres (départ + cron le même matin, reprise
  //    trop tôt) s'arrêtent ici, AVANT tout appel Stripe.
  const claimRes = await supabase.rpc('claim_deposit_refund', {
    p_driver_id: driverId,
  });
  const claim = claimRes.data as
    | { ok?: boolean; claimed?: boolean; already?: boolean; error?: string }
    | null;
  if (claim?.error === 'already_claimed') {
    return {
      refunded: false,
      amount: 0,
      note: 'Remboursement déjà en cours — réessaie dans quelques minutes.',
    };
  }
  if (claim?.already) {
    return { refunded: false, amount: 0, note: 'Aucune caution versée par carte.' };
  }
  if (!claim?.ok || !claim?.claimed) {
    return {
      refunded: false,
      amount: 0,
      note: claim?.error ?? 'Remboursement impossible pour le moment.',
    };
  }

  // 5) Remboursement sur la carte d'origine (5 à 10 jours ouvrés).
  //    Clé d'idempotence : si l'appel échoue en réseau après la
  //    création du remboursement, la reprise (cron suivant, claim
  //    repris après 15 min) rejoue le MÊME remboursement.
  const stripe = getStripe();
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: deposit.payment_intent_id,
        amount: refundable,
        reason: 'requested_by_customer',
        metadata: { driver_id: driverId, type: 'deposit_refund' },
      },
      { idempotencyKey: `deposit-refund-${driverId}` }
    );
    const note =
      owed > 0
        ? `Dette de commission de ${owed} FCFA déduite — ${refundable} FCFA remboursés sur ta carte (5 à 10 jours ouvrés).`
        : `${refundable} FCFA remboursés sur ta carte (5 à 10 jours ouvrés).`;
    await supabase.rpc('record_deposit_refund', {
      p_intent_id: deposit.payment_intent_id,
      p_refund_id: refund.id,
      p_amount: refundable,
      p_note: note,
    });
    return { refunded: true, amount: refundable, note };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'remboursement impossible';
    return { refunded: false, amount: 0, note: `Remboursement impossible pour le moment : ${reason}` };
  }
}
