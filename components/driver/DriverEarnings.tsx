'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  CalendarDays,
  Crown,
  Flame,
  Gift,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { DriverEarningsSummary } from '@/lib/earnings';
import { WeeklySettlementCard } from '@/components/driver/WeeklySettlementCard';
import {
  BADGES,
  DEPOSIT_FCFA,
  POINTS_REDEEM_FREE_RIDES,
  POINTS_REDEEM_TARGET,
} from '@/lib/gamification';
import { formatFcfa } from '@/lib/commission';
import { cn } from '@/lib/utils';

const TIER_STYLES: Record<string, string> = {
  Bronze: 'bg-amber-700/20 text-amber-300 border-amber-700/40',
  Argent: 'bg-slate-400/20 text-slate-200 border-slate-400/40',
  Or: 'bg-corail/15 text-corail border-corail/40',
  Diamant: 'bg-cyan-400/15 text-cyan-300 border-cyan-400/40',
};

function PeriodCard({
  title,
  rides,
  kept,
  commission,
  highlight,
}: {
  title: string;
  rides: number;
  kept: number;
  commission: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-3xl p-5 shadow-sm border',
        highlight
          ? 'bg-night-900 border-white/10 text-slate-100'
          : 'bg-white border-slate-200'
      )}
    >
      <p className="text-xs font-black uppercase tracking-widest text-slate-400">{title}</p>
      <p className={cn('text-2xl font-black mt-2', highlight ? 'text-sarcelle' : 'text-stacks-navy')}>
        {formatFcfa(kept)}
      </p>
      <p className={cn('text-sm mt-1', highlight ? 'text-slate-300' : 'text-slate-500')}>
        {rides} course{rides > 1 ? 's' : ''} · commission due {formatFcfa(commission)}
      </p>
    </div>
  );
}

/** Tableau de bord des gains chauffeur (v2.2, points en v2.3) : par
 *  course, total 24 h, montant dû en temps réel, récap hebdo + mensuel,
 *  dépôt, dette vs plafond, points (solde, progression, échange),
 *  quête, niveau, badges, chauffeur de la semaine.
 *  Les chiffres viennent de /api/driver/earnings (calculés côté serveur). */
