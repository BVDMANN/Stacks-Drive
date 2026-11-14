'use client';

import { useCallback, useEffect, useState } from 'react';
import { TutorialModal } from './TutorialModal';
import {
  PASSENGER_STEPS,
  TUTO_PASSENGER_OPEN_EVENT,
  TUTO_PASSENGER_SEEN_KEY,
} from './steps';

/** Tutoriel passager (v2.21) — affiché une seule fois au premier
 *  lancement de l'app (accueil, mode passager), fermable, et
 *  rejouable depuis « Mon compte » (événement
 *  `stacks-drive:open-tuto-passager`). */
export function PassengerTutorial({
  autoShow = false,
  isChauffeurMode = false,
}: {
  /** Vrai sur l'accueil uniquement : ouverture automatique au premier lancement. */
  autoShow?: boolean;
  /** En mode Chauffeur, l'accueil n'est pas l'écran passager : pas d'ouverture auto. */
  isChauffeurMode?: boolean;
}) {
  const [open, setOpen] = useState(false);

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
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, [autoShow, isChauffeurMode]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(TUTO_PASSENGER_SEEN_KEY, '1');
    } catch {
      // Stockage indisponible : le tutoriel se montrera à nouveau.
    }
  }, []);

  return (
    <TutorialModal
      open={open}
      steps={PASSENGER_STEPS}
      eyebrow="Tutoriel passager"
      onClose={close}
    />
  );
}
