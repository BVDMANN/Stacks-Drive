'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DriveCheckBadge, DriveXCircle } from '@/components/icons/DriveUi';

export interface PendingDriver {
  id: string;
  name: string | null;
  phone: string | null;
  email: string;
  vehicle: string;
  documentType: string | null;
  selfieUrl: string | null;
  documentUrl: string | null;
}

/** Revue des vérifications chauffeurs (admin) : selfie + pièce affichés,
 *  Valider ou Refuser (avec motif). */
export function VerificationReview({ drivers }: { drivers: PendingDriver[] }) {
  const router = useRouter();
  const [refusingId, setRefusingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(driverId: string, status: 'verifie' | 'refuse', verificationNote?: string) {
    setError(null);
    setLoadingId(driverId);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId, verificationStatus: status, verificationNote }),
    });
    const data = await res.json().catch(() => null);
    setLoadingId(null);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    setRefusingId(null);
    setNote('');
    router.refresh();
  }

  if (drivers.length === 0) {
    return <p className="text-sm text-slate-500">Aucune vérification en attente.</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {drivers.map((d) => (
        <article key={d.id} className="border border-slate-200 rounded-3xl p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-black text-slate-900 text-lg">{d.name ?? 'Sans nom'}</p>
              <p className="text-sm text-slate-500">
                {d.phone ?? '—'} · {d.email}
              </p>
              <p className="text-sm text-slate-500">{d.vehicle || 'Véhicule non renseigné'}</p>
              <p className="text-sm font-bold text-slate-600 mt-1">
                Pièce : {d.documentType === 'cni' ? 'CNI' : d.documentType === 'passeport' ? 'Passeport' : d.documentType === 'permis' ? 'Permis de conduire' : '—'}
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-full text-xs font-black bg-amber-100 text-amber-800">
              En attente
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <figure className="space-y-1.5">
              <figcaption className="text-xs font-black uppercase tracking-widest text-slate-400">
                Selfie
              </figcaption>
              {d.selfieUrl ? (
                <img src={d.selfieUrl} alt={`Selfie de ${d.name ?? 'chauffeur'}`} className="w-full max-w-xs rounded-2xl border border-slate-200 object-cover" />
              ) : (
                <p className="text-sm text-slate-400">Aucun selfie.</p>
              )}
            </figure>
            <figure className="space-y-1.5">
              <figcaption className="text-xs font-black uppercase tracking-widest text-slate-400">
                Pièce d’identité
              </figcaption>
              {d.documentUrl ? (
                <img src={d.documentUrl} alt={`Pièce de ${d.name ?? 'chauffeur'}`} className="w-full max-w-xs rounded-2xl border border-slate-200 object-cover" />
              ) : (
                <p className="text-sm text-slate-400">Aucune pièce.</p>
              )}
            </figure>
          </div>

          {refusingId === d.id ? (
            <div className="space-y-3 bg-red-50 border border-red-200 rounded-2xl p-4">
              <label htmlFor={`refuse-note-${d.id}`} className="text-sm font-bold text-red-800">
                Motif du refus (visible par le chauffeur)
              </label>
              <textarea
                id={`refuse-note-${d.id}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex : photo de la pièce illisible, selfie flou…"
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl bg-white border border-red-200 text-sm focus:border-red-400 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loadingId === d.id || note.trim().length < 3}
                  onClick={() => decide(d.id, 'refuse', note.trim())}
                  className="px-5 py-2.5 rounded-full text-sm font-black bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  Confirmer le refus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRefusingId(null);
                    setNote('');
                  }}
                  className="px-5 py-2.5 rounded-full text-sm font-black bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loadingId === d.id}
                onClick={() => decide(d.id, 'verifie')}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
              >
                <DriveCheckBadge size={16} /> Valider — chauffeur vérifié
              </button>
              <button
                type="button"
                disabled={loadingId === d.id}
                onClick={() => setRefusingId(d.id)}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-white border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <DriveXCircle size={16} /> Refuser
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
