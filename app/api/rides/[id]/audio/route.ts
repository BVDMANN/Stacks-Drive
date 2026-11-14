import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { TRIP_AUDIO_RETENTION_DAYS } from '@/lib/trip-audio';

type Ctx = { params: Promise<{ id: string }> };

const AudioUploadSchema = z.object({
  /** Chiffré AES-GCM concaténé (base64) — morceaux de 10 s. */
  encryptedBlobB64: z.string().min(1).max(5_000_000),
  /** Clé AES brute (base64) — transmise UNIQUEMENT parce qu'un litige est ouvert. */
  keyB64: z.string().min(1).max(500),
  disputeId: z.string().uuid(),
});

/** GET /api/rides/[id]/audio — métadonnées de l'enregistrement
 *  (présence, date d'envoi, expiration). L'admin seul reçoit le
 *  chiffré + la clé, et seulement si un litige est ouvert sur la
 *  course — jamais écouté sans litige. */
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
  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id')
    .eq('id', id)
    .single();
  if (!ride) return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  const { data: viewer } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  const isParty = ride.passenger_id === user.id || ride.driver_id === user.id;
  if (!isParty && !viewer?.is_admin) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }
  const { data } = await supabase
    .from('trip_audio')
    .select('ride_id, dispute_id, uploaded_at, expires_at, encrypted_blob, key_b64')
    .eq('ride_id', id)
    .single();
  if (!data) return NextResponse.json({ ok: true, hasAudio: false });
  const openDispute = data.dispute_id !== null;
  return NextResponse.json({
    ok: true,
    hasAudio: true,
    disputeId: data.dispute_id,
    uploadedAt: data.uploaded_at,
    expiresAt: data.expires_at,
    // Chiffré + clé uniquement pour l'admin, avec litige ouvert.
    encryptedBlobB64: viewer?.is_admin && openDispute ? data.encrypted_blob : null,
    keyB64: viewer?.is_admin && openDispute ? data.key_b64 : null,
  });
}

/** POST /api/rides/[id]/audio — envoi de l'enregistrement chiffré,
 *  UNIQUEMENT quand un litige est ouvert sur la course (par une des
 *  deux parties). Sans litige ouvert : refusé. L'audio n'est jamais
 *  écouté sans litige ; il est supprimé après 7 jours sans litige. */
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
  const body = await request.json().catch(() => null);
  const parsed = AudioUploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enregistrement invalide.' }, { status: 400 });
  }
  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, status')
    .eq('id', id)
    .single();
  if (!ride) return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  if (ride.passenger_id !== user.id && ride.driver_id !== user.id) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }
  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, status')
    .eq('id', parsed.data.disputeId)
    .eq('ride_id', id)
    .in('status', ['ouvert', 'en_cours'])
    .single();
  if (!dispute) {
    return NextResponse.json(
      { error: 'Aucun litige ouvert sur cette course — l’audio n’est envoyé qu’en cas de litige.' },
      { status: 400 }
    );
  }
  const expiresAt = new Date(Date.now() + TRIP_AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('trip_audio').upsert(
    {
      ride_id: id,
      encrypted_blob: parsed.data.encryptedBlobB64,
      key_b64: parsed.data.keyB64,
      dispute_id: parsed.data.disputeId,
      uploaded_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: 'ride_id' }
  );
  if (error) {
    if (error.code === '42P01' || error.code === '42703') {
      return NextResponse.json(
        { error: 'L’audio de trajet n’est pas encore activé sur ce déploiement (migration v2.34 à appliquer).' },
        { status: 503 }
      );
    }
    console.error('[api/rides/[id]/audio]', error.message);
    return NextResponse.json({ error: 'Envoi impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, expiresAt });
}
