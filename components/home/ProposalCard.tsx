'use client';

import { BadgeCheck, Car, Clock, MapPin, Star, Users } from 'lucide-react';
import type { RideProposal } from '@/types';
import { formatFcfa } from '@/lib/commission';
import { cn } from '@/lib/utils';

/** Une proposition de chauffeur : prix, places, premier arrêt, compte à
 *  rebours de 60 s — le passager accepte ou refuse. */
export function ProposalCard({
  proposal,
  estimatePrice,
  etaMin,
  secondsLeft,
  busy,
  onAccept,
  onDecline,
}: {
  proposal: RideProposal;
  estimatePrice: number;
  etaMin: number | null;
  secondsLeft: number;
  busy: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const driver = proposal.driver;
  const urgent = secondsLeft <= 15;
  const cheaper = proposal.proposedPrice < estimatePrice;
  const pricier = proposal.proposedPrice > estimatePrice;

  return (
    <article className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full bg-stacks-green text-white font-black flex items-center justify-center shrink-0">
            {driver?.name?.trim().charAt(0) ?? 'C'}
          </span>
          <div className="min-w-0">
            <p className="font-black text-slate-900 flex flex-wrap items-center gap-1.5">
              <span className="truncate">{driver?.name ?? 'Chauffeur'}</span>
              {driver?.isVerified && (
                <span className="inline-flex items-center gap-0.5 text-xs font-black text-stacks-green shrink-0">
                  <BadgeCheck size={14} /> Vérifié
                </span>
              )}
            </p>
            <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <Star size={12} className="text-stacks-amber fill-stacks-amber" />
                {driver?.rating ? driver.rating.toFixed(1) : 'Nouveau'} · {driver?.trips ?? 0} courses
              </span>
              <span className="inline-flex items-center gap-1">
                <Car size={12} /> {driver?.vehicleLabel ?? ''} {driver?.plate ? `· ${driver.plate}` : ''}
              </span>
            </p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-black bg-slate-100 text-slate-700 shrink-0',
            urgent && 'countdown-urgent bg-red-50'
          )}
          aria-label={`Expire dans ${secondsLeft} secondes`}
        >
          <Clock size={13} /> {secondsLeft} s
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-stacks-navy leading-none">
            {formatFcfa(proposal.proposedPrice)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {cheaper
              ? `moins que l'estimation (${formatFcfa(estimatePrice)})`
              : pricier
                ? `au-dessus de l'estimation (${formatFcfa(estimatePrice)})`
                : `prix estimé (${formatFcfa(estimatePrice)})`}
            {etaMin !== null ? ` · arrive dans ~${etaMin} min` : ''}
          </p>
        </div>
        <div className="text-right text-xs font-bold text-slate-600 space-y-0.5">
          <p className="inline-flex items-center gap-1">
            <Users size={13} /> {proposal.seatsLeft} place{proposal.seatsLeft > 1 ? 's' : ''} restante{proposal.seatsLeft > 1 ? 's' : ''}
          </p>
          <p className="inline-flex items-center gap-1">
            <MapPin size={13} /> 1er arrêt : {proposal.firstStop}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAccept(proposal.id)}
          className="flex-1 bg-stacks-green text-white font-black py-3 rounded-full shadow-md shadow-stacks-green/20 hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
        >
          Accepter
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecline(proposal.id)}
          className="px-5 py-3 rounded-full font-black text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
        >
          Refuser
        </button>
      </div>
    </article>
  );
}
