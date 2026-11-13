/** Commission Stacks Drive prélevée sur chaque course.
 *
 *  Décision validée par Randy le 13/11/2026 :
 *  - Lancement : 5 % pendant 3 mois (aimant à chauffeurs).
 *  - Ensuite : 8 % permanent.
 *  - Plafond garanti : 10 % — la commission ne dépassera jamais ce taux.
 *
 *  Pour passer au tarif permanent, changer UNE seule valeur ici :
 *  COMMISSION_RATE = 0.08
 *
 *  Le gain du chauffeur par course = tarif × (1 − commission).
 *  La part plateforme et la part chauffeur sont calculées à la réservation
 *  et figées dans la table `rides` (snapshot) : un changement de taux
 *  plus tard ne modifie jamais les courses déjà réservées.
 */

/** Taux de commission actuel (5 % au lancement). */
export const COMMISSION_RATE = 0.05;

/** Taux permanent après la période de lancement (3 mois). */
export const COMMISSION_RATE_PERMANENT = 0.08;

/** Plafond garanti : la commission ne dépassera jamais 10 %. */
export const COMMISSION_CAP = 0.1;

/** Durée de la période de lancement, en mois. */
export const COMMISSION_LAUNCH_MONTHS = 3;

export interface FareSplit {
  /** Tarif total payé par le passager (FCFA). */
  total: number;
  /** Part reversée à la plateforme Stacks Drive (FCFA). */
  platformFee: number;
  /** Part du chauffeur (FCFA). */
  driverShare: number;
  /** Taux appliqué. */
  rate: number;
}

/** Découpe un tarif total entre la plateforme et le chauffeur. */
export function splitFare(totalPriceFcfa: number, rate: number = COMMISSION_RATE): FareSplit {
  const platformFee = Math.round(totalPriceFcfa * rate);
  return {
    total: totalPriceFcfa,
    platformFee,
    driverShare: totalPriceFcfa - platformFee,
    rate,
  };
}

/** Formate un montant en FCFA (ex : « 1 500 FCFA »). */
export function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} FCFA`;
}
