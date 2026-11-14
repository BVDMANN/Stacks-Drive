/** Arrondi du prix accepté à 50 FCFA (v2.34, lot « Au-delà »).
 *
 *  Le prix convenu entre le passager et le chauffeur est arrondi à
 *  50 FCFA près, côté serveur, au moment de l'acceptation (PATCH
 *  /api/proposals/[id]) — jamais dans l'estimation (déjà arrondie
 *  par `lib/pricing.ts`) et jamais sur les propositions en cours de
 *  négociation : seul le prix FIGÉ est arrondi, et le montant
 *  arrondi est affiché avant l'acceptation (la carte de proposition
 *  montre le prix proposé et, s'il diffère, le prix arrondi qui
 *  sera figé).
 *
 *  ⚠️ DÉCISION EN ATTENTE (propriétaire, à valider avant le push) :
 *  l'arrondi est implémenté proprement mais ne doit pas partir en
 *  ligne sans sa validation — voir le rapport du lot v2.34.
 *  Règle d'arrondi : au plus proche (1 525 → 1 550, 1 520 → 1 500),
 *  bornes absolues revalidées après arrondi (400–50 000 FCFA).
 *  La commission (5 % puis 8 %, plafond 10 %) se calcule sur le
 *  montant ARRONDI — `lib/commission.ts` n'est pas touchée, c'est
 *  l'appelant qui passe le montant arrondi à `splitFare`.
 */

/** Pas d'arrondi (FCFA) — UNIQUE source de vérité. */
export const ACCEPTED_PRICE_STEP_FCFA = 50;

/** Arrondit un montant au pas de 50 FCFA le plus proche. */
export function roundAcceptedPrice(priceFcfa: number): number {
  if (!Number.isFinite(priceFcfa)) return priceFcfa;
  return Math.round(priceFcfa / ACCEPTED_PRICE_STEP_FCFA) * ACCEPTED_PRICE_STEP_FCFA;
}

/** Le montant est-il déjà un multiple de 50 FCFA ? */
export function isRoundedTo50(priceFcfa: number): boolean {
  return Number.isFinite(priceFcfa) && priceFcfa % ACCEPTED_PRICE_STEP_FCFA === 0;
}

/** Écart introduit par l'arrondi (positif = arrondi vers le haut). */
export function roundingDeltaFcfa(priceFcfa: number): number {
  return roundAcceptedPrice(priceFcfa) - priceFcfa;
}
