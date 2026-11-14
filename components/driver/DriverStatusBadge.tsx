'use client';

import type { DriverStatus } from '@/types';
import { DRIVER_STATUS_LABELS } from '@/lib/seats';
import { cn } from '@/lib/utils';

/** Pastille de statut chauffeur (v2.19) — visible côté chauffeur
 *  (accueil + tableau de bord) et côté admin. Toujours accompagnée
 *  du compteur « X/Y places libres » : le statut seul ne dit pas
 *  combien de places restent. */
export function DriverStatusBadge({
  status,
  freeSeats,
  capacity,
}: {
  status: DriverStatus;
  freeSeats: number | null;
  capacity: number | null;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full',
          status === 'vide' && 'bg-green-100 text-green-800',
          status === 'en_course' && 'bg-amber-100 text-amber-800',
          status === 'plein' && 'bg-red-100 text-red-700'
        )}
      >
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            status === 'vide' && 'bg-green-600',
            status === 'en_course' && 'bg-amber-600',
            status === 'plein' && 'bg-red-600'
          )}
        />
        {DRIVER_STATUS_LABELS[status]}
      </span>
      {freeSeats !== null && capacity !== null && (
        <span className="text-xs font-bold text-slate-400">
          {freeSeats}/{capacity} place{capacity > 1 ? 's' : ''} libre{freeSeats > 1 ? 's' : ''}
        </span>
      )}
    </span>
  );
}
