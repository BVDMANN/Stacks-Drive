import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/** GET /api/loyalty — progression fidélité du passager : toutes les
 *  10 courses terminées, la suivante est offerte. */
export async function GET() {
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
  const { count } = await supabase
    .from('rides')
    .select('id', { count: 'exact', head: true })
    .eq('passenger_id', user.id)
    .eq('status', 'terminee');
  const completedRides = count ?? 0;
  const ridesUntilFree = 10 - (completedRides % 10);
  return NextResponse.json({ ok: true, completedRides, ridesUntilFree });
}
