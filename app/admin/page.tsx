import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { RideStatusBadge, VerificationStatusBadge } from '@/components/shared/StatusBadge';
import { VerificationReview, type PendingDriver } from '@/components/admin/VerificationReview';
import { VerificationTickets, type TicketWithUrls } from '@/components/admin/VerificationTickets';
import { FeedbackReview } from '@/components/admin/FeedbackReview';
import { AdminDriverPayments, type LockedRide } from '@/components/admin/AdminDriverPayments';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { getAdminStats, getPendingVerifications } from '@/lib/rides';
import { getVerificationTickets } from '@/lib/tickets-server';
import { isEmailConfigured } from '@/lib/email';
import { getAdminDriverMoney } from '@/lib/earnings';
import { AUDIT_LABELS, getRecentAuditEvents } from '@/lib/audit';
import { COMMISSION_RATE, formatFcfa } from '@/lib/commission';
import { formatDepartureTime, timeAgo } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** Tableau de bord administrateur (Randy) : statistiques, vérifications
 *  chauffeurs à valider, chauffeurs inscrits, dernières demandes. */
export default async function AdminPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/admin');

  if (!sessionUser.profile?.is_admin) {
    return (
      <PageShell title="Administration" subtitle="Pilotage de la plateforme Stacks Drive." user={{ id: sessionUser.id, email: sessionUser.email }}>
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

  const [stats, pending, tickets] = await Promise.all([
    getAdminStats(),
    getPendingVerifications(),
    getVerificationTickets(),
  ]);
  const emailConfigured = isEmailConfigured();
  const openTickets = tickets.filter((t) => t.status === 'ouvert').length;

  const supabase = await createClient();
  const [driverMoney, auditEvents] = await Promise.all([
    getAdminDriverMoney(),
    getRecentAuditEvents(30),
  ]);
  const totalOwed = driverMoney.reduce((s, d) => s + d.owed, 0);
  // Coût plateforme (commissions offertes Course Double + courses
  // fidélité + bonus de quête) — ce que les récompenses te coûtent.
  const { data: costRows } = await supabase
    .from('driver_earnings')
    .select('platform_cost');
  const totalPlatformCost = (costRows ?? []).reduce(
    (s: number, r: { platform_cost: number }) => s + (r.platform_cost ?? 0),
    0
  );
  // Courses verrouillées après 5 codes PIN faux.
  const { data: lockedRows } = await supabase
    .from('rides')
    .select('id, pickup, destination, pin_attempts')
    .eq('pin_locked', true)
    .order('updated_at', { ascending: false });
  const lockedRides: LockedRide[] = (lockedRows ?? []).map(
    (r: { id: string; pickup: string; destination: string; pin_attempts: number }) => ({
      id: r.id,
      pickup: r.pickup,
      destination: r.destination,
      pinAttempts: r.pin_attempts ?? 5,
    })
  );

  // Liens signés (1 h) vers le selfie et la pièce de chaque chauffeur
  // en attente — le bucket est privé.
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

  // Liens signés (1 h) vers le selfie et la pièce des tickets ouverts —
  // le bucket est privé.
  const ticketsWithUrls: TicketWithUrls[] = await Promise.all(
    tickets.map(async (t) => {
      const [selfie, doc] = await Promise.all([
        t.selfiePath
          ? supabase.storage.from('driver-documents').createSignedUrl(t.selfiePath, 3600)
          : null,
        t.documentPath
          ? supabase.storage.from('driver-documents').createSignedUrl(t.documentPath, 3600)
          : null,
      ]);
      return {
        ...t,
        selfieUrl: selfie?.data?.signedUrl ?? null,
        documentUrl: doc?.data?.signedUrl ?? null,
      };
    })
  );

  return (
    <PageShell
      title="Administration"
      subtitle="Pilotage de la plateforme Stacks Drive."
      user={{ id: sessionUser.id, email: sessionUser.email }}
    >
      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { value: stats.ridesCount, label: 'Demandes de course' },
          { value: stats.proposalsCount, label: 'Propositions chauffeurs' },
          { value: stats.driversCount, label: 'Chauffeurs inscrits' },
          { value: stats.pendingVerifications, label: 'Vérifications en attente' },
          { value: openTickets, label: 'Tickets de vérification ouverts' },
          { value: formatFcfa(stats.totalVolume), label: 'Volume des courses (confirmées)' },
          { value: formatFcfa(stats.totalCommission), label: `Commission Stacks Drive (${Math.round(COMMISSION_RATE * 100)} %)` },
          { value: formatFcfa(totalOwed), label: 'Commissions dues (à encaisser)' },
          { value: formatFcfa(totalPlatformCost), label: 'Coût des récompenses (courses sans commission + fidélité)' },
          { value: lockedRides.length, label: 'Courses verrouillées (PIN)' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <p className="text-2xl font-black text-stacks-navy break-words">{s.value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Dépôts & règlements chauffeurs (v2.2) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Dépôts & règlements chauffeurs
        </h2>
        <p className="text-sm text-slate-500">
          Dépôt de garantie (5 000 FCFA à l’inscription, remboursable) et
          règlements hebdomadaires des commissions (1 transfert Mobile Money
          par semaine). Les chauffeurs au plafond de dette (~5 000 FCFA) ne
          reçoivent plus de demandes tant qu’ils n’ont pas réglé.
        </p>
        <AdminDriverPayments drivers={driverMoney} lockedRides={lockedRides} />
      </section>

      {/* Recommandations & plaintes (v2.2) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Recommandations & plaintes
        </h2>
        <p className="text-sm text-slate-500">
          Notes, plaintes et suggestions des passagers ET des chauffeurs après
          chaque course. Une plainte signale la course pour révision.
        </p>
        <FeedbackReview />
      </section>

      {/* Journal d'audit (v2.2) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Journal d’audit</h2>
        <p className="text-sm text-slate-500">
          Tarifs calculés, commissions, dépôts, règlements, codes PIN,
          anomalies — tout événement sensible est consigné ici.
        </p>
        {auditEvents.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun événement pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {auditEvents.map((e) => (
              <li key={e.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">
                    {AUDIT_LABELS[e.event] ?? e.event}
                    {e.actor_name ? ` · ${e.actor_name}` : ''}
                  </p>
                  <p className="text-slate-500">
                    {Object.entries(e.details ?? {})
                      .filter(([, v]) => v !== null && v !== undefined)
                      .slice(0, 4)
                      .map(([k, v]) => `${k} : ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                      .join(' · ')}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Tickets de vérification (v2.4) — dossiers ambigus uniquement */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Tickets de vérification ({openTickets} ouverts)
        </h2>
        <p className="text-sm text-slate-500">
          Les contrôles automatiques tranchent la plupart des dossiers
          (vérifié ou refusé avec motif). Seuls les cas ambigus — et les
          doublons détectés — arrivent ici, triés par urgence. Chaque ticket
          est aussi envoyé par e-mail à l’administrateur quand Resend est
          configuré.
        </p>
        <VerificationTickets tickets={ticketsWithUrls} emailConfigured={emailConfigured} />
      </section>

      {/* Vérifications en attente */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Vérifications chauffeurs ({pendingWithUrls.length})
        </h2>
        <p className="text-sm text-slate-500">
          Selfie + pièce d’identité (ou permis) à contrôler avant d’activer le
          badge « Vérifié ». Un chauffeur non vérifié ne peut pas se mettre en ligne.
          Depuis la v2.4, la plupart des dossiers sont tranchés
          automatiquement : ne restent ici que les dossiers en attente sans
          ticket (envoyés avant la v2.4, ou contrôles indisponibles).
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
