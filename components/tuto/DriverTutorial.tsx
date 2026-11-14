'use client';

import { useCallback, useEffect, useState } from 'react';
import { TutorialModal } from './TutorialModal';
import {
  DRIVER_STEPS,
  TUTO_DRIVER_OPEN_EVENT,
  TUTO_DRIVER_PENDING_KEY,
  TUTO_DRIVER_SEEN_KEY,
} from './steps';

/** Formation chauffeur (v2.21) — s'ouvre après la création du compte
 *  chauffeur, au premier passage sur le tableau de bord (drapeau
 *  `stacks-drive-tuto-chauffeur-a-faire` posé à l'inscription), puis
 *  rejouable depuis le tableau de bord (événement
 *  `stacks-drive:open-tuto-chauffeur`). */
export function DriverTutorial() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(TUTO_DRIVER_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TUTO_DRIVER_OPEN_EVENT, onOpen);
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(TUTO_DRIVER_PENDING_KEY) !== '1') return;
      window.localStorage.removeItem(TUTO_DRIVER_PENDING_KEY);
    } catch {
      return;
    }
    const t = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(t);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(TUTO_DRIVER_SEEN_KEY, '1');
    } catch {
      // Stockage indisponible : le tutoriel se montrera à nouveau.
    }
  }, []);

  return (
    <TutorialModal
      open={open}
      steps={DRIVER_STEPS}
      eyebrow="Formation chauffeur"
      onClose={close}
    />
  );
}
