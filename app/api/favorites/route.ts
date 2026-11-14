import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { addFavoriteDriver, listFavoriteDrivers, removeFavoriteDriver } from '@/lib/favorites';

const FavoriteSchema = z.object({ driverId: z.string().uuid() });

/** GET /api/favorites — chauffeurs favoris du passager connecté.
 *  Visible uniquement pour le passager concerné. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const favorites = await listFavoriteDrivers(supabase, user.id);
  return NextResponse.json({ ok: true, favorites });
}

/** POST /api/favorites — ajouter un chauffeur aux favoris. Le
 *  chauffeur doit avoir déjà conduit le passager (course terminée)
 *  — un favori ne se choisit pas au hasard. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = FavoriteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Chauffeur invalide.' }, { status: 400 });
  if (parsed.data.driverId === user.id) {
    return NextResponse.json({ error: 'Tu ne peux pas te mettre en favori.' }, { status: 400 });
  }
  const { data: past } = await supabase
    .from('rides')
    .select('id')
    .eq('passenger_id', user.id)
    .eq('driver_id', parsed.data.driverId)
    .eq('status', 'terminee')
    .limit(1);
  if (!past || past.length === 0) {
    return NextResponse.json(
      { error: 'Ce chauffeur ne t’a pas encore conduit(e) — les favoris se choisissent dans l’historique.' },
      { status: 400 }
    );
  }
  const ok = await addFavoriteDriver(supabase, user.id, parsed.data.driverId);
  if (!ok) {
    return NextResponse.json(
      { error: 'Favoris non activés sur ce déploiement (migration v2.34 à appliquer).' },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true });
}

/** DELETE /api/favorites — retirer un chauffeur des favoris. */
export async function DELETE(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const parsed = FavoriteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Chauffeur invalide.' }, { status: 400 });
  await removeFavoriteDriver(supabase, user.id, parsed.data.driverId);
  return NextResponse.json({ ok: true });
}
