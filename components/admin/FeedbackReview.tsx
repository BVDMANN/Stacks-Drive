'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageSquareWarning, RefreshCw, Star, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/dates';

interface FeedbackItem {
  id: string;
  ride_id: string;
  from_user_id: string;
  from_role: string;
  rating: number | null;
  comment: string | null;
  category: string | null;
  kind: 'note' | 'plainte' | 'recommandation';
  created_at: string;
  ride?: { pickup: string; destination: string; status: string } | null;
  from_profile?: { full_name: string | null } | null;
  to_profile?: { full_name: string | null } | null;
}

const KIND_FILTERS = [
  { value: '', label: 'Tout' },
  { value: 'plainte', label: 'Plaintes' },
  { value: 'recommandation', label: 'Recommandations' },
  { value: 'note', label: 'Notes' },
] as const;

const KIND_STYLES: Record<string, string> = {
  plainte: 'bg-red-50 text-red-700 border-red-200',
  recommandation: 'bg-blue-50 text-blue-700 border-blue-200',
  note: 'bg-green-50 text-green-700 border-green-200',
};

/** Revue des retours (admin, v2.2) : notes, plaintes et recommandations
 *  des deux côtés, avec filtres. Une plainte = la course est à réviser. */
export function FeedbackReview() {
  const [kind, setKind] = useState('');
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = kind ? `/api/admin/feedback?kind=${kind}` : '/api/admin/feedback';
      const res = await fetch(url);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Lecture impossible.');
        return;
      }
      setItems((data.feedback ?? []) as FeedbackItem[]);
    } catch {
      setError('Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {KIND_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setKind(f.value)}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-black transition-colors',
              kind === f.value
                ? 'bg-stacks-navy text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={fetchItems}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-stacks-green"
        >
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {loading && <p className="text-sm text-slate-500">Chargement…</p>}

      {!loading && items.length === 0 && (
        <p className="text-sm text-slate-500">
          Aucun retour pour le moment — les notes, plaintes et recommandations
          des passagers et chauffeurs apparaîtront ici.
        </p>
      )}

      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="py-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('text-xs font-black px-2.5 py-1 rounded-full border', KIND_STYLES[item.kind])}>
                {item.kind === 'plainte'
                  ? 'Plainte'
                  : item.kind === 'recommandation'
                    ? 'Recommandation'
                    : 'Note'}
              </span>
              {item.kind === 'plainte' && item.category && (
                <span className="text-xs font-bold text-slate-500">{item.category}</span>
              )}
              {item.rating !== null && (
                <span className="inline-flex items-center gap-0.5 text-xs font-black text-amber-700">
                  <Star size={12} className="fill-stacks-amber text-stacks-amber" />
                  {item.rating}/5
                </span>
              )}
              <span className="text-xs text-slate-400 ml-auto">{timeAgo(item.created_at)}</span>
            </div>
            <p className="text-sm text-slate-700">
              {item.from_profile?.full_name ?? 'Utilisateur'} ({item.from_role === 'passager' ? 'passager' : 'chauffeur'})
              {item.to_profile?.full_name ? ` → ${item.to_profile.full_name}` : ''}
            </p>
            {item.comment && <p className="text-sm text-slate-600">« {item.comment} »</p>}
            <Link
              href={`/courses/${item.ride_id}`}
              className="inline-block text-sm font-bold text-stacks-green hover:underline"
            >
              {item.ride ? `${item.ride.pickup} → ${item.ride.destination}` : 'Voir la course'} →
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        {kind === 'plainte' || kind === '' ? (
          <>
            <MessageSquareWarning size={13} /> Une plainte signale la course
            pour révision — contacte les deux parties avant de décider.
          </>
        ) : (
          <>
            <ThumbsUp size={13} /> Les recommandations alimentent la liste
            des améliorations de Stacks Drive.
          </>
        )}
      </p>
    </div>
  );
}
