import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDriverAvailability } from '@/lib/seats';

const SeatsSchema = z.object({
  /** Places libres déclarées (0 à 9, jamais au-dessus de la capacité). */
  freeSeats: z.number().int().min(0).max(9),
});

/** GET /api/driver/seats — disponibilité du chauffeur connecté :
 *  capacité, places libres, courses en cours et statut dérivé
 *  (Vide / En course / Plein). Le chauffeur voit son statut, l'admin
 *  le voit dans /admin (getAdminStats). */
export async function GET() {
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
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'Seuls les chauffeurs déclarent des places libres.' },
      { status: 403 }
    );
  }
  const availability = await getDriverAvailability(supabase, user.id);
  return NextResponse.json({ ok: true, ...availability });
}

/** PATCH /api/driver/seats — le chauffeur déclare ses places libres
 *  (pop-up à la mise en ligne, bouton « Mes places » à tout moment).
 *  Validé côté serveur : 0 à 9, jamais au-dessus de la capacité du
 *  véhicule. Un chauffeur ne modifie que SES places (user.id). */
export async function PATCH(request: NextRequest) {
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
    .select('role, seats, free_seats')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'Seuls les chauffeurs déclarent des places libres.' },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => null);
  const parsed = SeatsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const capacity = (profile as { seats?: number | null }).seats ?? null;
  if (capacity === null) {
    return NextResponse.json(
      { error: 'Déclare d’abord ton véhicule (capacité) dans Mon compte.' },
      { status: 400 }
    );
  }
  if (parsed.data.freeSeats > capacity) {
    return NextResponse.json(
      { error: `Ton véhicule a ${capacity} place${capacity > 1 ? 's' : ''} : tu ne peux pas déclarer plus de places libres.` },
      { status: 400 }
    );
  }
  const { error } = await supabase
    .from('profiles')
    .update({ free_seats: parsed.data.freeSeats })
    .eq('id', user.id);
  if (error) {
    // Migration v2.19 pas encore appliquée : la colonne n'existe pas.
    if (error.code === '42703') {
      return NextResponse.json(
        { error: 'Les places libres ne sont pas encore activées (migration v2.19 à appliquer dans Supabase).' },
        { status: 503 }
      );
    }
    console.error('[api/driver/seats]', error.message);
    return NextResponse.json(
      { error: 'Modification impossible pour le moment.' },
      { status: 500 }
    );
  }
  const availability = await getDriverAvailability(supabase, user.id);
  return NextResponse.json({ ok: true, ...availability });
}
