import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/** PATCH /api/admin/map-reports/[id] — l'admin change le statut
 *  d'un signalement « erreur de carte » (v2.49) : en_cours, resolu
 *  ou rejete. Même mécanisme que les tickets de vérification. */

const STATUSES = ['en_cours', 'resolu', 'rejete'] as const;

export async function PATCH(
  request: NextRequest,
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (profile?.is_admin !== true) {
    return NextResponse.json({ error: 'Réservé aux administrateurs.' }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
  const status = typeof body?.status === 'string' && (STATUSES as readonly string[]).includes(body.status)
    ? body.status
    : null;
  if (!status) {
    return NextResponse.json({ error: 'Statut invalide.' }, { status: 400 });
  }
  const { error } = await supabase
    .from('map_reports')
    .update({ status, resolved_by: user.id, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) {
    if (error.code === '42703' || error.code === '42P01') {
      return NextResponse.json(
        { error: 'La base n’est pas encore à jour pour les signalements de carte.' },
        { status: 503 }
      );
    }
    console.error('[api/admin/map-reports]', error.message);
    return NextResponse.json({ error: 'Mise à jour impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
