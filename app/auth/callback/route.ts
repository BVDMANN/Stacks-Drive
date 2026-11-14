import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { maybeSendWelcomeEmail } from '@/lib/email';

/** Échange le code reçu par e-mail (vérification d'inscription ou
 *  réinitialisation de mot de passe) contre une session, puis redirige. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (!code) {
    return NextResponse.redirect(`${origin}/connexion?error=lien-invalide`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      `${origin}/connexion?error=verification-impossible`
    );
  }

  // Bienvenue passager (v2.24) : première connexion confirmée —
  // dédupliquée en base, jamais renvoyée ensuite.
  try {
    const {
      data: { user: confirmedUser },
    } = await supabase.auth.getUser();
    if (confirmedUser?.email) {
      const { data: confirmedProfile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', confirmedUser.id)
        .single();
      if (confirmedProfile) {
        await maybeSendWelcomeEmail(supabase, {
          id: confirmedUser.id,
          email: confirmedUser.email,
          fullName: (confirmedProfile as { full_name?: string | null }).full_name ?? null,
          role: (confirmedProfile as { role?: string }).role ?? 'passager',
        });
      }
    }
  } catch {
    // La bienvenue ne bloque jamais la connexion.
  }

  // Destination : paramètre next (chemin interne uniquement), sinon selon le rôle.
  let destination = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (destination === '/') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
      .single();
    if (profile?.role === 'chauffeur') destination = '/tableau-de-bord';
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
