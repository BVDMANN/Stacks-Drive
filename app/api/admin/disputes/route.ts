import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';
import { DISPUTE_STATUSES, getDisputeDossier } from '@/lib/disputes';

const AdminDisputeSchema = z
  .object({
    disputeId: z.string().uuid(),
    action: z.enum(['status', 'decide']),
    // action 'status' : ouvert → en cours → résolu.
    status: z.enum(DISPUTE_STATUSES).optional(),
    // action 'decide' : ajustement de la dette et/ou de la commission
    // du chauffeur (FCFA, signé : négatif = le chauffeur doit moins),
    // motif obligatoire, tracé dans dispute_decisions + audit.
    debtAdjustmentFcfa: z.number().int().min(-1000000).max(1000000).optional(),
    commissionAdjustmentFcfa: z.number().int().min(-1000000).max(1000000).optional(),
    reason: z.string().trim().min(2).max(500).optional(),
  })
  .refine((v) => (v.action === 'status' ? v.status !== undefined : true), {
    message: 'Statut requis.',
  })
  .refine(
    (v) =>
      v.action === 'decide'
        ? v.reason !== undefined &&
          ((v.debtAdjustmentFcfa ?? 0) !== 0 || (v.commissionAdjustmentFcfa ?? 0) !== 0)
        : true,
    { message: 'Une décision exige un motif et au moins un ajustement non nul.' }
  );

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

/** GET /api/admin/disputes?disputeId= — dossier complet d'un litige
 *  (course, prix accepté, messages in-app, position, PIN, décisions).
 *  Admin uniquement. Noms seulement — jamais de téléphone. */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireAdmin();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const disputeId = new URL(request.url).searchParams.get('disputeId');
  if (!disputeId) {
    return NextResponse.json({ error: 'disputeId requis.' }, { status: 400 });
  }
  const dossier = await getDisputeDossier(disputeId);
  if (!dossier) {
    return NextResponse.json({ error: 'Litige introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, dossier });
}

/** POST /api/admin/disputes — le seul travail que l’administrateur garde :
 *  - status : faire avancer un litige (ouvert → en cours → résolu).
 *  - decide : trancher — ajuster la dette et/ou la commission du
 *    chauffeur (montant + motif, tracé). L'ajustement de dette est
 *    appliqué dans driver_debt_adjustments et pris en compte dans le
 *    « dû » partout ; la commission figée de la course n'est jamais
 *    réécrite (la décision est la trace). */
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
  const parsed = AdminDisputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  const { data: dispute } = await supabase
    .from('disputes')
    .select('id, ride_id, status')
    .eq('id', v.disputeId)
    .single();
  if (!dispute) {
    return NextResponse.json({ error: 'Litige introuvable.' }, { status: 404 });
  }

  if (v.action === 'status') {
    const next = v.status!;
    const patch: Record<string, unknown> = {
      status: next,
      updated_at: new Date().toISOString(),
    };
    if (next === 'resolu') {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = user.id;
    } else {
      patch.resolved_at = null;
      patch.resolved_by = null;
    }
    const { error } = await supabase
      .from('disputes')
      .update(patch)
      .eq('id', v.disputeId);
    if (error) {
      console.error('[api/admin/disputes]', error.message);
      return NextResponse.json({ error: 'Mise à jour impossible.' }, { status: 500 });
    }
    await logAudit(supabase, 'dispute_status_changed', {
      actorId: user.id,
      rideId: dispute.ride_id,
      disputeId: v.disputeId,
      from: dispute.status,
      to: next,
    });
    return NextResponse.json({ ok: true });
  }

  // decide — trancher.
  const debtAdjustment = v.debtAdjustmentFcfa ?? 0;
  const commissionAdjustment = v.commissionAdjustmentFcfa ?? 0;
  const { data: ride } = await supabase
    .from('rides')
    .select('driver_id')
    .eq('id', dispute.ride_id)
    .single();
  const driverId = (ride as { driver_id: string | null } | null)?.driver_id ?? null;

  const { error: decisionError } = await supabase.from('dispute_decisions').insert({
    dispute_id: v.disputeId,
    admin_id: user.id,
    debt_adjustment_fcfa: debtAdjustment,
    commission_adjustment_fcfa: commissionAdjustment,
    reason: v.reason,
  });
  if (decisionError) {
    console.error('[api/admin/disputes]', decisionError.message);
    return NextResponse.json({ error: 'Décision impossible.' }, { status: 500 });
  }

  // Application de l'ajustement de dette (signé) — seulement si un
  // chauffeur est assigné à la course et que l'ajustement est non nul.
  if (driverId && debtAdjustment !== 0) {
    const { error: adjError } = await supabase.from('driver_debt_adjustments').insert({
      driver_id: driverId,
      dispute_id: v.disputeId,
      amount_fcfa: debtAdjustment,
      reason: v.reason,
      created_by: user.id,
    });
    if (adjError) {
      console.error('[api/admin/disputes] ajustement dette:', adjError.message);
      return NextResponse.json(
        { error: 'Décision enregistrée, mais ajustement de dette non appliqué — vérifie dans /admin.' },
        { status: 500 }
      );
    }
  }

  // La décision clôt le dossier : statut résolu.
  await supabase
    .from('disputes')
    .update({
      status: 'resolu',
      updated_at: new Date().toISOString(),
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq('id', v.disputeId);

  await logAudit(supabase, 'dispute_decided', {
    actorId: user.id,
    rideId: dispute.ride_id,
    disputeId: v.disputeId,
    driverId,
    debtAdjustmentFcfa: debtAdjustment,
    commissionAdjustmentFcfa: commissionAdjustment,
    reason: v.reason,
  });
  return NextResponse.json({ ok: true });
}
