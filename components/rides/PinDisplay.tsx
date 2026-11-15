import { KeyRound } from 'lucide-react';

/** Code PIN du passager (v2.2) — affiché sur la page de la course
 *  acceptée. Le passager le donne au chauffeur quand il arrive : c'est
 *  le chauffeur qui démarre le trajet avec. Ne jamais le partager
 *  avec quelqu'un d'autre.
 *
 *  Extrait en composant (v2.21) pour que la page d'aperçu des
 *  tutoriels (`/tuto-apercu`, dev uniquement) puisse montrer ce même
 *  écran réel dans le tutoriel passager. */
export function PinDisplay({ pinCode }: { pinCode: string }) {
  return (
    <div className="bg-night-900 border border-white/10 rounded-3xl p-6 shadow-sm text-slate-100 flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="font-black text-lg flex items-center gap-2">
          <KeyRound size={20} className="text-corail" />
          Ton code de démarrage
        </p>
        <p className="text-sm text-slate-300 mt-1">
          Donne ce code à ton chauffeur quand il arrive — c’est lui qui
          démarre le trajet avec. Ne le partage avec personne d’autre.
        </p>
      </div>
      <p className="font-black text-5xl tracking-[0.3em] text-corail" aria-label={`Code : ${pinCode.split('').join(' ')}`}>
        {pinCode}
      </p>
    </div>
  );
}
