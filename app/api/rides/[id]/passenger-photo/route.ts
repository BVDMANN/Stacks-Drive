import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getRideRequestById } from '@/lib/rides';

/** GET /api/rides/[id]/passenger-photo — la photo du passager, pour
 *  le chauffeur assigné UNIQUEMENT pendant la course (v2.49, règle
 *  v2.20). URL signée 1 h, générée côté serveur ; la politique de
 *  stockage « Assigned driver reads passenger photo during the ride »
 *  (migration v2.49a) borne l'accès aux statuts acceptee / en_cours —
 *  dès la course terminée ou annulée, la photo n'est plus lisible.
 *  Sans migration : 404 (colonne absente = pas de photo). */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const found = await getRideRequestById(id, user.id);
  if (!found) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  const { row } = found;
  if (row.driver_id !== user.id) {
    return NextResponse.json(
      { error: 'La photo du passager n’est visible que par le chauffeur de la course.' },
      { status: 403 }
    );
  }
  if (row.status !== 'acceptee' && row.status !== 'en_cours') {
    return NextResponse.json(
      { error: 'La photo du passager n’est visible que pendant la course.' },
      { status: 403 }
    );
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('photo_url')
    .eq('id', row.passenger_id)
    .single();
  if (error) {
    // Colonne absente (migration v2.49a non appliquée) = pas de photo.
    return NextResponse.json({ error: 'Aucune photo.' }, { status: 404 });
  }
  const photoUrl = (data as { photo_url?: string | null })?.photo_url ?? null;
  if (!photoUrl) {
    return NextResponse.json({ error: 'Aucune photo.' }, { status: 404 });
  }
  const { data: signed, error: signError } = await supabase.storage
    .from('passenger-photos')
    .createSignedUrl(photoUrl, 3600);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: 'Photo indisponible pour le moment.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
