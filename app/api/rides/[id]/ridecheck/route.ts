import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  answerRideCheck,
  evaluateRideCheckSample,
  getRideCheckState,
  sweepRideCheckNoResponse,
} from '@/lib/ridecheck-server';
import { RIDECHECK_SIGNAL_LABELS, type RideCheckSignal } from '@/lib/ridecheck';

type Ctx = { params: Promise<{ id: string }> };

const SampleSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const CheckinSchema = z.object({
  signal: z.enum(['long_stop', 'deviation', 'long_ride']),
  answer: z.enum(['ok', 'problem']),
});

async function loadRide(supabase: Awaited<ReturnType<typeof createClient>>, id: string, userId: string) {
  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, status, pickup, destination, started_at, distance_km, duration_min')
    .eq('id', id)
    .single();
  if (!ride) return { error: 'Course introuvable.', status: 404 as const };
  const isPassenger = ride.passenger_id === userId;
  const isDriver = ride.driver_id === userId;
  if (!isPassenger && !isDriver) return { error: 'Non autorisé.', status: 403 as const };
  return {
    ride: ride as {
      id: string;
      passenger_id: string | null;
      driver_id: string | null;
      status: string;
      pickup: string;
      destination: string;
      started_at: string | null;
      distance_km: number | null;
      duration_min: number | null;
    },
    role: (isPassenger ? 'passager' : 'chauffeur') as 'passager' | 'chauffeur',
  };
}

/** GET /api/rides/[id]/ridecheck — état des check-ins (passager ou
 *  chauffeur de la course). Le sondage passager déclenche aussi le
 *  balayage « sans réponse » (3 min) — sans nouveau cron. */
export async function GET(_request: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const loaded = await loadRide(supabase, id, user.id);
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  if (loaded.ride.status === 'en_cours') {
    await sweepRideCheckNoResponse(supabase, loaded.ride).catch(() => undefined);
  }
  const state = await getRideCheckState(supabase, id);
  return NextResponse.json({ ok: true, ...state });
}

/** POST /api/rides/[id]/ridecheck — deux actions :
 *  - {lat, lng} : le chauffeur partage sa position pendant la course
 *    en cours (évaluation RideCheck, ~toutes les 30 s) ;
 *  - {signal, answer} : le passager répond au check-in (« Oui » /
 *    « Problème »). */
export async function POST(request: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const loaded = await loadRide(supabase, id, user.id);
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  const body = await request.json().catch(() => null);

  const checkin = CheckinSchema.safeParse(body);
  if (checkin.success) {
    if (loaded.role !== 'passager') {
      return NextResponse.json({ error: 'Seul le passager répond au check-in.' }, { status: 403 });
    }
    const res = await answerRideCheck(
      supabase,
      loaded.ride,
      checkin.data.signal as RideCheckSignal,
      checkin.data.answer
    );
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const sample = SampleSchema.safeParse(body);
  if (!sample.success) {
    return NextResponse.json({ error: 'Position ou réponse invalide.' }, { status: 400 });
  }
  if (loaded.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'Seul le chauffeur de la course partage sa position RideCheck.' },
      { status: 403 }
    );
  }
  if (loaded.ride.status !== 'en_cours') {
    return NextResponse.json(
      { error: 'RideCheck ne s’applique que pendant une course en cours.' },
      { status: 400 }
    );
  }
  const { confirmedSignals } = await evaluateRideCheckSample(supabase, loaded.ride, sample.data);
  return NextResponse.json({
    ok: true,
    checkinRequested: confirmedSignals.map((s) => ({
      signal: s,
      label: RIDECHECK_SIGNAL_LABELS[s],
    })),
  });
}
