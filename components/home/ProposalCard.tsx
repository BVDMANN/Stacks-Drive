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
  dropOffPoint,
  destinationLabel,
  onAccept,
  onDecline,
}: {
  proposal: RideProposal;
  estimatePrice: number;
  etaMin: number | null;
  secondsLeft: number;
  busy: boolean;
  /** Point de dépôt quand la destination est à accès difficile (v2.6).
   *  Null = destination normale, rien à afficher. */
  dropOffPoint?: string | null;
  destinationLabel?: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const driver = proposal.driver;
  const urgent = secondsLeft <= 15;
  const cheaper = proposal.proposedPrice < estimatePrice;
  const pricier = proposal.proposedPrice > estimatePrice;

  return (
    <article className="rise-in bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full bg-or text-night-900 font-black flex items-center justify-center shrink-0">
            {driver?.name?.trim().charAt(0) ?? 'C'}
          </span>
          <div className="min-w-0">
            <p className="font-black text-white flex flex-wrap items-center gap-1.5">
              <span className="truncate">{driver?.name ?? 'Chauffeur'}</span>
              {driver?.isVerified && (
                <span className="inline-flex items-center gap-0.5 text-xs font-black text-cyan shrink-0">
                  <BadgeCheck size={14} /> Vérifié
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <Star size={12} className="text-gold fill-gold" />
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
            'inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-black bg-white/10 text-slate-200 shrink-0',
            urgent && 'countdown-urgent bg-red-500/20'
          )}
          aria-label={`Expire dans ${secondsLeft} secondes`}
        >
          <Clock size={13} /> {secondsLeft} s
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-white leading-none">
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
        <div className="text-right text-xs font-bold text-slate-300 space-y-0.5">
          <p className="inline-flex items-center gap-1">
            <Users size={13} /> {proposal.seatsLeft} place{proposal.seatsLeft > 1 ? 's' : ''} restante{proposal.seatsLeft > 1 ? 's' : ''}
          </p>
          <p className="inline-flex items-center gap-1">
            <MapPin size={13} /> 1er arrêt : {proposal.firstStop}
          </p>
          {/* Route non bitumée (v2.6) : le chauffeur dit clairement s'il
              prend la piste jusqu'à la destination ou s'il s'arrête au
              point de dépôt (supplément retiré). */}
          {dropOffPoint && (
            <p className="inline-flex items-center gap-1 text-gold">
              <MapPin size={13} />
              {proposal.unpavedAccepted
                ? `Route non bitumée acceptée jusqu’à ${destinationLabel ?? 'la destination'}`
                : `S’arrête au point de dépôt : ${dropOffPoint}`}
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAccept(proposal.id)}
          className="flex-1 bg-or text-night-900 font-black py-3 rounded-full shadow-md shadow-or/30 hover:bg-or-light active:scale-[0.98] transition-all disabled:opacity-50"
        >
          Accepter
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDecline(proposal.id)}
          className="px-5 py-3 rounded-full font-black text-slate-300 bg-white/10 hover:bg-white/15 active:scale-95 transition-all disabled:opacity-50"
        >
          Refuser
        </button>
      </div>
    </article>
  );
}
