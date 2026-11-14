import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDemandHeatmap } from '@/lib/heatmap';

export const dynamic = 'force-dynamic';

/** GET /api/driver/heatmap — zones à forte demande (v2.30).
 *  Chauffeur connecté uniquement. INFO SEULEMENT : la liste vient
 *  des vraies demandes des 7 derniers jours — aucun surge, aucun
 *  prix dynamique, aucune promesse de gain. Sans historique, la
 *  liste est vide et le dit. */
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
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json({ error: 'Réservé aux chauffeurs.' }, { status: 403 });
  }
  const heatmap = await getDemandHeatmap();
  return NextResponse.json({ ok: true, ...heatmap });
}
