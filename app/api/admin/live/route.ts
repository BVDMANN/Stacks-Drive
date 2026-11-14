import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getLiveSnapshot, requireLiveAdmin } from '@/lib/live-admin';

/** GET /api/admin/live — instantané de la vue admin en direct :
 *  compteurs, chauffeurs en ligne, courses actives, passagers en ce
 *  moment et 30 derniers événements. Lecture seule, admin uniquement. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireLiveAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const snapshot = await getLiveSnapshot();
  return NextResponse.json(snapshot);
}
