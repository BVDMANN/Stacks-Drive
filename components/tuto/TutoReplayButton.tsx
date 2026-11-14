'use client';

import { GraduationCap } from 'lucide-react';
import {
  TUTO_DRIVER_OPEN_EVENT,
  TUTO_PASSENGER_OPEN_EVENT,
} from './steps';

/** Bouton « Revoir le tutoriel » (v2.21) — rouvre la modale du
 *  tutoriel passager (depuis « Mon compte ») ou de la formation
 *  chauffeur (depuis le tableau de bord). La modale doit être montée
 *  sur la page (accueil, compte, tableau de bord). */
export function TutoReplayButton({
  kind,
  className,
  label,
}: {
  kind: 'passager' | 'chauffeur';
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new Event(kind === 'chauffeur' ? TUTO_DRIVER_OPEN_EVENT : TUTO_PASSENGER_OPEN_EVENT)
        )
      }
      className={
        className ??
        'inline-flex items-center gap-2 px-6 py-3.5 bg-white border border-slate-200 text-stacks-navy font-bold rounded-full hover:border-stacks-green/40 transition-colors'
      }
    >
      <GraduationCap size={18} className="text-stacks-green" />
      {label ?? 'Revoir le tutoriel'}
    </button>
  );
}
