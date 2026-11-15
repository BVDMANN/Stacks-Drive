/** Cron quotidien — versements chauffeurs + remboursements de
 *  caution (v2.55). Appelé par Vercel Cron chaque matin à 04:00
 *  UTC (05:00 à Libreville), protégé par CRON_SECRET.
 *
 *  Les crons Vercel appellent en GET : la route accepte GET
 *  (déclenchement planifié, entrée dans vercel.json) et POST
 *  (déclenchement manuel, même traitement).
 *
 *  1) Génère les lots de versement de LA VEILLE (date Libreville)
 *     : courses carte encaissées + courses offertes + captures
 *     en échec (plateforme avance la part). Les lots sont
 *     PRÉPARÉS (statut 'pret_a_virer', rail 'manuel') — l'admin
 *     exécute le virement et le marque comme viré dans
 *     /admin/paiements-carte. AUCUN virement automatique n'est
 *     déclenché : le rail Global Payouts n'est pas validé en
 *     réel (ADR 0031) — c'est un choix, pas un oubli.
 *  2) Rembourse les cautions des chauffeurs partis
 *     (driver_left_at) dont la caution est encore 'paye' : le
 *     remboursement est protégé contre le double déclenchement
 *     par le claim atomique de lib/card-ledger.ts
 *     (claim_deposit_refund) + la clé d'idempotence Stripe
 *     `deposit-refund-{driverId}` ; les claims bloqués depuis
 *     plus de 15 minutes sont repris par le cron suivant.
 *  3) Délai de règlement Stripe rappelé dans l'ADR : l'argent
 *     d'une course carte n'est disponible sur le solde Stripe
 *     qu'environ 2 jours ouvrés après la capture — le lot de la
 *     veille est donc préparé chaque matin, et l'admin le vire
 *     dès que les fonds sont réglés.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/cron';
import { refundDriverDeposit } from '@/lib/card-ledger';
import { logAudit } from '@/lib/audit';

function librevilleDate(offsetDays: number): string {
  const now = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return now.toLocaleDateString('en-CA', { timeZone: 'Africa/Libreville' });
}

async function runDailyPayouts(request: NextRequest) {
  const check = requireCronSecret(request);
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: check.error }, { status: check.status });
  }

  const supabase = await createClient();
  const yesterday = librevilleDate(-1);

  // 1) Lots de versement de la veille.
  const { data: batchRes, error: batchError } = await supabase.rpc(
    'generate_daily_payout_batches',
    { p_day: yesterday }
  );
  const batches = batchRes as { ok?: boolean; batches?: number; rides?: number; error?: string } | null;

  // 2) Remboursements de caution des chauffeurs partis.
  const refunds: { driverId: string; refunded: boolean; amount: number; note: string }[] = [];
  const { data: listRes } = await supabase.rpc('list_refundable_deposits');
  const list = listRes as { ok?: boolean; deposits?: { driver_id: string }[] } | null;
  for (const deposit of list?.deposits ?? []) {
    const result = await refundDriverDeposit(deposit.driver_id);
    refunds.push({ driverId: deposit.driver_id, ...result });
  }

  await logAudit(supabase, 'daily_payouts_cron', {
    details: {
      day: yesterday,
      batches: batches?.batches ?? 0,
      rides: batches?.rides ?? 0,
      batchError: batchError?.message ?? batches?.error ?? null,
      refunds: refunds.length,
    },
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    day: yesterday,
    batches: batches?.batches ?? 0,
    rides: batches?.rides ?? 0,
    refunds,
  });
}

/** Déclenchement planifié (Vercel Cron — GET uniquement). */
export async function GET(request: NextRequest) {
  return runDailyPayouts(request);
}

/** Déclenchement manuel (même traitement, même protection). */
export async function POST(request: NextRequest) {
  return runDailyPayouts(request);
}
