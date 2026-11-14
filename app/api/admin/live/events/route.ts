import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getLiveEvents, requireLiveAdmin } from '@/lib/live-admin';

/** GET /api/admin/live/events — flux d'événements (admin) :
 *  ?before=ISO&limit=30 — pagination par date (événements strictement
 *  antérieurs à `before`). Même construction que l'instantané.
 *  Lecture seule. */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireLiveAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const before = url.searchParams.get('before') ?? undefined;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30) || 30));
  const beforeISO =
    before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : undefined;
  const events = await getLiveEvents(auth.supabase, beforeISO, limit);
  return NextResponse.json({ ok: true, events });
}
