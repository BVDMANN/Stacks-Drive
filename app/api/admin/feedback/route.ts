import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/** GET /api/admin/feedback — toutes les notes, plaintes et
 *  recommandations (admin uniquement), avec filtres :
 *  ?kind=plainte|recommandation|note&category=retard…&limit=50
 *  Une plainte = la course est à réviser (l'admin voit le lien). */
export async function GET(request: NextRequest) {
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
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Réservé à l’administrateur.' }, { status: 403 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get('kind');
  const category = url.searchParams.get('category');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));

  let query = supabase
    .from('ride_feedback')
    .select(
      `id, ride_id, from_user_id, from_role, to_user_id, rating, comment, category, kind, created_at,
       ride:rides!ride_feedback_ride_id_fkey (pickup, destination, status),
       from_profile:profiles!ride_feedback_from_user_id_fkey (full_name),
       to_profile:profiles!ride_feedback_to_user_id_fkey (full_name)`
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (kind && ['note', 'plainte', 'recommandation'].includes(kind)) {
    query = query.eq('kind', kind);
  }
  if (category) {
    query = query.eq('category', category);
  }
  const { data, error } = await query;
  if (error) {
    console.error('[api/admin/feedback]', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, feedback: data ?? [] });
}
