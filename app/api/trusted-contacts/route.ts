import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { MAX_TRUSTED_CONTACTS } from '@/lib/trusted-contacts';

const ContactSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis.').max(120),
  phone: z.string().trim().min(8, 'Numéro de téléphone invalide.').max(30),
  email: z.string().trim().email('Adresse e-mail invalide.').max(120).optional().nullable(),
});

const DeleteSchema = z.object({ id: z.string().uuid() });

/** GET /api/trusted-contacts — mes contacts de confiance (v2.23).
 *  Lecture réservée au propriétaire ; [] si la migration v2.23
 *  n'est pas encore appliquée. */
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
    .from('trusted_contacts')
    .select('id, user_id, name, phone, email, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });
  if (error) {
    if (error.code === '42P01') return NextResponse.json({ ok: true, contacts: [], unavailable: true });
    console.error('[api/trusted-contacts]', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contacts: data ?? [] });
}

/** POST /api/trusted-contacts — ajouter un contact (max 5).
 *  Le serveur seul écrit user_id = l'utilisateur connecté. */
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
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Contact invalide.' },
      { status: 400 }
    );
  }
  const { count } = await supabase
    .from('trusted_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);
  if ((count ?? 0) >= MAX_TRUSTED_CONTACTS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_TRUSTED_CONTACTS} contacts de confiance.` },
      { status: 400 }
    );
  }
  const { data, error } = await supabase
    .from('trusted_contacts')
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
    })
    .select('id, user_id, name, phone, email, created_at')
    .single();
  if (error) {
    if (error.code === '42P01') {
      return NextResponse.json(
        { error: 'Les contacts de confiance ne sont pas encore activés — la migration v2.23 doit être appliquée dans Supabase.' },
        { status: 503 }
      );
    }
    console.error('[api/trusted-contacts]', error.message);
    return NextResponse.json({ error: 'Ajout impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contact: data }, { status: 201 });
}

/** DELETE /api/trusted-contacts — retirer un contact (le sien). */
export async function DELETE(request: NextRequest) {
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
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Contact invalide.' }, { status: 400 });
  }
  const { error } = await supabase
    .from('trusted_contacts')
    .delete()
    .eq('id', parsed.data.id)
    .eq('user_id', user.id);
  if (error) {
    console.error('[api/trusted-contacts]', error.message);
    return NextResponse.json({ error: 'Suppression impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
