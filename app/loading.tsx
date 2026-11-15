import { LogoLoader } from '@/components/icons/DriveLogo';

/** Écran de chargement global (v2.52) : le S du logo qui se remplit,
 *  centré sur le fond nuit — c'est l'écran de démarrage de l'appli. */
export default function Loading() {
  return (
    <div className="min-h-screen bg-night-950 flex flex-col items-center justify-center px-4">
      <LogoLoader size={96} label="Chargement de Stacks Drive…" />
    </div>
  );
}
