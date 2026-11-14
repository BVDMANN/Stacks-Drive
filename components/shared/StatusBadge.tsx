import { cn } from '@/lib/utils';

const RIDE_LABELS: Record<string, { label: string; className: string }> = {
  recherche: { label: 'Recherche de chauffeurs', className: 'bg-amber-100 text-amber-800' },
  propositions: { label: 'Propositions reçues', className: 'bg-blue-100 text-blue-800' },
  acceptee: { label: 'Confirmée', className: 'bg-blue-100 text-blue-800' },
  en_cours: { label: 'En cours', className: 'bg-stacks-green text-white' },
  terminee: { label: 'Terminée', className: 'bg-green-100 text-green-800' },
  annulee: { label: 'Annulée', className: 'bg-red-100 text-red-800' },
  // Courses planifiées (v2.30) : pas encore envoyée / heure passée.
  planifiee: { label: 'Planifiée', className: 'bg-violet-100 text-violet-800' },
  expiree: { label: 'Expirée — à relancer', className: 'bg-slate-100 text-slate-600' },
};

const PROPOSAL_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'En attente', className: 'bg-amber-100 text-amber-800' },
  accepted: { label: 'Acceptée', className: 'bg-green-100 text-green-800' },
  declined: { label: 'Refusée', className: 'bg-slate-100 text-slate-600' },
  expired: { label: 'Expirée', className: 'bg-slate-100 text-slate-500' },
};

const VERIFICATION_LABELS: Record<string, { label: string; className: string }> = {
  non_verifie: { label: 'Non vérifié', className: 'bg-slate-100 text-slate-600' },
  en_attente: { label: 'Vérification en cours', className: 'bg-amber-100 text-amber-800' },
  verifie: { label: 'Vérifié', className: 'bg-green-100 text-green-800' },
  refuse: { label: 'Vérification refusée', className: 'bg-red-100 text-red-800' },
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={cn('inline-flex px-3 py-1 rounded-full text-xs font-black', className)}>
      {label}
    </span>
  );
}

export function RideStatusBadge({ status }: { status: string }) {
  const s = RIDE_LABELS[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' };
  return <Badge {...s} />;
}

export function ProposalStatusBadge({ status }: { status: string }) {
  const s = PROPOSAL_LABELS[status] ?? { label: status, className: 'bg-slate-100 text-slate-700' };
  return <Badge {...s} />;
}

export function VerificationStatusBadge({ status }: { status: string }) {
  const s = VERIFICATION_LABELS[status] ?? {
    label: status,
    className: 'bg-slate-100 text-slate-700',
  };
  return <Badge {...s} />;
}
