'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DriveCheck, DrivePlay, DriveX } from '@/components/icons/DriveUi';
import { timeAgo } from '@/lib/dates';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { MAP_REPORT_KIND_LABELS } from '@/lib/map-reports';
import type { MapReport, MapReportStatus } from '@/lib/map-reports-server';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<MapReportStatus, string> = {
  ouvert: 'bg-amber-100 text-amber-800 border-amber-200',
  en_cours: 'bg-sky-100 text-sky-800 border-sky-200',
  resolu: 'bg-green-100 text-green-800 border-green-200',
  rejete: 'bg-slate-100 text-slate-600 border-slate-200',
};

const STATUS_LABELS: Record<MapReportStatus, string> = {
  ouvert: 'Ouvert',
  en_cours: 'En cours',
  resolu: 'Résolu',
  rejete: 'Rejeté',
};

/** File des signalements « erreurs de carte » (v2.49) : lieu
 *  manquant, quartier mal placé, erreur d'adresse. L'admin les
 *  prend en charge, les marque résolus une fois la carte corrigée,
 *  ou les rejette (signalement infondé). */
export function MapReportsReview({ reports }: { reports: MapReport[] }) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'ouverts' | 'tous'>('ouverts');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    return reports.filter((r) => (statusFilter === 'ouverts' ? r.status === 'ouvert' || r.status === 'en_cours' : true));
  }, [reports, statusFilter]);

  async function setStatus(id: string, status: MapReportStatus) {
    setLoadingId(id);
    setError(null);
    const res = await fetch(`/api/admin/map-reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'Mise à jour impossible.');
      return;
    }
    router.refresh();
  }

  if (reports.length === 0) {
    return <p className="text-sm text-slate-500">Aucun signalement pour le moment — la carte est à jour.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['ouverts', 'tous'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setStatusFilter(f)}
            className={cn(
              'text-xs font-black px-3 py-1.5 rounded-full border',
              statusFilter === f
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            )}
          >
            {f === 'ouverts' ? 'Ouverts' : 'Tous'}
          </button>
        ))}
      </div>
      {error && <p className="text-sm font-bold text-red-600">{error}</p>}
      {visible.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun signalement ouvert.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="border border-slate-200 rounded-2xl p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 border border-rose-200">
                  {MAP_REPORT_KIND_LABELS[r.kind]}
                </span>
                <span className={cn('text-xs font-black px-2 py-0.5 rounded-full border', STATUS_STYLES[r.status])}>
                  {STATUS_LABELS[r.status]}
                </span>
                <span className="text-xs text-slate-400 ml-auto">{timeAgo(r.createdAt)}</span>
              </div>
              <p className="font-black text-slate-900">{r.title}</p>
              <p className="text-sm text-slate-600 leading-relaxed">{r.details}</p>
              <p className="text-xs text-slate-400">
                Signalé par {r.userName ?? 'un utilisateur'}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {r.status === 'ouvert' && (
                  <button
                    type="button"
                    disabled={loadingId === r.id}
                    onClick={() => void setStatus(r.id, 'en_cours')}
                    className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    {loadingId === r.id ? <LogoLoader size={16} /> : <DrivePlay size={13} />}
                    Prendre en charge
                  </button>
                )}
                {r.status !== 'resolu' && (
                  <button
                    type="button"
                    disabled={loadingId === r.id}
                    onClick={() => void setStatus(r.id, 'resolu')}
                    className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {loadingId === r.id ? <LogoLoader size={16} /> : <DriveCheck size={13} />}
                    Marquer résolu
                  </button>
                )}
                {r.status !== 'rejete' && (
                  <button
                    type="button"
                    disabled={loadingId === r.id}
                    onClick={() => void setStatus(r.id, 'rejete')}
                    className="inline-flex items-center gap-1 text-xs font-black px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                  >
                    {loadingId === r.id ? <LogoLoader size={16} /> : <DriveX size={13} />}
                    Rejeter
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
