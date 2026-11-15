'use client';

import { useCallback, useEffect, useState } from 'react';
import { DrivePlay, DriveX } from '@/components/icons/DriveUi';
import { TutorialModal } from './TutorialModal';
import {
  PASSENGER_STEPS,
  TUTO_PASSENGER_OPEN_EVENT,
  TUTO_PASSENGER_SEEN_KEY,
} from './steps';

/** Tutoriel passager (v2.21, revu v2.36) — au premier lancement de
 *  l'app (accueil, mode passager), on NE MASQUE PLUS tout l'écran
 *  avec la modale : on montre une petite carte d'accueil, en haut de
 *  la carte, sans voile — la carte et la feuille restent visibles et
 *  utilisables. Le tutoriel ne s'ouvre que si la personne touche
 *  « Voir le tutoriel ». Fermer la carte (« Plus tard » / croix) vaut
 *  « vu » : elle ne revient pas. Rejouable depuis « Mon compte »
 *  (événement `stacks-drive:open-tuto-passager`). */
export function PassengerTutorial({
  autoShow = false,
  isChauffeurMode = false,
}: {
  /** Vrai sur l'accueil uniquement : carte d'accueil au premier lancement. */
  autoShow?: boolean;
  /** En mode Chauffeur, l'accueil n'est pas l'écran passager : pas de carte. */
  isChauffeurMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(TUTO_PASSENGER_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TUTO_PASSENGER_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!autoShow || isChauffeurMode) return;
    try {
      if (window.localStorage.getItem(TUTO_PASSENGER_SEEN_KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setShowHint(true), 900);
    return () => window.clearTimeout(t);
  }, [autoShow, isChauffeurMode]);

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(TUTO_PASSENGER_SEEN_KEY, '1');
    } catch {
      // Stockage indisponible : la carte se montrera à nouveau.
    }
  }, []);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    markSeen();
  }, [markSeen]);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
  }, [markSeen]);

  return (
    <>
      {/* Carte d'accueil — petite, en haut de la carte, SANS voile :
          elle ne masque pas l'écran, la carte et la feuille restent
          utilisables derrière. */}
      {showHint && !open && (
        <div
          className="fixed left-1/2 top-16 z-[60] w-[calc(100%-1.5rem)] max-w-[360px] -translate-x-1/2 rounded-3xl border border-corail/40 bg-night-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur"
          role="dialog"
          aria-label="Bienvenue sur Stacks Drive"
        >
          <button
            type="button"
            onClick={dismissHint}
            aria-label="Fermer"
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-night-950/80 text-white hover:border-corail/60 active:scale-90 transition-all"
          >
            <DriveX size={16} />
          </button>
          <p className="text-[10px] font-black uppercase tracking-widest text-corail">
            Bienvenue sur Stacks Drive
          </p>
          <h2 className="mt-1 pr-8 text-base font-black text-white leading-tight">
            Première fois ici ?
          </h2>
          <p className="mt-1 text-sm text-slate-300 leading-snug">
            Le tutoriel te montre comment commander en 6 étapes — la carte
            reste visible, tu peux l&apos;ignorer.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setShowHint(false);
                setOpen(true);
              }}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-rose-500 px-4 py-3 text-sm font-black text-night-900 shadow-lg shadow-rose-500/30 hover:bg-rose-300 active:scale-[0.98] transition-all"
            >
              <DrivePlay size={16} /> Voir le tutoriel
            </button>
            <button
              type="button"
              onClick={dismissHint}
              className="px-3 py-3 text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              Plus tard
            </button>
          </div>
        </div>
      )}
      <TutorialModal
        open={open}
        steps={PASSENGER_STEPS}
        eyebrow="Tutoriel passager"
        onClose={close}
      />
    </>
  );
}
