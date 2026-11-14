'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/** Impression du reçu depuis l'historique (v2.30) : l'historique
 *  renvoie vers `/courses/[id]?print=1` — une fois la page chargée,
 *  la boîte d'impression s'ouvre toute seule (l'utilisateur choisit
 *  « Enregistrer au format PDF » ou son imprimante). Le CSS print
 *  (`styles/globals.css`) n'imprime que la zone `.print-receipt`. */
export function AutoPrintOnParam() {
  const params = useSearchParams();
  useEffect(() => {
    if (params.get('print') !== '1') return;
    const t = window.setTimeout(() => window.print(), 600);
    return () => window.clearTimeout(t);
  }, [params]);
  return null;
}
