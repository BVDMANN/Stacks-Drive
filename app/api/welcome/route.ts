import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { maybeSendWelcomeEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

/** POST /api/welcome — e-mail de bienvenue passager (v2.24).
 *
 *  Appelé une fois par session navigateur depuis l'accueil (drapeau
 *  sessionStorage côté client) : couvre l'inscription sans
 *  confirmation e-mail, qui ne passe pas par /auth/callback. Le
 *  flux avec confirmation est couvert côté serveur par le callback.
 *  L'envoi lui-même est dédupliqué en base
 *  (`profiles.welcome_email_sent_at`) : rappeler la route ne
 *  renvoie jamais un deuxième e-mail. */
export async function POST() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();
  if (!profile) {
    return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
  }
  const sent = await maybeSendWelcomeEmail(supabase, {
    id: user.id,
    email: user.email,
    fullName: (profile as { full_name?: string | null }).full_name ?? null,
    role: (profile as { role?: string }).role ?? 'passager',
  });
  return NextResponse.json({ ok: true, sent });
}