export function DriverEarnings() {
  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMessage, setRedeemMessage] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/earnings');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Gains indisponibles pour le moment.');
        return;
      }
      setSummary(data.summary as DriverEarningsSummary);
    } catch {
      setError('Connexion impossible — vérifie ton réseau et réessaie.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  /** Échanger 10 000 points contre 5 courses sans commission (v2.3).
   *  Le solde est vérifié et débité en une seule transaction côté base
   *  (fonction redeem_points_for_free_rides) — jamais deux fois les
   *  mêmes points. */
  async function redeemPoints() {
    if (!summary || redeeming || summary.points.balance < POINTS_REDEEM_TARGET) return;
    setRedeeming(true);
    setRedeemMessage(null);
    setRedeemError(null);
    try {
      const res = await fetch('/api/driver/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeem' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setRedeemError(data?.error ?? 'Échange impossible pour le moment.');
        return;
      }
      setRedeemMessage(
        `${POINTS_REDEEM_FREE_RIDES} courses sans commission ajoutées — tu gardes 100 % du tarif sur chacune.`
      );
      await fetchSummary();
    } catch {
      setRedeemError('Échange impossible pour le moment — vérifie ta connexion.');
    } finally {
      setRedeeming(false);
    }
  }

  if (loading && !summary) {
    return (
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm">
        <p className="text-sm text-slate-500">Chargement de tes gains…</p>
      </section>
    );
  }

  if (error && !summary) {
    return (
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3">
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
        <button
          type="button"
          onClick={fetchSummary}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors"
        >
          <RefreshCw size={15} /> Réessayer
        </button>
      </section>
    );
  }

  if (!summary) return null;

  const questPct = Math.min(
    100,
    Math.round((summary.quest.day.done / Math.max(1, summary.quest.day.target)) * 100)
  );
  const debtPct = Math.round(summary.debt.progress * 100);

  return (
    <div className="space-y-6">
      {!summary.tablesReady && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
          Le suivi détaillé des gains s’active après l’application de la
          migration v2.2 dans Supabase — les courses terminées avant cela
          ne sont pas comptées.
        </p>
      )}

      {/* Gains : 24 h / semaine / mois */}
      <section className="space-y-3">
        <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
          <TrendingUp size={20} className="text-stacks-green" /> Tes gains
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PeriodCard
            title="Aujourd’hui (24 h)"
            rides={summary.today.rides}
            kept={summary.today.kept}
            commission={summary.today.commission}
            highlight
          />
          <PeriodCard
            title="Cette semaine"
            rides={summary.week.rides}
            kept={summary.week.kept}
            commission={summary.week.commission}
          />
          <PeriodCard
            title="Ce mois-ci"
            rides={summary.month.rides}
            kept={summary.month.kept}
            commission={summary.month.commission}
          />
        </div>
      </section>

      {/* Points (v2.3) : solde, progression vers 10 000, échange */}
      <section className="bg-night-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 text-slate-100">
        <h2 className="font-black text-lg flex items-center gap-2">
          <Gift size={20} className="text-corail" /> Tes points
        </h2>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-black text-corail">
              {summary.points.balance.toLocaleString('fr-FR')} points
            </p>
            <p className="text-sm text-slate-300 mt-1">
              {summary.points.perRide} points par course terminée
              {summary.points.multiplier > 1
                ? ` — niveau ${summary.tier.current} : +${Math.round((summary.points.multiplier - 1) * 100)} %`
                : ''}
              {summary.points.freeRides > 0
                ? ` · ${summary.points.freeRides} course${summary.points.freeRides > 1 ? 's' : ''} sans commission restante${summary.points.freeRides > 1 ? 's' : ''}`
                : ''}
              .
            </p>
          </div>
          <span className="text-xs font-black px-3 py-1.5 rounded-full border bg-white/5 text-slate-200 border-white/10">
            {summary.points.balance.toLocaleString('fr-FR')} / {POINTS_REDEEM_TARGET.toLocaleString('fr-FR')} points
          </span>
        </div>
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 via-corail to-sarcelle transition-all"
            style={{ width: `${Math.round(summary.points.progress * 100)}%` }}
          />
        </div>
        <p className="text-sm text-slate-300">
          {summary.points.balance >= POINTS_REDEEM_TARGET
            ? 'Tu as assez de points — échange-les contre 5 courses sans commission.'
            : `Plus que ${(POINTS_REDEEM_TARGET - summary.points.balance).toLocaleString('fr-FR')} points pour 5 courses sans commission.`}
        </p>
        <button
          type="button"
          onClick={redeemPoints}
          disabled={redeeming || summary.points.balance < POINTS_REDEEM_TARGET}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-black bg-rose-500 text-night-900 hover:bg-corail transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {redeeming ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Échange en cours…
            </>
          ) : (
            <>
              <Gift size={16} /> Échanger {POINTS_REDEEM_TARGET.toLocaleString('fr-FR')} points contre {POINTS_REDEEM_FREE_RIDES} courses sans commission
            </>
          )}
        </button>
        {redeemMessage && (
          <p role="status" className="text-sm font-bold text-green-300 bg-green-500/10 border border-green-500/30 rounded-xl p-3">
            {redeemMessage}
          </p>
        )}
        {redeemError && (
          <p role="alert" className="text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            {redeemError}
          </p>
        )}
      </section>

      {/* Ce que tu dois + dépôt */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
          <Wallet size={20} className="text-stacks-green" /> Ce que tu dois
        </h2>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-black text-stacks-navy">{formatFcfa(summary.owed)}</p>
            <p className="text-sm text-slate-500 mt-1">
              Commissions non réglées — à régler 1 fois par semaine, en un
              seul transfert Mobile Money (Airtel Money / Moov Money) vers
              le numéro de Stacks Drive.
            </p>
          </div>
          <span
            className={cn(
              'text-xs font-black px-3 py-1.5 rounded-full border',
              summary.deposit.paid
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-amber-50 text-amber-700 border-amber-200'
            )}
          >
            {summary.deposit.paid
              ? `Dépôt ${formatFcfa(summary.deposit.amount)} versé ✓`
              : `Dépôt ${formatFcfa(DEPOSIT_FCFA)} à verser`}
          </span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-slate-500">
            <span>Dette vs plafond ({formatFcfa(summary.debt.cap)})</span>
            <span>{debtPct} %</span>
          </div>
          <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                summary.debt.blocked
                  ? 'bg-red-500'
                  : debtPct >= 80
                    ? 'bg-amber-500'
                    : 'bg-stacks-green'
              )}
              style={{ width: `${debtPct}%` }}
            />
          </div>
          {summary.debt.blocked ? (
            <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              Plafond atteint : tu ne reçois plus de nouvelles demandes tant
              que tes commissions ne sont pas réglées. Règle par Mobile
              Money, puis contacte Stacks Drive pour réactiver ton compte.
            </p>
          ) : debtPct >= 80 ? (
            <p className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Tu approches du plafond de dette — pense à régler cette semaine
              pour ne pas être bloqué.
            </p>
          ) : (
            <p className="text-sm text-slate-500">
              Ton dépôt de {formatFcfa(DEPOSIT_FCFA)} est remboursé quand tu
              quittes la plateforme proprement, après avoir soldé ce que tu dois.
            </p>
          )}
          {/* Rappel de règlement (v2.4) : dû > 0 et dernier règlement
              vieux de plus de 7 jours (ou aucun règlement). */}
          {summary.settlementReminder.show && !summary.debt.blocked && (
            <p className="text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              Rappel : tu dois {formatFcfa(summary.settlementReminder.owed)}
              {summary.settlementReminder.daysSince !== null
                ? ` et ton dernier règlement date d’il y a ${summary.settlementReminder.daysSince} jours`
                : ' et tu n’as pas encore réglé'}
              . Règle en un seul transfert Mobile Money (Airtel Money /
              Moov Money) vers le numéro de Stacks Drive, puis préviens
              l’équipe pour que ton compte soit mis à jour.
            </p>
          )}
        </div>
      </section>

      {/* Relevé hebdo + « J'ai payé » (v2.15) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
          <Wallet size={20} className="text-stacks-green" /> Ton relevé de la semaine
        </h2>
        <WeeklySettlementCard />
      </section>

      {/* Quête du jour + série */}
      <section className="bg-night-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 text-slate-100">
        <h2 className="font-black text-lg flex items-center gap-2">
          <Sparkles size={20} className="text-corail" /> Quête du jour
        </h2>
        <div className="flex items-center justify-between gap-3">
          <p className="font-black">
            {summary.quest.day.done} / {summary.quest.day.target} courses
          </p>
          <span className="text-sm font-black text-corail">
            Bonus : +{summary.quest.day.bonus.toLocaleString('fr-FR')} points
          </span>
        </div>
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 via-corail to-sarcelle transition-all"
            style={{ width: `${questPct}%` }}
          />
        </div>
        <p className="text-sm text-slate-300">
          {summary.quest.day.claimed
            ? 'Quête validée — 1 000 points versés !'
            : summary.quest.day.done >= summary.quest.day.target
              ? 'Quête terminée — les points arrivent avec ta prochaine course.'
              : `Plus que ${summary.quest.day.target - summary.quest.day.done} course${summary.quest.day.target - summary.quest.day.done > 1 ? 's' : ''} pour ton bonus de ${summary.quest.day.bonus.toLocaleString('fr-FR')} points !`}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {summary.streakDays > 0 && (
            <span className="inline-flex items-center gap-1 font-bold">
              <Flame size={16} className="text-rose-300" /> Série : {summary.streakDays} jour{summary.streakDays > 1 ? 's' : ''} d’affilée
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-bold">
            <CalendarDays size={16} className="text-sarcelle" />
            Défi semaine : {summary.quest.week.done} / {summary.quest.week.target} → +{summary.quest.week.bonus.toLocaleString('fr-FR')} points
          </span>
        </div>
      </section>

      {/* Niveau + badges */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
          <Award size={20} className="text-stacks-green" /> Ton niveau
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn('text-sm font-black px-4 py-2 rounded-full border', TIER_STYLES[summary.tier.current] ?? '')}>
            {summary.tier.current}
          </span>
          <p className="text-sm text-slate-600">
            Commission : {Math.round(summary.tier.rate * 100)} % — {summary.tier.perk}
          </p>
        </div>
        {summary.tier.next ? (
          <p className="text-sm text-slate-500">
            Prochain niveau <strong>{summary.tier.next}</strong> : encore{' '}
            {summary.tier.ridesLeft} course{summary.tier.ridesLeft > 1 ? 's' : ''}
            {summary.tier.ratingNeeded !== null
              ? ` et une note moyenne de ${summary.tier.ratingNeeded}/5`
              : ''}
            .
          </p>
        ) : (
          <p className="text-sm font-bold text-green-700">
            Niveau maximum atteint — tu es au sommet de Stacks Drive.
          </p>
        )}
        {summary.badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summary.badges.map((badgeId) => {
              const def = BADGES.find((b) => b.id === badgeId);
              return (
                <span
                  key={badgeId}
                  title={def?.description ?? badgeId}
                  className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-corail/15 text-amber-800 border border-corail/40"
                >
                  <ShieldCheck size={13} /> {def?.title ?? badgeId}
                </span>
              );
            })}
          </div>
        )}
        {summary.driverOfWeek && (
          <p className="text-sm text-slate-600 flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-2xl p-3">
            <Crown size={16} className="text-corail shrink-0" />
            Chauffeur de la semaine : <strong>{summary.driverOfWeek.name ?? '—'}</strong> —{' '}
            {summary.driverOfWeek.rides} courses
            {summary.driverOfWeek.rating !== null ? ` · note ${summary.driverOfWeek.rating}/5` : ''}.
          </p>
        )}
      </section>

      {/* Détail par course (v2.30) : date, trajet, prix accepté,
          commission, gain net — depuis `driver_earnings` (source de
          vérité) + trajet joint depuis `rides`. Export CSV simple
          (lecture seule, côté client, sans dépendance). */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="font-black text-lg text-slate-900">Détail par course</h2>
          {summary.recent.length > 0 && (
            <button
              type="button"
              onClick={() => {
                const header = 'Date;Trajet;Prix accepte (FCFA);Commission (FCFA);Gain net (FCFA)';
                const lines = summary.recent.map((r) => {
                  const date = r.completedAt ?? r.day;
                  const trip =
                    r.pickup && r.destination ? `${r.pickup} -> ${r.destination}` : '—';
                  return [date, trip, r.fare, r.commission, r.kept].join(';');
                });
                const blob = new Blob([[header, ...lines].join('\n')], {
                  type: 'text/csv;charset=utf-8',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'gains-stacks-drive.csv';
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="px-4 py-2 rounded-full text-xs font-black bg-stacks-navy text-white hover:bg-slate-800 transition-colors"
            >
              Exporter en CSV
            </button>
          )}
        </div>
        {summary.recent.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune course terminée pour le moment — tes gains apparaîtront ici.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {summary.recent.map((r) => (
              <li key={r.rideId} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <p className="font-bold text-slate-900">
                    {r.pickup && r.destination
                      ? `${r.pickup} → ${r.destination}`
                      : `${formatFcfa(r.fare)} le trajet`}
                    {r.isDoubleRide && (
                      <span className="ml-2 text-xs font-black px-2 py-0.5 rounded-full bg-corail/20 text-amber-800 border border-corail/40">
                        COURSE DOUBLE
                      </span>
                    )}
                    {r.isFreeRide && (
                      <span className="ml-2 text-xs font-black px-2 py-0.5 rounded-full bg-green-100 text-green-800 border border-green-300">
                        SANS COMMISSION
                      </span>
                    )}
                  </p>
                  <p className="text-slate-500">
                    {r.completedAt
                      ? new Date(r.completedAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : r.day}
                    {' · '}prix accepté {formatFcfa(r.fare)} · commission {formatFcfa(r.commission)}
                    {r.isDoubleRide ? ' · points doublés' : ''}
                    {r.isFreeRide ? ' · course sans commission (échange de points)' : ''}
                  </p>
                </div>
                <span className="text-sm font-black text-stacks-green">+{formatFcfa(r.kept)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
