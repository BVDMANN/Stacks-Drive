/** Garde-fous tarifaires Stacks Drive (v2.11) — plan d'urgence.
 *
 *  Modèle exact (décision de Randy, 14/11/2026) : le passager voit une
 *  estimation indicative avant la course, puis le prix final se décide
 *  entre le passager et le chauffeur (proposition / contre-proposition)
 *  et est figé à l'acceptation. La plateforme ne définit AUCUN prix
 *  fixe : il n'y a plus de tarif de référence, donc plus aucun ratio
 *  « prix proposé vs référence ».
 *
 *  Règle n° 1 : un prix proposé ou accepté est validé côté serveur
 *  contre les BORNES ABSOLUES uniquement : entre 400 et 50 000 FCFA.
 *  On ne fait JAMAIS confiance à un prix envoyé par le client sans
 *  cette validation. Un prix hors bornes est rejeté, journalisé, et
 *  l'utilisateur voit un message clair — jamais de course créée en
 *  silence avec un mauvais prix.
 *
 *  Bornes de sécurité : un tarif hors [400 ; 50 000] FCFA est impossible
 *  à Libreville (course la plus courte ≈ 400 FCFA en Groupe, course
 *  aéroport Solo ≈ 3 800 FCFA). Un montant négatif, nul, ou une
 *  commission au-dessus du plafond de 10 % est une anomalie : on bloque
 *  l'action, on signale à l'admin, on l'affiche.
 */

import { COMMISSION_CAP } from './commission';

/** Tarif minimum possible à Libreville (FCFA). */
export const FARE_MIN_FCFA = 400;
/** Tarif maximum possible à Libreville (FCFA). */
export const FARE_MAX_FCFA = 50000;

export interface FareCheck {
  ok: boolean;
  /** Message clair pour l'utilisateur (français simple). */
  message?: string;
}

/** Le montant est-il dans les bornes absolues ? */
export function isFareInBounds(amount: number): boolean {
  return Number.isFinite(amount) && amount >= FARE_MIN_FCFA && amount <= FARE_MAX_FCFA;
}

/** Valide un prix proposé par un chauffeur (ou contre-proposé par un
 *  passager) : bornes absolues uniquement. L'estimation indicative
 *  affichée à côté de la proposition sert à chacun pour juger — elle
 *  n'est jamais une contrainte. */
export function validateProposedPrice(proposedPrice: number): FareCheck {
  if (!Number.isFinite(proposedPrice) || proposedPrice <= 0) {
    return { ok: false, message: 'Prix invalide : le montant doit être supérieur à 0 FCFA.' };
  }
  if (!isFareInBounds(proposedPrice)) {
    return {
      ok: false,
      message: `Prix impossible : une course à Libreville coûte entre ${FARE_MIN_FCFA} et ${FARE_MAX_FCFA} FCFA. Vérifie le montant et réessaie.`,
    };
  }
  return { ok: true };
}

/** Valide le prix figé à l'acceptation (le passager accepte une
 *  proposition, ou le chauffeur accepte une contre-proposition) :
 *  mêmes bornes absolues — le prix convenu entre les deux parties
 *  est le prix de la course, figé. */
export function validateAcceptedPrice(proposedPrice: number): FareCheck {
  return validateProposedPrice(proposedPrice);
}

/** Vérifie qu'une découpe tarif / commission est cohérente : la
 *  commission ne dépasse jamais le plafond de 10 % et les parts
 *  s'additionnent bien au tarif. */
export function validateSplit(
  fare: number,
  rate: number,
  platformFee: number,
  driverShare: number
): FareCheck {
  if (!isFareInBounds(fare)) {
    return { ok: false, message: `Tarif hors bornes (${fare} FCFA) — course bloquée pour vérification.` };
  }
  if (rate < 0 || rate > COMMISSION_CAP) {
    return { ok: false, message: `Taux de commission impossible (${Math.round(rate * 100)} %) — le plafond est de 10 %. Course bloquée.` };
  }
  if (platformFee < 0 || driverShare < 0 || platformFee + driverShare !== fare) {
    return { ok: false, message: 'Découpe tarif / commission incohérente — course bloquée pour vérification.' };
  }
  return { ok: true };
}

/** Détecte une anomalie sur une course terminée avant d'enregistrer
 *  ses gains : montant négatif, tarif zéro avec une vraie distance,
 *  commission au-dessus du plafond, tarif hors bornes. */
export function detectEarningAnomaly(input: {
  fare: number;
  distanceKm: number;
  rate: number;
  platformFee: number;
  driverShare: number;
}): string | null {
  if (!Number.isFinite(input.fare) || input.fare < 0) return 'Tarif négatif ou invalide.';
  if (input.fare === 0 && input.distanceKm > 0) return 'Tarif à 0 FCFA pour un trajet réel.';
  if (!isFareInBounds(input.fare)) return `Tarif hors bornes (${input.fare} FCFA).`;
  if (input.rate < 0 || input.rate > COMMISSION_CAP) return 'Taux de commission au-dessus du plafond de 10 %.';
  if (input.platformFee < 0 || input.driverShare < 0) return 'Montant négatif dans la découpe.';
  if (input.platformFee + input.driverShare !== input.fare) return 'La découpe ne s’additionne pas au tarif.';
  return null;
}
