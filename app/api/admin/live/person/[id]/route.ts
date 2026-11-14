import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getLivePersonDetail, requireLiveAdmin } from '@/lib/live-admin';

/** GET /api/admin/live/person/[id] — fiche d'une personne (admin) :
 *  profil complet, 30 dernières courses, argent (dette = commissions
 *  − règlements + ajustements), fidélité, litiges, annulations.
 *  Lecture seule. La « dernière activité visible » n'est pas une
 *  dernière connexion (voir lib/live-admin.ts). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireLiveAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { id } = await params;
  const detail = await getLivePersonDetail(id);
  if (!detail) {
    return NextResponse.json({ error: 'Personne introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
