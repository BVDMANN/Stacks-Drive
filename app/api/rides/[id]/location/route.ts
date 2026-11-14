import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { mapDriverLocationRow, type DriverLocationRow } from '@/lib/db-types';

type Ctx = { params: Promise<{ id: string }> };

const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().int().min(0).max(100000).optional(),
});

/** Charge la course et le rôle de l'utilisateur (passager / chauffeur
 *  assigné). */
async function loadRideForTracking(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rideId: string,
  userId: string
) {
  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, status')
    .eq('id', rideId)
    .single();
  if (!ride) return { error: 'Course introuvable.', status: 404 as const };
  const isPassenger = ride.passenger_id === userId;
  const isDriver = ride.driver_id === userId;
  if (!isPassenger && !isDriver) {
    return { error: 'Non autorisé.', status: 403 as const };
  }
  return {
    ride: ride as { id: string; passenger_id: string | null; driver_id: string | null; status: string },
    role: (isPassenger ? 'passager' : 'chauffeur') as 'passager' | 'chauffeur',
  };
}

/** GET /api/rides/[id]/location — dernière position connue du chauffeur,
 *  pour le passager de LA course, uniquement quand la course est
 *  acceptée (avant le pickup). Après le pickup, le suivi s'arrête :
 *  on renvoie 403. Si la table n'existe pas encore (migration v2.10
 *  non appliquée), on renvoie `location: null` — jamais de crash. */
export async function GET(_request: NextRequest, { params }: Ctx) {
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
  const loaded = await loadRideForTracking(supabase, id, user.id);
  if ('error' in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (loaded.role !== 'passager') {
    return NextResponse.json(
      { error: 'Seul le passager de la course voit la position du chauffeur.' },
      { status: 403 }
    );
  }
  if (loaded.ride.status !== 'acceptee') {
    return NextResponse.json(
      { error: 'Suivi terminé — le chauffeur est arrivé au point de départ.' },
      { status: 403 }
    );
  }
  const { data, error } = await supabase
    .from('driver_locations')
    .select('*')
    .eq('ride_id', id)
    .single();
  if (error) {
    // Table absente (migration v2.10 non appliquée) ou aucune position
    // partagée pour l'instant : pas de position en direct.
    if (error.code === '42P01' || error.code === 'PGRST116') {
      return NextResponse.json({ ok: true, location: null });
    }
    console.error('[api/rides/[id]/location]', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    location: mapDriverLocationRow(data as DriverLocationRow),
  });
}

/** POST /api/rides/[id]/location — le chauffeur partage sa position
 *  (géolocalisation du navigateur, ~toutes les 10 s). Une seule ligne
 *  par course (upsert) : seule la dernière position est conservée.
 *  Refusé hors course acceptée — la position n'est JAMAIS partagée
 *  hors course acceptée. */
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
  const parsed = LocationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Position invalide.' },
      { status: 400 }
    );
  }
  const loaded = await loadRideForTracking(supabase, id, user.id);
  if ('error' in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (loaded.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'Seul le chauffeur de la course partage sa position.' },
      { status: 403 }
    );
  }
  if (loaded.ride.status !== 'acceptee') {
    return NextResponse.json(
      { error: 'Le partage de position s’arrête au point de départ.' },
      { status: 403 }
    );
  }
  const { error } = await supabase.from('driver_locations').upsert(
    {
      ride_id: id,
      driver_id: user.id,
      lat: parsed.data.lat,
      lng: parsed.data.lng,
      accuracy_m: parsed.data.accuracy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'ride_id' }
  );
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Le suivi n’est pas encore activé — la migration v2.10 doit être appliquée dans Supabase.' },
        { status: 503 }
      );
    }
    console.error('[api/rides/[id]/location]', error.message);
    return NextResponse.json({ error: 'Partage impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
