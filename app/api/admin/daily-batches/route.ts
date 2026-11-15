/** Lots de versement quotidiens — admin (v2.55).
 *
 *  GET — liste des lots (30 derniers, tous chauffeurs) avec le
 *  détail des courses. POST { batchId, reference? } — marque un
 *  lot comme viré (réservé à l'admin) : c'est l'enregistrement
 *  du virement EFFECTUÉ (Mobile Money / virement bancaire) vers
 *  le chauffeur. Le rail reste MANUEL tant que Global Payouts
 *  n'est pas validé en réel avec un vrai compte chauffeur
 *  gabonais (ADR 0031) — aucun virement automatique n'est
 *  déclenché ici.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

const BodySchema = z.object({
  batchId: z.string().uuid(),
  reference: z.string().max(200).optional(),
});

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Base indisponible.' }, { status: 503 });
  }
  const sessionUser = await getSessionUser();
  if (!sessionUser?.profile?.is_admin) {
    return NextResponse.json({ ok: false, error: 'Réservé à l’admin.' }, { status: 403 });
  }
  const supabase = await createClient();
  const { data: batches } = await supabase
    .from('daily_payout_batches')
    .select('id, payout_date, driver_id, rides_count, fares_total_fcfa, driver_share_fcfa, platform_funded_fcfa, status, rail, rail_note, reference, created_at, paid_at')
    .order('payout_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30);
  const driverIds = [...new Set((batches ?? []).map((b) => b.driver_id))];
  const names = new Map<string, string>();
  if (driverIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, phone')
      .in('id', driverIds);
    (profiles ?? []).forEach((p) =>
      names.set(p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || p.phone || p.id)
    );
  }
  return NextResponse.json({
    ok: true,
    batches: (batches ?? []).map((b) => ({
      ...b,
      driverName: names.get(b.driver_id) ?? b.driver_id,
    })),
  });
}

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser?.profile?.is_admin) {
    return NextResponse.json({ ok: false, error: 'Réservé à l’admin.' }, { status: 403 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Demande invalide.' }, { status: 400 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mark_daily_batch_paid', {
    p_batch_id: parsed.data.batchId,
    p_reference: parsed.data.reference ?? null,
  });
  const res = data as { ok?: boolean; error?: string; status?: string } | null;
  if (error || !res?.ok) {
    return NextResponse.json(
      { ok: false, error: res?.error ?? error?.message ?? 'Marquage impossible.' },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, status: res.status });
}
