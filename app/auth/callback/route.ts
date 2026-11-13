import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
