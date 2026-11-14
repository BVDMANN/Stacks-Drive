'use client';

import Link from 'next/link';
import { Car, RefreshCw } from 'lucide-react';

/** Page d'erreur de marque (v2.2) : quand une section de l'appli plante,
 *  on affiche un message clair en français, look « Libreville la nuit »,
 *  avec un bouton réessayer — jamais d'erreur brute ni d'écran vide. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-night-950 text-slate-100 flex flex-col items-center justify-center px-4 py-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-or flex items-center justify-center text-night-900 shadow-lg shadow-or/40">
        <Car size={32} />
      </div>
      <h1 className="font-black text-2xl sm:text-3xl mt-6 tracking-tight">
        Service momentanément indisponible
      </h1>
      <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-md leading-relaxed">
        Quelque chose n’a pas fonctionné de notre côté. Tes courses et tes
        gains sont en sécurité — réessaie dans quelques instants.
      </p>
      {error?.digest && (
        <p className="text-xs text-slate-500 mt-3">Référence : {error.digest}</p>
      )}
      <div className="flex flex-wrap justify-center gap-3 mt-6">
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-or text-night-900 font-black shadow-lg shadow-or/30 hover:bg-or-light transition-colors"
        >
          <RefreshCw size={16} /> Réessayer
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-white/10 text-slate-100 font-black hover:bg-white/20 transition-colors"
        >
          Retour à l’accueil
        </Link>
      </div>
      <p className="text-xs text-slate-500 mt-6">
        Le problème persiste ? Écris à Stacks Drive : stacks.markett@gmail.com
      </p>
    </div>
  );
}
