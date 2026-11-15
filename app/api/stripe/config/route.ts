/** Config publique du paiement par carte (v2.55) : la clé
 *  PUBLIABLE (non secrète) pour le Payment Element + le fait que
 *  le paiement carte soit activé ou non. La clé SECRÈTE ne sort
 *  JAMAIS du serveur. */
import { NextResponse } from 'next/server';
import { getStripePublishableKey, isStripeConfigured } from '@/lib/stripe';

export async function GET() {
  const publishableKey = getStripePublishableKey();
  return NextResponse.json({
    ok: true,
    configured: isStripeConfigured() && Boolean(publishableKey),
    publishableKey,
  });
}
