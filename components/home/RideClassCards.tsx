'use client';

import type { RideType } from '@/lib/pricing';
import { cn } from '@/lib/utils';
import { AnimatedPrice, PriceSkeleton } from './PriceDisplay';

/** Voitures dessinées Drive (v2.52) — voir
 *  `components/icons/DriveCar.tsx` : berline et citadine détaillées
 *  (phare LED + faisceau, calandre, jantes à branches, vitres avec
 *  reflets, ombre + lueur au sol). L'ancienne illustration plate
 *  (dégradé uni + trait de reflet unique) est supprimée. */
import { DriveCarIllustration } from '@/components/icons/DriveCar';
import { DriveCheck, DriveClock, DriveSnowflake, DriveUser, DriveUsers } from '@/components/icons/DriveUi';

/** Cartes de classe (v2.48) : Solo / Groupe / Confort en grandes
 *  cartes visuelles, avec leurs illustrations Drive.
 *
 *  Composition propre à Drive (pas la mise en page Yango : deux
 *  cartes côte à côte + Confort en pleine largeur, avec les prix
 *  indicatifs et l'ETA du chauffeur le plus proche). Les prix
 *  affichés sont des ESTIMATIONS indicatives — jamais des prix
 *  fixes : le prix final se négocie et se fige à l'acceptation.
 *
 *  Micro-interactions : la carte sélectionnée se soulève (anneau
 *  violet de marque + ombre), son illustration monte de 2 px, une pastille de
 *  validation apparaît ; au toucher, la carte se tasse
 *  (`active:scale`). Le prix fait un « pop » à chaque changement
 *  (AnimatedPrice, existant). */

export function RideClassCards({
  rideType,
  comfort,
  onSelect,
  estimateGroupePrice,
  estimateSoloPrice,
  estimating,
  validTrip,
  nearestEta,
}: {
  rideType: RideType;
  comfort: boolean;
  /** Choisir une classe : Groupe (rideType 'groupe'), Solo, ou
   *  Confort (Solo + clim + 4,5★). */
  onSelect: (rideType: RideType, comfort: boolean) => void;
  estimateGroupePrice: number | null;
  estimateSoloPrice: number | null;
  estimating: boolean;
  validTrip: boolean;
  /** ETA du chauffeur le plus proche (minutes) — null = inconnue. */
  nearestEta: number | null;
}) {
  const etaLabel =
    nearestEta !== null ? `chauffeur dans ~${nearestEta} min` : 'chauffeurs autour';
  const cardBase =
    'drive-card relative text-left rounded-3xl border-2 p-3.5 transition-all active:scale-[0.98]';
  const selectedCls =
    'border-brand-500 bg-brand-500/10 shadow-lg shadow-brand-500/20';
  const idleCls = 'border-white/10 bg-white/5 hover:border-white/25';

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Type de course · estimation indicative
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {/* Groupe — citadine, partagée, la moins chère. */}
        <button
          type="button"
          onClick={() => onSelect('groupe', false)}
          aria-pressed={rideType === 'groupe'}
          className={cn(cardBase, rideType === 'groupe' ? selectedCls : idleCls)}
        >
          <span className="absolute -top-2.5 left-3 bg-corail text-night-900 text-[10px] font-black px-2 py-0.5 rounded-full">
            LE MOINS CHER
          </span>
          {rideType === 'groupe' && (
            <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center">
              <DriveCheck size={13} />
            </span>
          )}
          <span
            className={cn(
              'block transition-transform duration-200',
              rideType === 'groupe' ? '-translate-y-0.5' : ''
            )}
          >
            <DriveCarIllustration variant="hatch" className="w-full h-auto" />
          </span>
          <span className="flex items-center gap-1.5 font-black text-white">
            <DriveUsers size={17} className="text-sarcelle" /> Groupe
          </span>
          <span className="block text-xs text-slate-400 mt-1 leading-snug">
            Partagée, comme le taxi — 1 place, prix par passager, arrêts dans l’ordre.
          </span>
          <span className="block font-black text-lg text-white mt-2">
            {estimating ? (
              <PriceSkeleton />
            ) : (
              <AnimatedPrice
                value={validTrip ? estimateGroupePrice : null}
                suffix={<span className="text-xs font-bold text-slate-400"> / passager</span>}
              />
            )}
          </span>
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <DriveClock size={12} />
            {etaLabel}
          </span>
        </button>

        {/* Solo — berline, privée, véhicule entier. */}
        <button
          type="button"
          onClick={() => onSelect('solo', false)}
          aria-pressed={rideType === 'solo' && !comfort}
          className={cn(cardBase, rideType === 'solo' && !comfort ? selectedCls : idleCls)}
        >
          {rideType === 'solo' && !comfort && (
            <span className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center">
              <DriveCheck size={13} />
            </span>
          )}
          <span
            className={cn(
              'block transition-transform duration-200',
              rideType === 'solo' && !comfort ? '-translate-y-0.5' : ''
            )}
          >
            <DriveCarIllustration variant="sedan" className="w-full h-auto" />
          </span>
          <span className="flex items-center gap-1.5 font-black text-white">
            <DriveUser size={17} className="text-rose-300" /> Solo
          </span>
          <span className="block text-xs text-slate-400 mt-1 leading-snug">
            Privée et directe, sans arrêt — le véhicule est entièrement à toi.
          </span>
          <span className="block font-black text-lg text-white mt-2">
            {estimating ? (
              <PriceSkeleton />
            ) : (
              <AnimatedPrice
                value={validTrip ? estimateSoloPrice : null}
                suffix={<span className="text-xs font-bold text-slate-400"> la course</span>}
              />
            )}
          </span>
          <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
            <DriveClock size={12} />
            {etaLabel}
          </span>
        </button>
      </div>

      {/* Confort — berline climatisée, chauffeurs 4,5★ et plus. Même
          prix que Solo (v2.34) : la carte affiche l'estimation Solo. */}
      <button
        type="button"
        onClick={() => onSelect('solo', true)}
        aria-pressed={rideType === 'solo' && comfort}
        className={cn(
          'drive-card w-full text-left rounded-3xl border-2 p-3.5 transition-all active:scale-[0.98]',
          rideType === 'solo' && comfort
            ? 'border-sarcelle bg-sarcelle/10 shadow-lg shadow-sarcelle/20'
            : 'border-white/10 bg-white/5 hover:border-white/25'
        )}
      >
        <span className="flex items-start gap-3">
          <span
            className={cn(
              'block w-28 shrink-0 transition-transform duration-200',
              rideType === 'solo' && comfort ? '-translate-y-0.5' : ''
            )}
          >
            <DriveCarIllustration variant="sedan" className="w-full h-auto" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-1.5 font-black text-white">
              <DriveSnowflake size={17} className="text-sarcelle" /> Confort
              {rideType === 'solo' && comfort && (
                <span className="ml-auto w-5 h-5 rounded-full bg-sarcelle text-night-900 flex items-center justify-center shrink-0">
                  <DriveCheck size={13} />
                </span>
              )}
            </span>
            <span className="block text-xs text-slate-400 mt-1 leading-snug">
              Climatisation garantie · Chauffeurs notés 4,5★ et plus · Même prix que Solo.
            </span>
            <span className="block font-black text-base text-white mt-1.5">
              {estimating ? (
                <PriceSkeleton />
              ) : (
                <AnimatedPrice
                  value={validTrip ? estimateSoloPrice : null}
                  suffix={<span className="text-xs font-bold text-slate-400"> la course</span>}
                />
              )}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
