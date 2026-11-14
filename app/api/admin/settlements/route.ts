import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';

const AdminSettlementSchema = z.object({
  declarationId: z.string().uuid(),
  action: z.enum(['validate', 'reject']),
});

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Non connecté.', status: 401 as const };
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!profile?.is_admin) {
    return { error: 'Réservé à l’administrateur.', status: 403 as const };
  }
  return { supabase, user };
}

/** POST /api/admin/settlements — validation en 1 clic d'une déclaration
 *  « J'ai payé » :
 *  - validate : la déclaration devient un règlement classique
 *    (driver_settlements) → la dette du chauffeur baisse ; le relevé
 *    hebdo passe en « valide ».
 *  - reject : la déclaration est refusée (trace conservée), le relevé
 *    repasse en « genere » pour une nouvelle déclaration. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const body = await request.json().catch(() => null);
  const parsed = AdminSettlementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  const { data: declaration } = await supabase
    .from('settlement_declarations')
    .select('id, weekly_settlement_id, driver_id, amount, method, status')
    .eq('id', v.declarationId)
    .single();
  if (!declaration) {
    return NextResponse.json({ error: 'Déclaration introuvable.' }, { status: 404 });
  }
  if (declaration.status !== 'declare') {
    return NextResponse.json({ error: 'Cette déclaration a déjà été traitée.' }, { status: 409 });
  }

  if (v.action === 'reject') {
    const { error } = await supabase
      .from('settlement_declarations')
      .update({
        status: 'refuse',
        validated_at: new Date().toISOString(),
        validated_by: user.id,
      })
      .eq('id', v.declarationId)
      .eq('status', 'declare');
    if (error) {
      console.error('[api/admin/settlements]', error.message);
      return NextResponse.json({ error: 'Refus impossible.' }, { status: 500 });
    }
    if (declaration.weekly_settlement_id) {
      await supabase
        .from('weekly_settlements')
        .update({ status: 'genere' })
        .eq('id', declaration.weekly_settlement_id)
        .eq('status', 'declare');
    }
    await logAudit(supabase, 'settlement_validated', {
      actorId: user.id,
      rideId: null,
      driverId: declaration.driver_id,
      declarationId: v.declarationId,
      action: 'refuse',
      amount: declaration.amount,
    });
    return NextResponse.json({ ok: true });
  }

  // validate — le règlement entre dans driver_settlements (la dette baisse).
  const { error: settlementError } = await supabase.from('driver_settlements').insert({
    driver_id: declaration.driver_id,
    amount: declaration.amount,
    method: declaration.method,
    note: 'Règlement hebdo déclaré par le chauffeur, validé par l’admin.',
    recorded_by: user.id,
  });
  if (settlementError) {
    console.error('[api/admin/settlements]', settlementError.message);
    return NextResponse.json({ error: 'Validation impossible.' }, { status: 500 });
  }
  const { error: declarationError } = await supabase
    .from('settlement_declarations')
    .update({
      status: 'valide',
      validated_at: new Date().toISOString(),
      validated_by: user.id,
    })
    .eq('id', v.declarationId)
    .eq('status', 'declare');
  if (declarationError) {
    console.error('[api/admin/settlements]', declarationError.message);
    return NextResponse.json(
      { error: 'Règlement enregistré, mais déclaration non marquée validée — vérifie dans /admin.' },
      { status: 500 }
    );
  }
  if (declaration.weekly_settlement_id) {
    await supabase
      .from('weekly_settlements')
      .update({ status: 'valide' })
      .eq('id', declaration.weekly_settlement_id);
  }
  await logAudit(supabase, 'settlement_validated', {
    actorId: user.id,
    rideId: null,
    driverId: declaration.driver_id,
    declarationId: v.declarationId,
    action: 'validate',
    amount: declaration.amount,
  });
  return NextResponse.json({ ok: true });
}
