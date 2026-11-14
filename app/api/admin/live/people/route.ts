import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { requireLiveAdmin, searchLivePeople } from '@/lib/live-admin';

/** GET /api/admin/live/people — recherche de personnes (admin) :
 *  ?q=&role=passager|chauffeur&status=&online=true|false&limit=50&offset=0
 *  Recherche : nom, e-mail ou téléphone (ilike). Filtres : rôle,
 *  statut de vérification, en ligne. Lecture seule. */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireLiveAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const url = new URL(request.url);
  const onlineParam = url.searchParams.get('online');
  const online =
    onlineParam === 'true' ? true : onlineParam === 'false' ? false : null;
  const result = await searchLivePeople({
    q: url.searchParams.get('q') ?? undefined,
    role: url.searchParams.get('role') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    online,
    limit: Number(url.searchParams.get('limit') ?? 50) || 50,
    offset: Number(url.searchParams.get('offset') ?? 0) || 0,
  });
  return NextResponse.json({ ok: true, total: result.total, people: result.people });
}
