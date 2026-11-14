import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';
import { unblockFraudUser } from '@/lib/fraud';

const AdminDriverSchema = z.object({
  action: z.enum(['deposit', 'settlement', 'unlock_pin', 'unblock_fraud']),
  driverId: z.string().uuid().optional(),
  rideId: z.string().uuid().optional(),
  amount: z.number().int().min(1).max(1000000).optional(),
  method: z.enum(['mobile_money', 'especes', 'autre']).optional(),
  note: z.string().trim().max(200).optional(),
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

/** POST /api/admin/drivers — actions admin sur un chauffeur :
 *  - deposit : enregistrer le dépôt de garantie (5 000 FCFA, payé en
 *    P2P hors appli, confirmé par l'admin).
 *  - settlement : enregistrer un règlement hebdomadaire de commissions
 *    (1 transfert Mobile Money reçu de la part du chauffeur).
 *  - unlock_pin : déverrouiller une course bloquée après 5 codes faux.
 *  - unblock_fraud : débloquer un compte bloqué temporairement pour
 *    suspicion de fraude (v2.26) — marqueur levé, dossiers ouverts
 *    marqués résolus, le chauffeur se remet en ligne lui-même.
 *  Chaque action est journalisée dans audit_log. */
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
  const parsed = AdminDriverSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  if (v.action === 'deposit') {
    if (!v.driverId || !v.amount) {
      return NextResponse.json({ error: 'Chauffeur et montant requis.' }, { status: 400 });
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        deposit_paid: true,
        deposit_amount: v.amount,
        deposit_paid_at: new Date().toISOString(),
      })
      .eq('id', v.driverId);
    if (error) {
      console.error('[api/admin/drivers]', error.message);
      return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500 });
    }
    await logAudit(supabase, 'deposit_recorded', {
      actorId: user.id,
      rideId: null,
      driverId: v.driverId,
      amount: v.amount,
      note: v.note ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  if (v.action === 'settlement') {
    if (!v.driverId || !v.amount) {
      return NextResponse.json({ error: 'Chauffeur et montant requis.' }, { status: 400 });
    }
    const { error } = await supabase.from('driver_settlements').insert({
      driver_id: v.driverId,
      amount: v.amount,
      method: v.method ?? 'mobile_money',
      note: v.note ?? null,
      recorded_by: user.id,
    });
    if (error) {
      console.error('[api/admin/drivers]', error.message);
      return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500 });
    }
    await logAudit(supabase, 'settlement_recorded', {
      actorId: user.id,
      rideId: null,
      driverId: v.driverId,
      amount: v.amount,
      method: v.method ?? 'mobile_money',
    });
    return NextResponse.json({ ok: true });
  }

  if (v.action === 'unblock_fraud') {
    if (!v.driverId) {
      return NextResponse.json({ error: 'Chauffeur requis.' }, { status: 400 });
    }
    const ok = await unblockFraudUser(supabase, user.id, v.driverId);
    if (!ok) {
      return NextResponse.json({ error: 'Déblocage impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // unlock_pin
  if (!v.rideId) {
    return NextResponse.json({ error: 'Course requise.' }, { status: 400 });
  }
  const { error } = await supabase
    .from('rides')
    .update({ pin_locked: false, pin_attempts: 0 })
    .eq('id', v.rideId)
    .eq('pin_locked', true);
  if (error) {
    console.error('[api/admin/drivers]', error.message);
    return NextResponse.json({ error: 'Déverrouillage impossible.' }, { status: 500 });
  }
  await logAudit(supabase, 'pin_unlocked', { actorId: user.id, rideId: v.rideId });
  return NextResponse.json({ ok: true });
}
