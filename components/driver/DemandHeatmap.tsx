'use client';

import { useCallback, useEffect, useState } from 'react';
import { DriveFlame, DriveTrendingUp } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import type { DemandZone } from '@/lib/heatmap';
import { cn } from '@/lib/utils';

const LEVEL_LABEL: Record<DemandZone['level'], string> = {
  forte: 'Forte demande',
  moyenne: 'Demande moyenne',
  faible: 'Demande faible',
};

const LEVEL_STYLE: Record<DemandZone['level'], string> = {
  forte: 'bg-red-500',
  moyenne: 'bg-amber-400',
  faible: 'bg-emerald-400',
};

/** Heatmap de demande côté chauffeur (v2.30) — INFO SEULEMENT.
 *  Liste des quartiers les plus demandés sur les 7 derniers jours
 *  (vraies demandes, jamais de données inventées) + nombre de
 *  demandes restées sans proposition. Sans surge, sans prix
 *  dynamique, sans promesse de gain : se placer dans une zone chaude
 *  ne garantit aucune course. */
export function DemandHeatmap() {
  const [zones, setZones] = useState<DemandZone[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const fetchHeatmap = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/heatmap');
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setZones((data.zones ?? []) as DemandZone[]);
        setTotal(data.totalRides ?? 0);
      }
    } catch {
      // Prochain tour.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    fetchHeatmap();
    const t = window.setInterval(fetchHeatmap, 60000);
    return () => window.clearInterval(t);
  }, [fetchHeatmap]);

  const max = Math.max(1, ...zones.map((z) => z.rides));

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-3">
      <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
        <DriveFlame size={18} className="text-red-500" /> Zones demandées — 7 derniers jours
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed">
        Info seulement, à partir des vraies demandes : sans surge, sans prix dynamique, aucune
        promesse de gain — une zone chaude ne garantit pas de course.
      </p>
      {!loaded ? (
        <LogoLoader size={32} label="Chargement des zones…" />
      ) : zones.length === 0 ? (
        <p className="text-sm text-slate-500">
          Pas encore assez de demandes cette semaine pour classer les zones
          {total === 0 ? ' — les zones apparaîtront quand les passagers commanderont.' : '.'}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {zones.map((z) => (
            <li key={z.neighborhood} className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-bold text-slate-900 flex items-center gap-1.5">
                  <DriveTrendingUp size={14} className="text-stacks-green shrink-0" />
                  {z.neighborhood}
                </span>
                <span className="text-slate-500">
                  {z.rides} demande{z.rides > 1 ? 's' : ''} · {LEVEL_LABEL[z.level]}
                  {z.unanswered > 0 ? ` · ${z.unanswered} sans chauffeur` : ''}
                </span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={cn('h-full rounded-full', LEVEL_STYLE[z.level])}
                  style={{ width: `${Math.max(8, Math.round((z.rides / max) * 100))}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
