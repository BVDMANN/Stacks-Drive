'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  CalendarDays,
  Crown,
  Flame,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { DriverEarningsSummary } from '@/lib/earnings';
import { BADGES, DEPOSIT_FCFA } from '@/lib/gamification';
import { formatFcfa } from '@/lib/commission';
import { cn } from '@/lib/utils';

const TIER_STYLES: Record<string, string> = {
  Bronze: 'bg-amber-700/20 text-amber-300 border-amber-700/40',
  Argent: 'bg-slate-400/20 text-slate-200 border-slate-400/40',
  Or: 'bg-gold/15 text-gold border-gold/40',
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
      <p className={cn('text-2xl font-black mt-2', highlight ? 'text-cyan' : 'text-stacks-navy')}>
        {formatFcfa(kept)}
      </p>
      <p className={cn('text-sm mt-1', highlight ? 'text-slate-300' : 'text-slate-500')}>
        {rides} course{rides > 1 ? 's' : ''} · commission due {formatFcfa(commission)}
      </p>
    </div>
  );
}

/** Tableau de bord des gains chauffeur (v2.2) : par course, total 24 h,
 *  montant dû en temps réel, récap hebdo + mensuel, dépôt, dette vs
 *  plafond, quête, niveau, badges, chauffeur de la semaine.
 *  Les chiffres viennent de /api/driver/earnings (calculés côté serveur). */
export function DriverEarnings() {
  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
        {summary.week.questBonus > 0 && (
          <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
            Bonus de quête cette semaine : +{formatFcfa(summary.week.questBonus)} — offerts par Stacks Drive.
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
        </div>
      </section>

      {/* Quête du jour + série */}
      <section className="bg-night-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 text-slate-100">
        <h2 className="font-black text-lg flex items-center gap-2">
          <Sparkles size={20} className="text-gold" /> Quête du jour
        </h2>
        <div className="flex items-center justify-between gap-3">
          <p className="font-black">
            {summary.quest.day.done} / {summary.quest.day.target} courses
          </p>
          <span className="text-sm font-black text-gold">
            Bonus : {formatFcfa(summary.quest.day.bonus)}
          </span>
        </div>
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-or via-gold to-cyan transition-all"
            style={{ width: `${questPct}%` }}
          />
        </div>
        <p className="text-sm text-slate-300">
          {summary.quest.day.claimed
            ? 'Quête validée — bonus versé !'
            : summary.quest.day.done >= summary.quest.day.target
              ? 'Quête terminée — le bonus arrive avec ta prochaine course.'
              : `Plus que ${summary.quest.day.target - summary.quest.day.done} course${summary.quest.day.target - summary.quest.day.done > 1 ? 's' : ''} pour ton bonus de ${formatFcfa(summary.quest.day.bonus)} !`}
        </p>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {summary.streakDays > 0 && (
            <span className="inline-flex items-center gap-1 font-bold">
              <Flame size={16} className="text-or" /> Série : {summary.streakDays} jour{summary.streakDays > 1 ? 's' : ''} d’affilée
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-bold">
            <CalendarDays size={16} className="text-cyan" />
            Défi semaine : {summary.quest.week.done} / {summary.quest.week.target} → {formatFcfa(summary.quest.week.bonus)}
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
                  className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-gold/15 text-amber-800 border border-gold/40"
                >
                  <ShieldCheck size={13} /> {def?.title ?? badgeId}
                </span>
              );
            })}
          </div>
        )}
        {summary.driverOfWeek && (
          <p className="text-sm text-slate-600 flex items-center gap-1.5 bg-slate-50 border border-slate-100 rounded-2xl p-3">
            <Crown size={16} className="text-gold shrink-0" />
            Chauffeur de la semaine : <strong>{summary.driverOfWeek.name ?? '—'}</strong> —{' '}
            {summary.driverOfWeek.rides} courses
            {summary.driverOfWeek.rating !== null ? ` · note ${summary.driverOfWeek.rating}/5` : ''}.
          </p>
        )}
      </section>

      {/* Détail par course */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3">
        <h2 className="font-black text-lg text-slate-900">Dernières courses</h2>
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
                    {formatFcfa(r.fare)} le trajet · {formatFcfa(r.kept)} pour toi
                    {r.isDoubleRide && (
                      <span className="ml-2 text-xs font-black px-2 py-0.5 rounded-full bg-gold/20 text-amber-800 border border-gold/40">
                        COURSE DOUBLE
                      </span>
                    )}
                  </p>
                  <p className="text-slate-500">
                    {r.day} · commission {formatFcfa(r.commission)}
                    {r.questBonus > 0 ? ` · bonus de quête +${formatFcfa(r.questBonus)}` : ''}
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
