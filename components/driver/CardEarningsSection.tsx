'use client';

import { useCallback, useEffect, useState } from 'react';
import { DriveCalendar, DriveCreditCard, DriveRefresh, DriveTrendingUp } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { formatFcfa } from '@/lib/commission';
import { cn } from '@/lib/utils';

type CardRide = {
  rideId: string;
  day: string;
  completedAt: string | null;
  pickup: string | null;
  destination: string | null;
  paymentMethod: string;
  loyaltyFree: boolean;
  fare: number;
  commission: number;
  kept: number;
  moneyStatus: 'carte_encaissee' | 'carte_en_attente' | 'capture_en_echec' | 'plateforme' | 'especes';
  batchStatus: string | null;
  batchDate: string | null;
};

type Batch = {
  id: string;
  date: string;
  ridesCount: number;
  driverShare: number;
  platformFunded: number;
  status: string;
  rail: string;
  reference: string | null;
  paidAt: string | null;
};

const MONEY_STATUS_LABELS: Record<CardRide['moneyStatus'], { label: string; className: string }> = {
  carte_encaissee: { label: 'Encaissé par carte', className: 'bg-green-100 text-green-800 border-green-300' },
  carte_en_attente: { label: 'En attente de capture', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  capture_en_echec: { label: 'Capture en échec — la plateforme avance ta part', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  plateforme: { label: 'Course offerte — payée par la plateforme', className: 'bg-violet-100 text-violet-800 border-violet-300' },
  especes: { label: 'Payé en espèces / Mobile Money', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const BATCH_STATUS_LABELS: Record<string, string> = {
  prepare: 'Préparé',
  pret_a_virer: 'Prêt à virer',
  vire: 'Viré',
  echoue: 'En échec',
};

/** Gains carte en TEMPS RÉEL (v2.55) : la réponse au
 *  « hebdomadaire, c'est trop long ».
 *
 *  Le chauffeur voit, course par course et dès la fin de la
 *  course : le prix, la commission prélevée automatiquement
 *  et sa part nette — avec le statut de l'argent (encaissé,
 *  en attente, versé). Les courses carte sont versées en LOT
 *  QUOTIDIEN chaque matin (plus d'attente d'une semaine) :
 *  le lot de la veille est préparé à 05h00, l'argent part dès
 *  que les fonds Stripe sont réglés (~2 jours ouvrés après
 *  la capture — délai bancaire, pas un choix de la plateforme).
 */
export function CardEarningsSection() {
  const [rides, setRides] = useState<CardRide[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [totals, setTotals] = useState<{ pendingKept: number; inBatchKept: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/driver/card-earnings');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        if (res.status === 503) setNotConfigured(true);
        setError(data?.error ?? 'Gains carte indisponibles pour le moment.');
        return;
      }
      setRides((data.rides as CardRide[]) ?? []);
      setBatches((data.batches as Batch[]) ?? []);
      setTotals(data.totals ?? null);
    } catch {
      setError('Connexion impossible — vérifie ton réseau et réessaie.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm">
        <LogoLoader size={32} label="Chargement de tes gains carte…" />
      </section>
    );
  }

  if (notConfigured) return null;

  const cardRides = rides.filter((r) => r.moneyStatus !== 'especes');

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
            <DriveCreditCard size={20} className="text-stacks-green" /> Tes gains carte — en temps réel
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Courses payées par carte : la commission est prélevée
            automatiquement, tu vois ta part nette tout de suite.
            Versement en lot <strong>chaque matin</strong> (plus
            d’attente d’une semaine).
          </p>
        </div>
        <button
          type="button"
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
        >
          <DriveRefresh size={14} /> Actualiser
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Totaux : en attente du lot de demain / dans un lot */}
      {totals && (totals.pendingKept > 0 || totals.inBatchKept > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-night-900 text-white p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">À verser demain matin</p>
            <p className="text-2xl font-black mt-1 text-sarcelle">{formatFcfa(totals.pendingKept)}</p>
            <p className="text-xs text-slate-400 mt-1">Courses carte terminées, pas encore dans un lot.</p>
          </div>
          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">Dans un lot en cours</p>
            <p className="text-2xl font-black mt-1 text-stacks-navy">{formatFcfa(totals.inBatchKept)}</p>
            <p className="text-xs text-slate-500 mt-1">Lot préparé — l’argent part dès que les fonds sont réglés.</p>
          </div>
        </div>
      )}

      {/* Détail par course (carte uniquement) */}
      {cardRides.length === 0 ? (
        <p className="text-sm text-slate-500">
          Aucune course payée par carte pour le moment — tes gains
          carte apparaîtront ici, course par course, dès la première.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {cardRides.map((r) => {
            const status = MONEY_STATUS_LABELS[r.moneyStatus];
            return (
              <li key={r.rideId} className="py-3 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {r.pickup && r.destination ? `${r.pickup} → ${r.destination}` : formatFcfa(r.fare)}
                    {r.loyaltyFree && (
                      <span className="ml-2 text-xs font-black px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 border border-violet-300">
                        OFFERTE
                      </span>
                    )}
                  </p>
                  <span className="text-sm font-black text-stacks-green">+{formatFcfa(r.kept)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {r.completedAt
                    ? new Date(r.completedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : r.day}
                  {' · '}prix {formatFcfa(r.fare)} · commission {formatFcfa(r.commission)} · ta part {formatFcfa(r.kept)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className={cn('text-xs font-black px-2.5 py-1 rounded-full border', status.className)}>
                    {status.label}
                  </span>
                  {r.batchStatus && (
                    <span className="text-xs font-black px-2.5 py-1 rounded-full border bg-slate-100 text-slate-600 border-slate-200">
                      Lot du {r.batchDate} — {BATCH_STATUS_LABELS[r.batchStatus] ?? r.batchStatus}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Lots quotidiens récents */}
      {batches.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
            <DriveCalendar size={16} className="text-stacks-green" /> Tes lots quotidiens
          </h3>
          <ul className="space-y-2">
            {batches.slice(0, 5).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-sm bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
                <span className="font-bold text-slate-900">
                  Lot du {new Date(`${b.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  {' · '}{b.ridesCount} course{b.ridesCount > 1 ? 's' : ''}
                  {b.platformFunded > 0 && ` · dont ${formatFcfa(b.platformFunded)} avancés par la plateforme`}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-black text-stacks-green">{formatFcfa(b.driverShare)}</span>
                  <span className={cn(
                    'text-xs font-black px-2.5 py-1 rounded-full border',
                    b.status === 'vire'
                      ? 'bg-green-100 text-green-800 border-green-300'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  )}>
                    {BATCH_STATUS_LABELS[b.status] ?? b.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Le virement part chaque matin dès que les fonds Stripe sont
            réglés (~2 jours ouvrés après la capture, délai bancaire).
            Premier versement plus long (vérification du compte).
          </p>
        </div>
      )}
    </section>
  );
}
