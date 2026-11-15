'use client';

import { useState } from 'react';
import { DriveCheckBadge, DriveClock, DrivePin, DriveStar, DriveUsers } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { DriveCarMini } from '@/components/icons/DriveCar';
import type { RideProposal } from '@/types';
import { formatFcfa } from '@/lib/commission';
import { roundAcceptedPrice } from '@/lib/price-rounding';
import { driverFirstName } from '@/lib/proposal-events';
import { cn } from '@/lib/utils';
import { useRoadRoute } from '@/lib/use-road-route';
import type { RoutePoint } from '@/lib/routing';

/** Une proposition de chauffeur : prix, places, premier arrêt, compte à
 *  rebours de 60 s — le passager accepte, refuse, ou contre-propose
 *  son prix (v2.11 : le prix final se décide entre les deux parties,
 *  puis il est figé à l'acceptation).
 *
 *  Confidentialité (v2.20) : c'est ICI, au matching, que l'identité du
 *  chauffeur apparaît pour la première fois — prénom + initiale
 *  (photo), véhicule, plaque, note. Pas de nom complet, jamais de
 *  téléphone. La « photo » est l'initiale : le selfie de vérification
 *  est un document d'identité privé, il n'est jamais affiché au
 *  passager. */
export function ProposalCard({
  proposal,
  rideType,
  estimatePrice,
  estimateBreakdown,
  distanceKm,
  durationMin,
  etaMin,
  pickup,
  secondsLeft,
  busy,
  dropOffPoint,
  destinationLabel,
  onAccept,
  onDecline,
  onCounter,
}: {
  proposal: RideProposal;
  /** Type de course de la demande : en Solo le véhicule est entier,
   *  en Groupe le chauffeur indique ses places restantes. */
  rideType?: 'solo' | 'groupe';
  estimatePrice: number;
  /** Décomposition de l'estimation indicative (« 500 FCFA prise en
   *  charge + 4,8 km × 210 FCFA/km ») — affichée sous le prix pour que
   *  le passager voie comment l'estimation est calculée (v2.11). Ce
   *  n'est pas un prix : le prix final est convenu entre le passager
   *  et le chauffeur. */
  estimateBreakdown?: string;
  /** Distance / durée du trajet (v2.23) : le récapitulatif écrit
   *  avant acceptation — prix, distance, durée. */
  distanceKm?: number | null;
  durationMin?: number | null;
  etaMin: number | null;
  /** Point de départ : sert à l'ETA routière (P0b) — position du
   *  chauffeur → pickup par la route. Sans lui, on garde l'ETA à vol
   *  d'oiseau (`etaMin`). */
  pickup?: RoutePoint | null;
  secondsLeft: number;
  busy: boolean;
  /** Point de dépôt quand la destination est à accès difficile (v2.6).
   *  Null = destination normale, rien à afficher. */
  dropOffPoint?: string | null;
  destinationLabel?: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  /** Contre-proposition du passager : renvoie true si elle est acceptée
   *  par le serveur (la carte affiche alors le montant envoyé). */
  onCounter: (id: string, price: number) => Promise<boolean>;
}) {
  const driver = proposal.driver;
  // ETA routière (P0b) : dès la proposition reçue, si la position du
  // chauffeur est connue, durée + distance par la route (OSRM) vers
  // le pickup — recalculée quand il bouge (hook partagé, cache 5
  // min). Sinon, l'ETA à vol d'oiseau (`etaMin`) reste affichée.
  const driverPos: RoutePoint | null =
    driver && driver.lat !== null && driver.lng !== null
      ? { lat: driver.lat, lng: driver.lng }
      : null;
  const { route: roadEtaRoute } = useRoadRoute(driverPos, pickup ?? null, {
    enabled: !!driverPos && !!pickup,
  });
  const roadEtaMin = roadEtaRoute?.durationMin ?? null;
  const roadEtaKm = roadEtaRoute?.distanceKm ?? null;
  const etaText =
    roadEtaMin !== null
      ? ` · arrive dans ~${roadEtaMin} min${roadEtaKm !== null ? ` (${roadEtaKm.toFixed(1).replace('.', ',')} km par la route)` : ''}`
      : etaMin !== null
        ? ` · arrive dans ~${etaMin} min`
        : '';
  // Prénom uniquement (v2.20) : le nom complet n'apparaît qu'une fois
  // la course acceptée (carte chauffeur, suivi, historique).
  const driverDisplayName = driver ? driverFirstName(proposal) : 'Chauffeur';
  const urgent = secondsLeft <= 15;
  const cheaper = proposal.proposedPrice < estimatePrice;
  const pricier = proposal.proposedPrice > estimatePrice;
  // Arrondi v2.34 (à confirmer par le propriétaire avant le push) :
  // le prix figé à l'acceptation est arrondi à 50 FCFA près — le
  // montant arrondi est affiché AVANT l'acceptation, quand il diffère.
  const roundedPrice = roundAcceptedPrice(proposal.proposedPrice);

  // Contre-proposition (v2.11) : le passager propose son prix au
  // chauffeur — qui peut l'accepter ou proposer un autre prix.
  const [showCounter, setShowCounter] = useState(false);
  const [counterValue, setCounterValue] = useState(
    proposal.counterPrice !== null ? String(proposal.counterPrice) : ''
  );
  const [counterError, setCounterError] = useState<string | null>(null);
  const [counterBusy, setCounterBusy] = useState(false);
  const [counterSent, setCounterSent] = useState<number | null>(proposal.counterPrice);

  async function submitCounter(e: React.FormEvent) {
    e.preventDefault();
    setCounterError(null);
    const price = Math.round(Number(counterValue));
    if (!Number.isFinite(price) || price < 400 || price > 50000) {
      setCounterError('Ton prix doit être entre 400 et 50 000 FCFA.');
      return;
    }
    if (price === proposal.proposedPrice) {
      setCounterError('C’est déjà le prix proposé par le chauffeur — accepte-le directement.');
      return;
    }
    setCounterBusy(true);
    const ok = await onCounter(proposal.id, price);
    setCounterBusy(false);
    if (ok) {
      setCounterSent(price);
      setShowCounter(false);
    } else {
      setCounterError('Contre-proposition impossible pour le moment. Réessaie.');
    }
  }

  return (
    <article className="rise-in bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full bg-rose-500 text-night-900 font-black flex items-center justify-center shrink-0">
            {driverDisplayName.trim().charAt(0) ?? 'C'}
          </span>
          <div className="min-w-0">
            <p className="font-black text-white flex flex-wrap items-center gap-1.5">
              <span className="truncate">{driverDisplayName}</span>
              {driver?.isVerified && (
                <span className="inline-flex items-center gap-0.5 text-xs font-black text-sarcelle shrink-0">
                  <DriveCheckBadge size={14} /> Vérifié
                </span>
              )}
            </p>
            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                <DriveStar size={12} className="text-corail fill-corail" />
                {driver?.rating ? driver.rating.toFixed(1) : 'Nouveau'} · {driver?.trips ?? 0} courses
              </span>
              <span className="inline-flex items-center gap-1">
                <DriveCarMini variant="sedan" size={12} tone="light" /> {driver?.vehicleLabel ?? ''} {driver?.plate ? `· ${driver.plate}` : ''}
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
          <DriveClock size={13} /> {secondsLeft} s
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-black text-white leading-none">
            {formatFcfa(proposal.proposedPrice)}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {cheaper
              ? `moins que l'estimation indicative (${formatFcfa(estimatePrice)})`
              : pricier
                ? `au-dessus de l'estimation indicative (${formatFcfa(estimatePrice)})`
                : `égal à l'estimation indicative (${formatFcfa(estimatePrice)})`}
            {etaText}
          </p>
          {estimateBreakdown && (
            <p className="text-[11px] text-slate-500 mt-0.5">{estimateBreakdown}</p>
          )}
        </div>
        <div className="text-right text-xs font-bold text-slate-300 space-y-0.5">
          <p className="inline-flex items-center gap-1">
            {rideType === 'solo' ? (
              <>
                <DriveCarMini variant="sedan" size={13} tone="light" /> Véhicule entier
              </>
            ) : (
              <>
                <DriveUsers size={13} /> {proposal.seatsLeft} place{proposal.seatsLeft > 1 ? 's' : ''} restante{proposal.seatsLeft > 1 ? 's' : ''}
              </>
            )}
          </p>
          <p className="inline-flex items-center gap-1">
            <DrivePin size={13} /> 1er arrêt : {proposal.firstStop}
          </p>
          {/* Route non bitumée (v2.6) : le chauffeur dit clairement s'il
              prend la piste jusqu'à la destination ou s'il s'arrête au
              point de dépôt (supplément retiré). */}
          {dropOffPoint && (
            <p className="inline-flex items-center gap-1 text-corail">
              <DrivePin size={13} />
              {proposal.unpavedAccepted
                ? `Route non bitumée acceptée jusqu’à ${destinationLabel ?? 'la destination'}`
                : `S’arrête au point de dépôt : ${dropOffPoint}`}
            </p>
          )}
        </div>
      </div>

      {/* Contre-proposition du passager (v2.11) : propose ton prix au
          chauffeur — il peut l'accepter ou proposer un autre prix. */}
      {counterSent !== null && !showCounter ? (
        <p className="text-sm font-bold text-sarcelle bg-sarcelle/10 border border-sarcelle/30 rounded-2xl px-3.5 py-2.5">
          Ta contre-proposition : {formatFcfa(counterSent)} — en attente du chauffeur.
          <button
            type="button"
            onClick={() => setShowCounter(true)}
            className="ml-2 underline font-black"
          >
            Modifier
          </button>
        </p>
      ) : showCounter ? (
        <form onSubmit={submitCounter} className="space-y-2">
          {counterError && (
            <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-2.5">
              {counterError}
            </p>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              min={400}
              max={50000}
              step={50}
              inputMode="numeric"
              required
              value={counterValue}
              onChange={(e) => setCounterValue(e.target.value)}
              placeholder="Ton prix (FCFA)"
              aria-label="Ta contre-proposition en FCFA"
              className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/15 text-sm font-bold text-white placeholder:text-slate-500 focus:border-sarcelle focus:outline-none"
            />
            <button
              type="submit"
              disabled={counterBusy}
              className="px-4 py-2.5 rounded-xl bg-sarcelle text-night-900 text-sm font-black hover:bg-emerald-300 active:scale-95 transition-all disabled:opacity-50"
            >
              {counterBusy ? 'Envoi…' : 'Proposer'}
            </button>
            <button
              type="button"
              onClick={() => setShowCounter(false)}
              className="px-3 py-2.5 rounded-xl text-sm font-bold text-slate-300 bg-white/10 hover:bg-white/15 transition-colors"
            >
              Annuler
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Le chauffeur peut accepter ton prix ou en proposer un autre — le prix accepté est figé.
          </p>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowCounter(true)}
          className="text-sm font-bold text-sarcelle hover:underline self-start"
        >
          Contre-proposer un prix →
        </button>
      )}

      {/* Récapitulatif écrit avant acceptation (v2.23) : prix, distance,
          durée — le passager sait exactement ce qu'il accepte, le prix
          accepté est ensuite figé. */}
      <p className="text-xs text-slate-400 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5">
        Récapitulatif avant acceptation :{' '}
        <strong className="text-slate-200">{formatFcfa(proposal.proposedPrice)}</strong>
        {distanceKm !== null && distanceKm !== undefined ? ` · ~${Math.max(1, Math.round(distanceKm))} km` : ''}
        {durationMin !== null && durationMin !== undefined ? ` · ~${durationMin} min` : ''}
        {etaMin !== null ? ` · chauffeur à ~${etaMin} min` : ''} — prix figé une fois accepté.
        {roundedPrice !== proposal.proposedPrice && (
          <> Prix figé après arrondi à 50 FCFA près : <strong className="text-slate-200">{formatFcfa(roundedPrice)}</strong>.</>
        )}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAccept(proposal.id)}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-rose-500 text-night-900 font-black py-3 rounded-full shadow-md shadow-rose-500/30 hover:bg-rose-300 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {/* Règle 1 (v2.17) : l'acceptation d'un prix attend le serveur
              — le bouton le montre, il n'est pas juste grisé. */}
          {busy && <LogoLoader size={18} />}
          {busy ? 'Acceptation…' : 'Accepter'}
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
