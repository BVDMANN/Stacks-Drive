import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { RideStatusBadge, VerificationStatusBadge } from '@/components/shared/StatusBadge';
import { VerificationReview, type PendingDriver } from '@/components/admin/VerificationReview';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { getAdminStats, getPendingVerifications } from '@/lib/rides';
import { COMMISSION_RATE, formatFcfa } from '@/lib/commission';
import { formatDepartureTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** Tableau de bord administrateur (Randy) : statistiques, vérifications
 *  chauffeurs à valider, chauffeurs inscrits, dernières demandes. */
export default async function AdminPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/admin');

  if (!sessionUser.profile?.is_admin) {
    return (
      <PageShell title="Administration" subtitle="Pilotage de la plateforme Stacks Drive.">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Cette page est réservée à l’administrateur de la plateforme.
          </p>
          <Link href="/" className="inline-block text-stacks-green font-bold hover:underline">
            Retour à la carte
          </Link>
        </div>
      </PageShell>
    );
  }

  const [stats, pending] = await Promise.all([getAdminStats(), getPendingVerifications()]);

  // Liens signés (1 h) vers le selfie et la pièce de chaque chauffeur
  // en attente — le bucket est privé.
  const supabase = await createClient();
  const pendingWithUrls: PendingDriver[] = await Promise.all(
    pending.map(async (d) => {
      const [selfie, doc] = await Promise.all([
        d.selfie_url
          ? supabase.storage.from('driver-documents').createSignedUrl(d.selfie_url, 3600)
          : null,
        d.id_document_url
          ? supabase.storage.from('driver-documents').createSignedUrl(d.id_document_url, 3600)
          : null,
      ]);
      return {
        id: d.id,
        name: d.full_name,
        phone: d.phone,
        email: d.email,
        vehicle: [d.vehicle_brand, d.vehicle_model, d.vehicle_color].filter(Boolean).join(' ') +
          (d.vehicle_type ? ` · ${d.vehicle_type}` : '') +
          (d.plate ? ` · ${d.plate}` : ''),
        documentType: d.id_document_type,
        selfieUrl: selfie?.data?.signedUrl ?? null,
        documentUrl: doc?.data?.signedUrl ?? null,
      };
    })
  );

  return (
    <PageShell
      title="Administration"
      subtitle="Pilotage de la plateforme Stacks Drive."
    >
      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { value: stats.ridesCount, label: 'Demandes de course' },
          { value: stats.proposalsCount, label: 'Propositions chauffeurs' },
          { value: stats.driversCount, label: 'Chauffeurs inscrits' },
          { value: stats.pendingVerifications, label: 'Vérifications en attente' },
          { value: formatFcfa(stats.totalVolume), label: 'Volume des courses (confirmées)' },
          { value: formatFcfa(stats.totalCommission), label: `Commission Stacks Drive (${Math.round(COMMISSION_RATE * 100)} %)` },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <p className="text-2xl font-black text-stacks-navy break-words">{s.value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Vérifications en attente */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Vérifications chauffeurs ({pendingWithUrls.length})
        </h2>
        <p className="text-sm text-slate-500">
          Selfie + pièce d’identité (ou permis) à contrôler avant d’activer le
          badge « Vérifié ». Un chauffeur non vérifié ne peut pas se mettre en ligne.
        </p>
        <VerificationReview drivers={pendingWithUrls} />
      </section>

      {/* Chauffeurs */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Chauffeurs ({stats.drivers.length})</h2>
        {stats.drivers.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun chauffeur inscrit pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.drivers.map((d) => (
              <li key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">
                    {d.full_name ?? 'Sans nom'} · {d.phone ?? '—'}
                  </p>
                  <p className="text-slate-500">
                    {[d.vehicle_brand, d.vehicle_model, d.vehicle_color].filter(Boolean).join(' ') || 'Véhicule non renseigné'}
                    {d.vehicle_type ? ` · ${d.vehicle_type}` : ''}
                    {d.plate ? ` · ${d.plate}` : ''}
                    {d.is_online ? ' · En ligne' : ' · Hors ligne'}
                    {d.current_area ? ` · ${d.current_area}` : ''}
                  </p>
                </div>
                <VerificationStatusBadge status={d.verification_status ?? 'non_verifie'} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Dernières demandes */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Dernières demandes</h2>
        {stats.recentRides.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune demande pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.recentRides.map((r) => {
              const { date, time } = formatDepartureTime(r.created_at);
              return (
                <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                  <Link href={`/courses/${r.id}`} className="text-sm font-bold text-slate-900 hover:text-stacks-green">
                    {r.pickup} → {r.destination} · {date} {time} · {formatFcfa(r.proposed_price ?? r.estimated_price)}
                  </Link>
                  <RideStatusBadge status={r.status} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </PageShell>
  );
}
