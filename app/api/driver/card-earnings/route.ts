/** Gains carte en TEMPS RÉEL (v2.55) — GET /api/driver/card-earnings.
 *
 *  Réponse au « hebdomadaire, c'est trop long » : le chauffeur
 *  voit, course par course et dès la fin de la course, le prix,
 *  la commission prélevée automatiquement et sa part nette — avec
 *  le statut de l'argent (encaissé par carte / en attente de
 *  capture / capture en échec — la plateforme avance sa part /
 *  versé dans le lot du jour / lot préparé pour demain matin).
 *  Les chiffres viennent du grand livre carte + des gains
 *  clôturés (driver_earnings), calculés côté serveur.
 */
import { NextResponse } from 'next/server';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Base indisponible.' }, { status: 503 });
  }
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Connexion requise.' }, { status: 401 });
  }
  if (!sessionUser.profile || sessionUser.profile.role !== 'chauffeur') {
    return NextResponse.json({ ok: false, error: 'Réservé aux chauffeurs.' }, { status: 403 });
  }

  const supabase = await createClient();
  const driverId = sessionUser.id;

  // Courses carte terminées (30 dernières) : gains + statut carte.
  const { data: earnings } = await supabase
    .from('driver_earnings')
    .select(
      'ride_id, fare_amount, commission_amount, driver_kept_amount, period_day, created_at'
    )
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false })
    .limit(30);
  const rideIds = (earnings ?? []).map((e) => e.ride_id);
  let ridesById = new Map<string, { pickup: string; destination: string; payment_method: string; loyalty_free: boolean; completed_at: string | null }>();
  let paymentsByRide = new Map<string, { status: string; charged_fcfa: number }>();
  if (rideIds.length > 0) {
    const { data: rides } = await supabase
      .from('rides')
      .select('id, pickup, destination, payment_method, loyalty_free, completed_at')
      .in('id', rideIds);
    (rides ?? []).forEach((r) => ridesById.set(r.id, r as never));
    const { data: payments } = await supabase
      .from('card_payments')
      .select('ride_id, status, charged_fcfa')
      .in('ride_id', rideIds);
    (payments ?? []).forEach((p) => paymentsByRide.set(p.ride_id, p as never));
  }
  // Lots quotidiens du chauffeur (10 derniers) + items (course -> lot).
  const { data: batches } = await supabase
    .from('daily_payout_batches')
    .select('id, payout_date, rides_count, driver_share_fcfa, platform_funded_fcfa, status, rail, reference, paid_at')
    .eq('driver_id', driverId)
    .order('payout_date', { ascending: false })
    .limit(10);
  const batchIds = (batches ?? []).map((b) => b.id);
  const rideToBatch = new Map<string, { batchId: string; status: string; payoutDate: string }>();
  if (batchIds.length > 0) {
    const { data: items } = await supabase
      .from('daily_payout_items')
      .select('batch_id, ride_id, source')
      .in('batch_id', batchIds);
    const batchById = new Map((batches ?? []).map((b) => [b.id, b]));
    (items ?? []).forEach((it) => {
      const b = batchById.get(it.batch_id);
      if (b) rideToBatch.set(it.ride_id, { batchId: it.batch_id, status: b.status, payoutDate: b.payout_date });
    });
  }

  const rides = (earnings ?? []).map((e) => {
    const ride = ridesById.get(e.ride_id);
    const payment = paymentsByRide.get(e.ride_id);
    const batch = rideToBatch.get(e.ride_id);
    const isCard = ride?.payment_method === 'carte';
    const isFree = Boolean(ride?.loyalty_free);
    // Statut de l'argent pour cette course.
    let moneyStatus: 'carte_encaissee' | 'carte_en_attente' | 'capture_en_echec' | 'plateforme' | 'especes';
    if (isFree) moneyStatus = 'plateforme';
    else if (isCard && payment?.status === 'captured') moneyStatus = 'carte_encaissee';
    else if (isCard && payment?.status === 'capture_failed') moneyStatus = 'capture_en_echec';
    else if (isCard) moneyStatus = 'carte_en_attente';
    else moneyStatus = 'especes';
    return {
      rideId: e.ride_id,
      day: e.period_day,
      completedAt: ride?.completed_at ?? null,
      pickup: ride?.pickup ?? null,
      destination: ride?.destination ?? null,
      paymentMethod: ride?.payment_method ?? 'especes',
      loyaltyFree: isFree,
      fare: e.fare_amount,
      commission: e.commission_amount,
      kept: e.driver_kept_amount,
      moneyStatus,
      batchStatus: batch?.status ?? null,
      batchDate: batch?.payoutDate ?? null,
    };
  });

  // Totaux : ce qui est déjà dans un lot, ce qui attend le lot de
  // demain matin, et ce qui a été viré.
  const pendingKept = rides
    .filter((r) => r.moneyStatus !== 'especes' && !r.batchStatus)
    .reduce((s, r) => s + r.kept, 0);
  const inBatchKept = rides
    .filter((r) => r.batchStatus && r.batchStatus !== 'vire')
    .reduce((s, r) => s + r.kept, 0);

  return NextResponse.json({
    ok: true,
    rides,
    batches: (batches ?? []).map((b) => ({
      id: b.id,
      date: b.payout_date,
      ridesCount: b.rides_count,
      driverShare: b.driver_share_fcfa,
      platformFunded: b.platform_funded_fcfa,
      status: b.status,
      rail: b.rail,
      reference: b.reference,
      paidAt: b.paid_at,
    })),
    totals: { pendingKept, inBatchKept },
  });
}
