import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { POINTS_REDEEM_FREE_RIDES, POINTS_REDEEM_TARGET } from '@/lib/gamification';

/** GET /api/driver/points — solde de points du chauffeur connecté,
 *  progression vers l'échange et courses sans commission restantes.
 *  Lecture seule, calculée côté serveur depuis driver_points. */
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
    .select('role, free_rides_remaining')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'Cette page est réservée aux chauffeurs.' },
      { status: 403 }
    );
  }
  const { data: pointRows, error } = await supabase
    .from('driver_points')
    .select('points')
    .eq('driver_id', user.id);
  if (error) {
    // Migration v2.3 non appliquée : solde 0, jamais de crash.
    return NextResponse.json({
      ok: true,
      points: {
        balance: 0,
        target: POINTS_REDEEM_TARGET,
        freeRides: profile?.free_rides_remaining ?? 0,
        progress: 0,
        canRedeem: false,
        tablesReady: false,
      },
    });
  }
  const balance = (pointRows ?? []).reduce(
    (s: number, r: { points: number }) => s + (r.points ?? 0),
    0
  );
  return NextResponse.json({
    ok: true,
    points: {
      balance: Math.max(0, balance),
      target: POINTS_REDEEM_TARGET,
      freeRides: profile?.free_rides_remaining ?? 0,
      progress: Math.min(1, Math.max(0, balance) / POINTS_REDEEM_TARGET),
      canRedeem: balance >= POINTS_REDEEM_TARGET,
      tablesReady: true,
    },
  });
}

const RedeemSchema = z.object({
  action: z.literal('redeem'),
});

/** POST /api/driver/points { action: 'redeem' } — échanger 10 000 points
 *  contre 5 courses sans commission. L'échange est atomique côté base
 *  (fonction redeem_points_for_free_rides) : le solde est vérifié et
 *  débité en une seule transaction, jamais deux fois les mêmes points. */
export async function POST(request: NextRequest) {
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
  const body = await request.json().catch(() => null);
  const parsed = RedeemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Action invalide.' }, { status: 400 });
  }
  const { data, error } = await supabase.rpc('redeem_points_for_free_rides');
  if (error) {
    console.error('[api/driver/points]', error.message);
    return NextResponse.json(
      { error: 'Échange impossible pour le moment — la migration v2.3 doit être appliquée dans Supabase.' },
      { status: 503 }
    );
  }
  const result = data as { ok: boolean; error?: string; balance?: number; free_rides?: number } | null;
  if (!result?.ok) {
    return NextResponse.json(
      { error: result?.error ?? 'Échange impossible.', balance: result?.balance ?? null },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    balance: result.balance ?? 0,
    freeRides: result.free_rides ?? POINTS_REDEEM_FREE_RIDES,
    target: POINTS_REDEEM_TARGET,
  });
}
