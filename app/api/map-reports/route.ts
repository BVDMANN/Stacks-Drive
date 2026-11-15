import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const KINDS = ['lieu_manquant', 'quartier_mal_place', 'erreur_adresse', 'autre'] as const;
type MapReportKind = (typeof KINDS)[number];

/** POST /api/map-reports — « Signaler une erreur de carte » (v2.49) :
 *  lieu manquant, quartier mal placé, erreur d'adresse, autre.
 *  Le signalement crée un vrai ticket visible dans /admin (même
 *  mécanisme que les tickets de vérification). Sans la migration
 *  v2.49b, la route répond 503 explicite. */

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
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (profile?.is_admin === true) {
    return NextResponse.json(
      { error: 'Le compte administrateur ne dépose pas de signalement.', code: 'admin_not_allowed' },
      { status: 403 }
    );
  }
  const body = (await request.json().catch(() => null)) as {
    kind?: unknown;
    title?: unknown;
    details?: unknown;
  } | null;
  if (!body) {
    return NextResponse.json({ error: 'Données invalides.' }, { status: 400 });
  }
  const kind = typeof body.kind === 'string' && (KINDS as readonly string[]).includes(body.kind)
    ? (body.kind as MapReportKind)
    : null;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const details = typeof body.details === 'string' ? body.details.trim() : '';
  if (!kind) {
    return NextResponse.json({ error: 'Choisis le type de signalement.' }, { status: 400 });
  }
  if (title.length < 5 || title.length > 120) {
    return NextResponse.json(
      { error: 'Le titre doit faire entre 5 et 120 caractères.' },
      { status: 400 }
    );
  }
  if (details.length < 10 || details.length > 2000) {
    return NextResponse.json(
      { error: 'Décris l’erreur en 10 caractères minimum (2000 maximum).' },
      { status: 400 }
    );
  }
  const { data, error } = await supabase
    .from('map_reports')
    .insert({ user_id: user.id, kind, title, details })
    .select('id')
    .single();
  if (error) {
    if (error.code === '42703' || error.code === '42P01') {
      return NextResponse.json(
        { error: 'La base n’est pas encore à jour pour les signalements de carte — réessaie après la prochaine mise à jour.' },
        { status: 503 }
      );
    }
    console.error('[api/map-reports]', error.message);
    return NextResponse.json({ error: 'Envoi du signalement impossible. Réessaie.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: (data as { id: string }).id });
}
