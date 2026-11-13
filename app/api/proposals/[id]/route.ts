import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { splitFare } from '@/lib/commission';

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
    .select('id, ride_id, driver_id, proposed_price, seats_left, first_stop, status, expires_at')
    .eq('id', id)
    .single();
  if (!proposal) {
    return NextResponse.json({ error: 'Proposition introuvable.' }, { status: 404 });
  }

  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, status')
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
  const split = loyaltyFree
    ? { platformFee: price, driverShare: price }
    : splitFare(price);

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

  // Les autres propositions en attente sont refusées.
  await supabase
    .from('ride_proposals')
    .update({ status: 'declined' })
    .eq('ride_id', ride.id)
    .eq('status', 'pending')
    .neq('id', id);

  return NextResponse.json({ ok: true, loyaltyFree });
}
