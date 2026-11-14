import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getLiveRideTrace, requireLiveAdmin } from '@/lib/live-admin';

/** GET /api/admin/live/ride/[id] — trace d'une course (admin) :
 *  course, propositions, nombre de messages, annulations, retours,
 *  journal d'audit et chronologie (chaque étape utilise son vrai
 *  horodatage, aucune heure inventée). Lecture seule. */
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
  const trace = await getLiveRideTrace(id);
  if (!trace) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...trace });
}
