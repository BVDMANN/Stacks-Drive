import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { joinAirportQueue, leaveAirportQueue, getAirportQueuePosition, isAtAirport } from '@/lib/airport-queue';

const QueueSchema = z.object({ action: z.enum(['join', 'leave']) });

async function requireDriver() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté.', status: 401 as const };
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_verified, is_online, current_area, last_lat, last_lng')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return { error: 'Seuls les chauffeurs rejoignent la file aéroport.', status: 403 as const };
  }
  return { supabase, user, profile };
}

/** GET /api/driver/airport-queue — position du chauffeur dans la
 *  file aéroport (null = pas dans la file). */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireDriver();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const position = await getAirportQueuePosition(auth.supabase, auth.user.id);
  return NextResponse.json({ ok: true, position });
}

/** POST /api/driver/airport-queue — rejoindre / quitter la file.
 *  Rejoindre exige d'être en ligne, vérifié et physiquement à
 *  l'aéroport. Sortie possible à tout moment. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireDriver();
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await request.json().catch(() => null);
  const parsed = QueueSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Action invalide.' }, { status: 400 });
  if (parsed.data.action === 'leave') {
    await leaveAirportQueue(auth.supabase, auth.user.id);
    return NextResponse.json({ ok: true, position: null });
  }
  if (!auth.profile.is_verified || !auth.profile.is_online) {
    return NextResponse.json(
      { error: 'Mets-toi en ligne avec un compte vérifié pour rejoindre la file.' },
      { status: 403 }
    );
  }
  const profile = auth.profile as {
    current_area: string | null;
    last_lat: number | null;
    last_lng: number | null;
  };
  if (
    !isAtAirport({
      lat: profile.last_lat,
      lng: profile.last_lng,
      currentArea: profile.current_area,
    })
  ) {
    return NextResponse.json(
      { error: 'Tu n’es pas à l’aéroport — la file est réservée aux chauffeurs présents sur place.' },
      { status: 400 }
    );
  }
  const ok = await joinAirportQueue(auth.supabase, auth.user.id);
  if (!ok) {
    return NextResponse.json(
      { error: 'File aéroport non activée sur ce déploiement (migration v2.34 à appliquer).' },
      { status: 503 }
    );
  }
  const position = await getAirportQueuePosition(auth.supabase, auth.user.id);
  return NextResponse.json({ ok: true, position });
}
