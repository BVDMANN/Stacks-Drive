import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { RideStatusBadge, VerificationStatusBadge } from '@/components/shared/StatusBadge';
import { VerificationReview, type PendingDriver } from '@/components/admin/VerificationReview';
import { DriverStatusBadge } from '@/components/driver/DriverStatusBadge';
import { VerificationTickets, type TicketWithUrls } from '@/components/admin/VerificationTickets';
import { FeedbackReview } from '@/components/admin/FeedbackReview';
import { DisputesReview } from '@/components/admin/DisputesReview';
import { WeeklySettlementsReview } from '@/components/admin/WeeklySettlementsReview';
import { AdminDriverPayments, type LockedRide } from '@/components/admin/AdminDriverPayments';
import { FraudReview } from '@/components/admin/FraudReview';
import { getOpenFraudCases, getFraudBlockedUsers } from '@/lib/fraud';
import { getLatestDataCleanup } from '@/lib/data-cleanup';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { getAdminStats, getPendingVerifications } from '@/lib/rides';
import { getDriverReliabilityMap } from '@/lib/cancellations';
import { getVerificationTickets } from '@/lib/tickets-server';
import { isEmailConfigured } from '@/lib/email';
import { getAdminDriverMoney } from '@/lib/earnings';
import { getUnansweredZones } from '@/lib/no-driver-zones';
import { getAdminReferralStats } from '@/lib/driver-lifecycle';
import { getAreaWaitlist } from '@/lib/area-waitlist';
import { getAdminDisputes } from '@/lib/disputes';
import { getLatestWeeklyReport, getSettlementDeclarations, getWeeklySettlements } from '@/lib/settlements';
import { AUDIT_LABELS, getRecentAuditEvents } from '@/lib/audit';
import { COMMISSION_RATE, formatFcfa } from '@/lib/commission';
import { formatDepartureTime, timeAgo } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/** Tableau de bord administrateur : statistiques, vérifications
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
  const [driverMoney, auditEvents, disputes, weeklyStatements, declarations, latestReport, fraudCases, fraudBlocked, latestCleanup] = await Promise.all([
    getAdminDriverMoney(),
    getRecentAuditEvents(30),
    getAdminDisputes(),
    getWeeklySettlements(),
    getSettlementDeclarations(),
    getLatestWeeklyReport(),
    getOpenFraudCases(supabase),
    getFraudBlockedUsers(supabase),
    getLatestDataCleanup(supabase),
  ]);
  // Zones sans chauffeur (v2.27) : demandes sans proposition depuis
  // plus de 2 min — table absente (migration non appliquée) = liste vide.
  const unansweredZones = await getUnansweredZones(supabase, 20);
  // Liste d'attente « préviens-moi » (v2.32, écran hors zone) :
  // e-mails des personnes hors zone, ville / pays en best-effort —
  // table absente (migration non appliquée) = liste vide.
  const areaWaitlist = await getAreaWaitlist(supabase);
  // Parrainage chauffeurs (v2.25, lot C) — visible côté admin uniquement
  // (jamais sur les pages publiques) : table absente = liste vide.
  const referralStats = await getAdminReferralStats(supabase);
  const openDisputes = disputes.filter((d) => d.status !== 'resolu').length;
  const pendingDeclarations = declarations.filter((d) => d.status === 'declare').length;
  const totalOwed = driverMoney.reduce((s, d) => s + d.owed, 0);
  // Fiabilité (v2.23) : annulations comptées par chauffeur — même
  // règle que le profil chauffeur (signalé : 3+ annulations ET taux
  // > 25 %). Lue depuis `rides`, aucune dépendance à la migration.
  const reliabilityByDriver = await getDriverReliabilityMap(
    supabase,
    stats.drivers.map((d) => d.id)
  );
  const flaggedDrivers = stats.drivers.filter(
    (d) => (reliabilityByDriver.get(d.id)?.flagged ?? false)
  );
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
      actions={
        <Link
          href="/admin/live"
          className="inline-flex items-center gap-2 text-sm font-black text-white bg-stacks-green px-4 py-2.5 rounded-full shadow-md hover:bg-green-700"
        >
          ● En direct — voir ce qui se passe
        </Link>
      }
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
          { value: fraudBlocked.length, label: 'Comptes bloqués (fraude)' },
          { value: fraudCases.length, label: 'Dossiers de fraude ouverts' },
          { value: openDisputes, label: 'Litiges ouverts' },
          { value: pendingDeclarations, label: 'Déclarations « J’ai payé » en attente' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <p className="text-2xl font-black text-stacks-navy break-words">{s.value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Fraude — détection automatique (v2.26, lot D) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Fraude — détection automatique ({fraudCases.length} dossier{fraudCases.length > 1 ? 's' : ''} ouvert{fraudCases.length > 1 ? 's' : ''})
        </h2>
        <p className="text-sm text-slate-500">
          Signaux surveillés : annulations en série (6+ et taux &gt; 40 %, au-delà du signalement « À surveiller »),
          vitesse moyenne impossible (&gt; 150 km/h sur une course terminée), faux PIN répétés (2 courses verrouillées
          sur 30 jours, au-delà du verrouillage lot B), téléphone partagé entre comptes (alerte dès 2, blocage dès 3).
          Un dossier ouvert bloque temporairement le compte (mise hors ligne + marqueur « à vérifier ») — le paiement
          et la dette ne sont jamais touchés. Débloquer, c’est lever le marqueur après contrôle : le chauffeur se
          remet en ligne lui-même.
        </p>
        <FraudReview cases={fraudCases} blocked={fraudBlocked} />
      </section>

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

      {/* Parrainage chauffeurs (v2.25, lot C) — visible côté admin
          uniquement, jamais sur les pages publiques. Bonus : 1 000 points
          au parrain + 500 au filleul quand le filleul est vérifié et a
          terminé 5 courses (crédit par le cron hebdo). */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Parrainage chauffeurs ({referralStats.reduce((s, r) => s + r.referralsCount, 0)} filleul{referralStats.reduce((s, r) => s + r.referralsCount, 0) > 1 ? 's' : ''})
        </h2>
        {referralStats.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun parrainage pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {referralStats.map((r) => (
              <li key={r.referrerId} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {r.referrerName ?? 'Chauffeur'} ·{' '}
                  <code className="text-xs bg-slate-100 rounded px-1.5 py-0.5">{r.referralCode}</code>
                </span>
                <span className="text-sm text-slate-500">
                  {r.referralsCount} filleul{r.referralsCount > 1 ? 's' : ''} ·{' '}
                  {r.rewardedCount} bonus versé{r.rewardedCount > 1 ? 's' : ''} ·{' '}
                  {r.pendingCount} en attente
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Litiges (v2.15) — le seul travail que l’administrateur garde : trancher. */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Litiges ({openDisputes} ouverts)
        </h2>
        <p className="text-sm text-slate-500">
          Litiges ouverts par les passagers et les chauffeurs depuis leurs
          courses. Chaque dossier montre la course, le prix accepté, les
          messages in-app, la dernière position connue et le statut du code
          PIN — jamais les numéros de téléphone. Trancher, c’est ajuster la
          dette et/ou la commission du chauffeur (montant + motif, tracé).
          Chaque nouveau litige est aussi envoyé par e-mail à
          l’administrateur quand Resend est configuré.
        </p>
        <DisputesReview disputes={disputes} />
      </section>

      {/* Relevés hebdo + rapport hebdo (v2.15) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Relevés & rapport hebdo
        </h2>
        <p className="text-sm text-slate-500">
          Chaque lundi, un relevé est généré pour chaque chauffeur ayant
          roulé la semaine passée (courses, commission due, dette totale,
          dépôt). Le chauffeur déclare son transfert (« J’ai payé ») et tu
          valides en 1 clic — la dette baisse alors. Le rapport hebdo
          (courses, revenu commission, nouveaux chauffeurs, litiges ouverts,
          alertes) est généré le lundi aussi et envoyé par e-mail.
        </p>
        <WeeklySettlementsReview
          statements={weeklyStatements}
          declarations={declarations}
          latestReport={latestReport}
        />
        {/* Nettoyage hebdo des données — RGPD (v2.26, lot D) : dernier
            passage du cron hebdo (positions chauffeur supprimées,
            propositions expirées, comptes inactifs comptés — jamais
            supprimés ni anonymisés automatiquement). */}
        <p className="text-sm text-slate-500">
          {latestCleanup
            ? `Dernier nettoyage des données (${timeAgo(latestCleanup.runAt)}) : ${latestCleanup.locationsDeleted} position(s) chauffeur supprimée(s), ${latestCleanup.proposalsExpired} proposition(s) expirée(s), ${latestCleanup.inactiveAccounts} compte(s) inactif(s) (≥ 12 mois) signalé(s) — aucune suppression de compte automatique.`
            : 'Nettoyage des données : aucun passage journalisé pour le moment (migration v2.26 à exécuter).'}
        </p>
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

      {/* Fiabilité — annulations (v2.23) : qui annule, combien, avec
          quels motifs (détail dans l'historique de chaque course).
          Signalé = 3 annulations ou plus ET plus d'1 course sur 4
          annulée. */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Fiabilité — annulations ({flaggedDrivers.length} chauffeur{flaggedDrivers.length > 1 ? 's' : ''} à surveiller)
        </h2>
        <p className="text-sm text-slate-500">
          Chaque annulation est enregistrée avec son motif (qui a annulé, pourquoi) et comptée ici.
          Les annulations répétées sont signalées — c’est l’indicateur à regarder avant de
          recontacter un chauffeur.
        </p>
        {stats.drivers.filter((d) => (reliabilityByDriver.get(d.id)?.cancelled ?? 0) > 0).length === 0 ? (
          <p className="text-sm text-slate-500">Aucune annulation enregistrée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.drivers
              .filter((d) => (reliabilityByDriver.get(d.id)?.cancelled ?? 0) > 0)
              .sort(
                (a, b) =>
                  (reliabilityByDriver.get(b.id)?.cancelRate ?? 0) -
                  (reliabilityByDriver.get(a.id)?.cancelRate ?? 0)
              )
              .map((d) => {
                const r = reliabilityByDriver.get(d.id)!;
                return (
                  <li key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm">
                      <p className="font-bold text-slate-900">{d.full_name ?? 'Sans nom'}</p>
                      <p className="text-slate-500">
                        {r.completed} terminée{r.completed > 1 ? 's' : ''} · {r.cancelled} annulée
                        {r.cancelled > 1 ? 's' : ''} (dont {r.cancelledByMe} par le chauffeur) ·{' '}
                        {Math.round(r.cancelRate * 100)} % d’annulations
                      </p>
                    </div>
                    {r.flagged ? (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black bg-red-100 text-red-700">
                        À surveiller — annulations répétées
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black bg-green-100 text-green-700">
                        Fiabilité {r.reliabilityPct} %
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      {/* Zones sans chauffeur (v2.27) : demandes sans proposition
          depuis plus de 2 min — journal pour cibler le recrutement de
          chauffeurs dans les quartiers où les passagers attendent.
          Une demande qui reçoit ensuite une proposition sort de la
          liste ; le journal en base garde la trace. */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Zones sans chauffeur ({unansweredZones.length} demande{unansweredZones.length > 1 ? 's' : ''} en attente)
        </h2>
        <p className="text-sm text-slate-500">
          Chaque demande restée sans proposition plus de 2 minutes est journalisée ici et signalée
          aux chauffeurs proches (une seule alerte par demande). Les quartiers qui reviennent
          souvent sont les zones à cibler pour recruter des chauffeurs.
        </p>
        {unansweredZones.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune demande sans chauffeur pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {unansweredZones.map((z) => (
              <li key={z.rideId} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">
                    {z.pickup} → {z.destination}
                  </p>
                  <p className="text-slate-500">
                    {z.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'} · attend
                    depuis {z.waitingMin} min · {timeAgo(z.createdAt)}
                  </p>
                </div>
                <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-black bg-amber-100 text-amber-700">
                  Sans chauffeur
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Demandes d'arrivée dans une nouvelle zone (v2.32) : e-mails
          laissés sur l'écran hors zone par des personnes hors de la
          zone de service, avec leur consentement explicite — à
          prévenir quand Stacks Drive arrive chez elles. Ville / pays
          en best-effort seulement, jamais de coordonnées précises. */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">
          Demandes d’arrivée dans une nouvelle zone ({areaWaitlist.length})
        </h2>
        <p className="text-sm text-slate-500">
          Personnes hors de la zone de service qui ont laissé leur e-mail
          sur l’écran hors zone (« Préviens-moi quand Stacks Drive arrive
          chez moi »). Les zones qui reviennent souvent sont les
          prochaines villes à envisager.
        </p>
        {areaWaitlist.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune demande pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {areaWaitlist.map((w) => (
              <li key={w.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">{w.email}</p>
                  <p className="text-slate-500">
                    {[w.city, w.country].filter(Boolean).join(', ') || 'Zone inconnue'}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{timeAgo(w.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
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
                    {/* Fiabilité (v2.23) : annulations comptées. */}
                    {(() => {
                      const r = reliabilityByDriver.get(d.id);
                      if (!r || r.total === 0) return '';
                      return ` · Fiabilité ${r.reliabilityPct} % (${r.cancelled} annulation${r.cancelled > 1 ? 's' : ''})`;
                    })()}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  {/* Statut + places libres (v2.19) : qui est Vide / En
                      course / Plein, et combien de places chacun propose. */}
                  {d.driver_status && (
                    <DriverStatusBadge
                      status={d.driver_status}
                      freeSeats={d.free_seats ?? d.seats ?? null}
                      capacity={d.seats ?? null}
                    />
                  )}
                  <VerificationStatusBadge status={d.verification_status ?? 'non_verifie'} />
                </span>
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
                    {r.pickup} → {r.destination} · {date} {time} · {r.proposed_price !== null ? formatFcfa(r.proposed_price) : `estimation ${formatFcfa(r.estimated_price)}`}
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
