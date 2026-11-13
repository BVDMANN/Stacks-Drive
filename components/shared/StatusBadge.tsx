import { cn } from '@/lib/utils';

const BOOKING_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-amber-100 text-amber-800' },
  confirmed: { label: 'Confirmée', className: 'bg-blue-100 text-blue-800' },
  cancelled: { label: 'Annulée', className: 'bg-red-100 text-red-800' },
  completed: { label: 'Terminée', className: 'bg-green-100 text-green-800' },
};

const RIDE_LABELS: Record<string, { label: string; className: string }> = {
  published: { label: 'Publiée', className: 'bg-green-100 text-green-800' },
  draft: { label: 'Brouillon', className: 'bg-slate-100 text-slate-700' },
  closed: { label: 'Fermée', className: 'bg-red-100 text-red-800' },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const s = BOOKING_LABELS[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' };
  return (
    <span className={cn('inline-flex px-3 py-1 rounded-full text-xs font-black', s.className)}>
      {s.label}
    </span>
  );
}

export function RideStatusBadge({ status }: { status: string }) {
  const s = RIDE_LABELS[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' };
  return (
    <span className={cn('inline-flex px-3 py-1 rounded-full text-xs font-black', s.className)}>
      {s.label}
    </span>
  );
}
