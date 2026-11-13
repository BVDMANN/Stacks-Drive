import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 Mo par fichier

/** POST /api/verification — le chauffeur envoie son selfie + sa pièce
 *  d'identité (CNI, passeport ou permis). Les fichiers partent dans le
 *  bucket privé `driver-documents` ; le statut passe à « en_attente » et
 *  l'admin valide ou refuse depuis /admin. */
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, verification_status')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'La vérification concerne les comptes chauffeurs.' },
      { status: 403 }
    );
  }
  if (profile.verification_status === 'verifie') {
    return NextResponse.json({ error: 'Ton compte est déjà vérifié.' }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
  }
  const selfie = form.get('selfie');
  const document = form.get('document');
  const documentType = form.get('documentType');
  if (!(selfie instanceof File) || !(document instanceof File)) {
    return NextResponse.json(
      { error: 'Envoie ton selfie ET ta pièce d’identité.' },
      { status: 400 }
    );
  }
  if (!['cni', 'passeport', 'permis'].includes(String(documentType))) {
    return NextResponse.json(
      { error: 'Choisis le type de pièce : CNI, passeport ou permis.' },
      { status: 400 }
    );
  }
  for (const [label, file] of [
    ['selfie', selfie],
    ['pièce d’identité', document],
  ] as const) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: `Le fichier « ${label} » doit être une image (photo).` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Le fichier « ${label} » dépasse 5 Mo.` },
        { status: 400 }
      );
    }
  }

  const stamp = Date.now();
  const selfieExt = selfie.name.split('.').pop()?.toLowerCase() || 'jpg';
  const docExt = document.name.split('.').pop()?.toLowerCase() || 'jpg';
  const selfiePath = `${user.id}/selfie-${stamp}.${selfieExt}`;
  const docPath = `${user.id}/document-${stamp}.${docExt}`;

  const { error: selfieError } = await supabase.storage
    .from('driver-documents')
    .upload(selfiePath, selfie, { contentType: selfie.type, upsert: false });
  if (selfieError) {
    console.error('[api/verification]', selfieError.message);
    return NextResponse.json(
      { error: 'Envoi du selfie impossible. Réessaie.' },
      { status: 500 }
    );
  }
  const { error: docError } = await supabase.storage
    .from('driver-documents')
    .upload(docPath, document, { contentType: document.type, upsert: false });
  if (docError) {
    console.error('[api/verification]', docError.message);
    await supabase.storage.from('driver-documents').remove([selfiePath]);
    return NextResponse.json(
      { error: 'Envoi de la pièce impossible. Réessaie.' },
      { status: 500 }
    );
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      selfie_url: selfiePath,
      id_document_url: docPath,
      id_document_type: String(documentType),
      verification_status: 'en_attente',
      verification_note: null,
    })
    .eq('id', user.id);
  if (error) {
    console.error('[api/verification]', error.message);
    await supabase.storage.from('driver-documents').remove([selfiePath, docPath]);
    return NextResponse.json(
      { error: 'Enregistrement impossible. Réessaie.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
