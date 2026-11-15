import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { formatFcfa } from '@/lib/commission';
import { DAILY_BATCH_STATUS_LABELS } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

/** Paiements par carte — admin (v2.55) : lots de versement
 *  quotidiens aux chauffeurs (à virer chaque matin), paiements
 *  carte récents, cautions, remboursements de dette.
 *
 *  Rappel : le rail est MANUEL tant que Global Payouts n'est
 *  pas validé en réel avec un vrai compte chauffeur gabonais
 *  (ADR 0031). L'admin exécute le virement (Mobile Money /
 *  virement bancaire) puis marque le lot comme viré avec sa
 *  référence — aucun virement automatique n'est déclenché ici.
 */
export default async function AdminCardPaymentsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/admin/paiements-carte');
  if (!sessionUser.profile?.is_admin) redirect('/');

  const supabase = await createClient();

  const [{ data: batches }, { data: payments }, { data: deposits }, { data: debts }] =
    await Promise.all([
      supabase
        .from('daily_payout_batches')
        .select('id, payout_date, driver_id, rides_count, fares_total_fcfa, driver_share_fcfa, platform_funded_fcfa, status, rail, reference, paid_at')
        .order('payout_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('card_payments')
        .select('id, ride_id, status, fare_fcfa, fees_fcfa, charged_fcfa, stripe_fee_fcfa, created_at, captured_at')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('card_deposits')
        .select('id, driver_id, status, amount_fcfa, fees_fcfa, charged_fcfa, refund_amount_fcfa, refund_note, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('card_debt_payments')
        .select('id, driver_id, amount_fcfa, status, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

  const driverIds = [
    ...new Set([
      ...((batches ?? []).map((b) => b.driver_id) as string[]),
      ...((deposits ?? []).map((d) => d.driver_id) as string[]),
      ...((debts ?? []).map((d) => d.driver_id) as string[]),
    ]),
  ];
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

  const toMark = (batches ?? []).filter((b) => b.status === 'pret_a_virer' || b.status === 'prepare');
  const totalToPay = toMark.reduce((s, b) => s + (b.driver_share_fcfa ?? 0), 0);

  return (
    <PageShell title="Paiements par carte" subtitle="Lots quotidiens, paiements carte, cautions et remboursements de dette.">
      <div className="space-y-6">
        <p className="text-sm text-slate-600">
          Lots quotidiens aux chauffeurs, paiements carte, cautions et
          remboursements de dette. Le rail est <strong>manuel</strong> :
          vire chaque lot (Mobile Money / virement bancaire) puis marque-le
          comme viré avec sa référence. Délai de règlement Stripe : ~2 jours
          ouvrés après la capture — un lot préparé le matin n’est pas
          forcément virable le jour même.
        </p>

        {toMark.length > 0 && (
          <section className="rounded-3xl bg-night-900 text-white p-5 space-y-2">
            <h2 className="font-black text-lg">À virer : {formatFcfa(totalToPay)}</h2>
            <p className="text-sm text-slate-300">
              {toMark.length} lot{toMark.length > 1 ? 's' : ''} prêt{toMark.length > 1 ? 's' : ''} à virer
              — marque chaque lot comme viré après le virement effectif.
            </p>
          </section>
        )}

        <section className="space-y-3">
          <h2 className="font-black text-lg text-slate-900">Lots quotidiens</h2>
          {(batches ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucun lot pour le moment — le premier lot est préparé le lendemain matin de la première course carte.</p>
          ) : (
            <ul className="space-y-2">
              {(batches ?? []).map((b) => (
                <li key={b.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <p className="font-bold text-slate-900">
                      {names.get(b.driver_id) ?? b.driver_id} — lot du{' '}
                      {new Date(`${b.payout_date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-slate-500">
                      {b.rides_count} course{b.rides_count > 1 ? 's' : ''} · total {formatFcfa(b.fares_total_fcfa)} · part chauffeur{' '}
                      <strong>{formatFcfa(b.driver_share_fcfa)}</strong>
                      {b.platform_funded_fcfa > 0 && ` · dont ${formatFcfa(b.platform_funded_fcfa)} avancés par la plateforme`}
                      {b.reference && ` · réf : ${b.reference}`}
                    </p>
                  </div>
                  <span className="text-xs font-black px-3 py-1.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                    {DAILY_BATCH_STATUS_LABELS[b.status] ?? b.status}
                    {b.paid_at ? ` — le ${new Date(b.paid_at).toLocaleDateString('fr-FR')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">
            Pour marquer un lot comme viré, utilise l’API : POST /api/admin/daily-batches avec {'{ batchId, reference }'}.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-black text-lg text-slate-900">Paiements carte récents</h2>
          {(payments ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucun paiement carte pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {(payments ?? []).map((p) => (
                <li key={p.id} className="bg-white border border-slate-200 rounded-2xl p-4 text-sm flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    Course {String(p.ride_id).slice(0, 8)}… — prix {formatFcfa(p.fare_fcfa)} + frais {formatFcfa(p.fees_fcfa)} = {formatFcfa(p.charged_fcfa)}
                    {p.stripe_fee_fcfa !== null && ` · frais réels Stripe ${formatFcfa(p.stripe_fee_fcfa)}`}
                  </span>
                  <span className="text-xs font-black px-3 py-1 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                    {p.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-black text-lg text-slate-900">Cautions chauffeurs</h2>
          {(deposits ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucune caution payée par carte pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {(deposits ?? []).map((d) => (
                <li key={d.id} className="bg-white border border-slate-200 rounded-2xl p-4 text-sm">
                  <p className="font-bold text-slate-900">
                    {names.get(d.driver_id) ?? d.driver_id} — {d.status} — caution {formatFcfa(d.amount_fcfa)} (débité {formatFcfa(d.charged_fcfa)})
                    {d.refund_amount_fcfa !== null && ` · remboursé ${formatFcfa(d.refund_amount_fcfa)}`}
                  </p>
                  {d.refund_note && <p className="text-slate-500 mt-1">{d.refund_note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="font-black text-lg text-slate-900">Remboursements de dette par carte</h2>
          {(debts ?? []).length === 0 ? (
            <p className="text-sm text-slate-500">Aucun remboursement de dette par carte pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {(debts ?? []).map((d) => (
                <li key={d.id} className="bg-white border border-slate-200 rounded-2xl p-4 text-sm flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-900">
                    {names.get(d.driver_id) ?? d.driver_id} — {formatFcfa(d.amount_fcfa)}
                  </span>
                  <span className="text-xs font-black px-3 py-1 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                    {d.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href="/admin" className="inline-block text-sm font-bold text-sarcelle hover:underline">
          ← Retour au tableau de bord admin
        </Link>
      </div>
    </PageShell>
  );
}
