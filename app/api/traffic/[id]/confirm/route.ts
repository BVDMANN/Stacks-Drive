import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { TRAFFIC_CONFIRM_MIN } from '@/lib/traffic';

/** POST /api/traffic/[id]/confirm — un chauffeur confirme un
 *  signalement qu'il constate aussi (v2.27, modération auto).
 *
 *  À partir de `TRAFFIC_CONFIRM_MIN` confirmations, le signalement
 *  est affiché en évidence sur la carte. Un chauffeur ne peut pas
 *  confirmer son propre signalement, ni confirmer deux fois le même
 *  (unicité `traffic_confirmations(report_id, driver_id)` en base).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Supabase n’est pas configuré sur ce déploiement.' },
      { status: 503 }
    );
  }
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Connecte-toi pour continuer.' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { ok: false, error: 'Seuls les chauffeurs confirment un signalement.' },
      { status: 403 }
    );
  }
  const { data: report } = await supabase
    .from('traffic_reports')
    .select('id, reporter_id, expires_at')
    .eq('id', id)
    .single();
  if (!report || new Date(report.expires_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { ok: false, error: 'Signalement introuvable ou expiré.' },
      { status: 404 }
    );
  }
  if (report.reporter_id === user.id) {
    return NextResponse.json(
      { ok: false, error: 'Tu ne peux pas confirmer ton propre signalement.' },
      { status: 403 }
    );
  }
  await supabase
    .from('traffic_confirmations')
    .upsert(
      { report_id: id, driver_id: user.id },
      { onConflict: 'report_id,driver_id', ignoreDuplicates: true }
    );
  const { count } = await supabase
    .from('traffic_confirmations')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', id);
  const confirmations = count ?? 0;
  return NextResponse.json({
    ok: true,
    confirmations,
    confirmed: confirmations >= TRAFFIC_CONFIRM_MIN,
  });
}
