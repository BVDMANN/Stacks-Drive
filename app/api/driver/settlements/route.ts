import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';
import { getDriverWeeklyStatement, getMyDeclarations } from '@/lib/settlements';

const DeclareSchema = z.object({
  weeklySettlementId: z.string().uuid().optional(),
  amount: z.number().int().min(1).max(1000000),
  method: z.enum(['mobile_money', 'especes', 'autre']).optional(),
  reference: z.string().trim().max(100).optional(),
});

/** GET /api/driver/settlements — mon relevé de la semaine + mes
 *  déclarations (tableau de bord chauffeur). */
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
  const [statement, declarations] = await Promise.all([
    getDriverWeeklyStatement(user.id),
    getMyDeclarations(user.id),
  ]);
  return NextResponse.json({ ok: true, statement, declarations });
}

/** POST /api/driver/settlements — « J'ai payé » : le chauffeur déclare
 *  son transfert hebdo (montant + référence libre). La déclaration ne
 *  réduit PAS la dette tant que l'admin ne l'a pas validée (1 clic dans
 *  /admin) — elle passe alors en règlement classique. */
export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => null);
  const parsed = DeclareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  // Le relevé déclaré doit appartenir au chauffeur et être encore ouvert.
  let weeklySettlementId: string | null = null;
  if (v.weeklySettlementId) {
    const { data: statement } = await supabase
      .from('weekly_settlements')
      .select('id, driver_id, status')
      .eq('id', v.weeklySettlementId)
      .single();
    if (!statement || statement.driver_id !== user.id) {
      return NextResponse.json({ error: 'Relevé introuvable.' }, { status: 404 });
    }
    if (statement.status === 'valide') {
      return NextResponse.json({ error: 'Ce relevé est déjà réglé.' }, { status: 409 });
    }
    weeklySettlementId = v.weeklySettlementId;
  }

  const { error } = await supabase.from('settlement_declarations').insert({
    weekly_settlement_id: weeklySettlementId,
    driver_id: user.id,
    amount: v.amount,
    method: v.method ?? 'mobile_money',
    reference: v.reference ?? null,
    status: 'declare',
  });
  if (error) {
    console.error('[api/driver/settlements]', error.message);
    return NextResponse.json({ error: 'Déclaration impossible pour le moment.' }, { status: 500 });
  }

  if (weeklySettlementId) {
    await supabase
      .from('weekly_settlements')
      .update({ status: 'declare' })
      .eq('id', weeklySettlementId)
      .eq('status', 'genere');
  }

  await logAudit(supabase, 'settlement_declared', {
    actorId: user.id,
    rideId: null,
    weeklySettlementId,
    amount: v.amount,
    method: v.method ?? 'mobile_money',
    reference: v.reference ?? null,
  });
  return NextResponse.json({ ok: true }, { status: 201 });
}
