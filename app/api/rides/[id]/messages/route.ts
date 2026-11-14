import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { mapRideMessageRow, type RideMessageRow } from '@/lib/db-types';

type Ctx = { params: Promise<{ id: string }> };

/** Statuts pendant lesquels la messagerie de course est ouverte : entre
 *  l'acceptation et la fin du trajet. Après (terminée / annulée), la
 *  messagerie est fermée — elle n'existe que pour la course en cours. */
const CHAT_OPEN_STATUSES = ['acceptee', 'en_cours'];

const MessageSchema = z.object({
  body: z.string().trim().min(1).max(500),
});

/** Charge la course et vérifie que l'utilisateur en est une partie
 *  (passager ou chauffeur assigné). Retourne le rôle de l'utilisateur
 *  dans la course. */
async function loadRideForChat(
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

/** GET /api/rides/[id]/messages — fil de discussion de la course.
 *  Lecture réservée à ses deux parties, pendant qu'elle est en cours.
 *  Si la table n'existe pas encore (migration v2.10 non appliquée),
 *  on renvoie une liste vide avec `unavailable: true` — jamais de crash. */
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
  const loaded = await loadRideForChat(supabase, id, user.id);
  if ('error' in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (!CHAT_OPEN_STATUSES.includes(loaded.ride.status)) {
    return NextResponse.json(
      { error: 'La messagerie est fermée pour cette course.' },
      { status: 403 }
    );
  }
  const { data, error } = await supabase
    .from('ride_messages')
    .select('*')
    .eq('ride_id', id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) {
    // Table absente (migration v2.10 non appliquée) : liste vide, le
    // client affiche que la messagerie n'est pas activée.
    if (error.code === '42P01') {
      return NextResponse.json({ ok: true, messages: [], unavailable: true });
    }
    console.error('[api/rides/[id]/messages]', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    messages: ((data ?? []) as RideMessageRow[]).map(mapRideMessageRow),
  });
}

/** POST /api/rides/[id]/messages — envoyer un message (500 caractères
 *  max). L'expéditeur est toujours l'utilisateur connecté ; aucun
 *  numéro de téléphone n'est exposé, l'échange passe par l'app. */
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
  const parsed = MessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Message invalide (1 à 500 caractères).' },
      { status: 400 }
    );
  }
  const loaded = await loadRideForChat(supabase, id, user.id);
  if ('error' in loaded) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  if (!CHAT_OPEN_STATUSES.includes(loaded.ride.status)) {
    return NextResponse.json(
      { error: 'La messagerie est fermée pour cette course.' },
      { status: 403 }
    );
  }
  const { data, error } = await supabase
    .from('ride_messages')
    .insert({
      ride_id: id,
      sender_id: user.id,
      sender_role: loaded.role,
      body: parsed.data.body,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'La messagerie n’est pas encore activée — la migration v2.10 doit être appliquée dans Supabase.' },
        { status: 503 }
      );
    }
    console.error('[api/rides/[id]/messages]', error.message);
    return NextResponse.json({ error: 'Envoi impossible.' }, { status: 500 });
  }
  return NextResponse.json(
    { ok: true, message: mapRideMessageRow(data as RideMessageRow) },
    { status: 201 }
  );
}
