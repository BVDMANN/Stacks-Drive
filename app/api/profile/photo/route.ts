import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 Mo
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp'];
const BUCKET = 'passenger-photos';

/** Photo de profil passager (v2.49) : optionnelle, montrée au
 *  chauffeur assigné UNIQUEMENT pendant la course (règle v2.20 —
 *  la lecture passe par la route /api/rides/[id]/passenger-photo
 *  et la politique de stockage dédiée, jamais par un lien direct).
 *
 *  La colonne profiles.photo_url et le bucket sont créés par la
 *  migration v2.49a. Sans elle, chaque route répond 503 explicite
 *  (« base pas à jour ») et l'upload est refusé proprement —
 *  jamais de crash. */

function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703';
}

async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

/** GET /api/profile/photo — le passager lit sa propre photo
 *  (URL signée 1 h) ; hasPhoto sert à l'indicateur de complétion. */
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
  const { data, error } = await supabase
    .from('profiles')
    .select('photo_url')
    .eq('id', user.id)
    .single();
  if (error) {
    if (isMissingColumn(error)) {
      return NextResponse.json({ ok: true, hasPhoto: false, baseOutdated: true });
    }
    return NextResponse.json({ error: 'Lecture de la photo impossible.' }, { status: 500 });
  }
  const photoUrl = (data as { photo_url?: string | null })?.photo_url ?? null;
  if (!photoUrl) return NextResponse.json({ ok: true, hasPhoto: false });
  const { data: signed, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(photoUrl, 3600);
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ ok: true, hasPhoto: true, url: null });
  }
  return NextResponse.json({ ok: true, hasPhoto: true, url: signed.signedUrl });
}

/** POST /api/profile/photo — le passager envoie sa photo
 *  (image ≤ 5 Mo). L'ancienne photo est supprimée après le succès. */
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
  const profile = await getProfile(supabase, user.id);
  if (profile?.is_admin === true) {
    return NextResponse.json(
      { error: 'Le compte administrateur n’a pas de photo de profil passager.', code: 'admin_not_allowed' },
      { status: 403 }
    );
  }
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
  }
  const file = form.get('photo');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envoie une photo.' }, { status: 400 });
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Le fichier doit être une image (photo).' }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: 'La photo dépasse 5 Mo.' }, { status: 400 });
  }
  const ext = (file.name.split('.').pop()?.toLowerCase() || 'jpg');
  const safeExt = ALLOWED_EXT.includes(ext) ? ext : 'jpg';
  const path = `${user.id}/photo-${Date.now()}.${safeExt}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error('[api/profile/photo]', uploadError.message);
    return NextResponse.json(
      { error: 'Envoi de la photo impossible. Réessaie.' },
      { status: 500 }
    );
  }
  const { data: old } = await supabase
    .from('profiles')
    .select('photo_url')
    .eq('id', user.id)
    .single();
  const oldPath = (old as { photo_url?: string | null } | null)?.photo_url ?? null;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ photo_url: path })
    .eq('id', user.id);
  if (updateError) {
    await supabase.storage.from(BUCKET).remove([path]);
    if (isMissingColumn(updateError)) {
      return NextResponse.json(
        { error: 'La base n’est pas encore à jour pour les photos de profil — réessaie après la prochaine mise à jour.' },
        { status: 503 }
      );
    }
    console.error('[api/profile/photo]', updateError.message);
    return NextResponse.json({ error: 'Enregistrement de la photo impossible.' }, { status: 500 });
  }
  if (oldPath && oldPath !== path) {
    await supabase.storage.from(BUCKET).remove([oldPath]);
  }
  return NextResponse.json({ ok: true, hasPhoto: true });
}

/** DELETE /api/profile/photo — le passager retire sa photo. */
export async function DELETE() {
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
  const { data, error } = await supabase
    .from('profiles')
    .select('photo_url')
    .eq('id', user.id)
    .single();
  if (error) {
    if (isMissingColumn(error)) {
      return NextResponse.json({ ok: true, hasPhoto: false, baseOutdated: true });
    }
    return NextResponse.json({ error: 'Lecture de la photo impossible.' }, { status: 500 });
  }
  const photoUrl = (data as { photo_url?: string | null })?.photo_url ?? null;
  if (photoUrl) {
    await supabase.storage.from(BUCKET).remove([photoUrl]);
    await supabase.from('profiles').update({ photo_url: null }).eq('id', user.id);
  }
  return NextResponse.json({ ok: true, hasPhoto: false });
}
