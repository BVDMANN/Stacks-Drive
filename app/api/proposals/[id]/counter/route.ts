import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { validateProposedPrice } from '@/lib/fare-guard';

type Ctx = { params: Promise<{ id: string }> };

const CounterSchema = z.object({
  counterPrice: z.number().int().min(400, 'Ton prix doit être entre 400 et 50 000 FCFA.').max(50000, 'Ton prix doit être entre 400 et 50 000 FCFA.'),
});

/** POST /api/proposals/[id]/counter — le passager contre-propose un prix
 *  sur une proposition de chauffeur (v2.11).
 *
 *  Modèle exact (décision du propriétaire, 14/11/2026) : le prix final se
 *  décide entre le passager et le chauffeur. Le chauffeur voit la
 *  contre-proposition dans son tableau de bord : il peut l'accepter
 *  telle quelle (le prix est alors figé) ou proposer un autre prix.
 *  La contre-proposition relance le compteur de 60 s — le chauffeur
 *  a une minute pour répondre. Le prix est validé côté serveur contre
 *  les bornes absolues uniquement (400–50 000 FCFA). */
export async function POST(request: NextRequest, { params }: Ctx) {
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
  const parsed = CounterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Prix invalide.' },
      { status: 400 }
    );
  }
  const counterPrice = parsed.data.counterPrice;

  const fareCheck = validateProposedPrice(counterPrice);
  if (!fareCheck.ok) {
    return NextResponse.json({ error: fareCheck.message }, { status: 400 });
  }

  const { data: proposal } = await supabase
    .from('ride_proposals')
    .select('id, ride_id, driver_id, status, expires_at, proposed_price')
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
  if (counterPrice === proposal.proposed_price) {
    return NextResponse.json(
      { error: 'C’est déjà le prix proposé par le chauffeur — accepte-le directement.' },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + 60 * 1000).toISOString();
  const { error } = await supabase
    .from('ride_proposals')
    .update({ counter_price: counterPrice, expires_at: expiresAt })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) {
    // Migration v2.10 pas encore appliquée (colonne counter_price
    // absente) : la contre-proposition n'est pas enregistrable.
    if (error.code === '42703') {
      return NextResponse.json(
        { error: 'Contre-proposition indisponible pour le moment (mise à jour en cours).' },
        { status: 503 }
      );
    }
    console.error('[api/proposals/[id]/counter]', error.message);
    return NextResponse.json({ error: 'Contre-proposition impossible.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, counterPrice, expiresAt }, { status: 201 });
}
