/** Garde-fous tarifaires Stacks Drive (v2.2) — plan d'urgence.
 *
 *  Règle n° 1 : le prix est TOUJOURS recalculé côté serveur depuis la
 *  matrice lib/pricing.ts. On ne fait JAMAIS confiance à un prix envoyé
 *  par le client (formulaire, app, requête). Toute course / proposition
 *  dont le prix ne correspond pas à la matrice est rejetée, journalisée,
 *  et l'utilisateur voit un message clair — jamais de course créée en
 *  silence avec un mauvais prix.
 *
 *  Bornes de sécurité : un tarif hors [400 ; 50 000] FCFA est impossible
 *  à Libreville (course la plus courte ≈ 400 FCFA en Groupe, course
 *  aéroport Solo ≈ 3 800 FCFA). Un montant négatif, nul avec une
 *  distance > 0, ou une commission au-dessus du plafond de 10 % est une
 *  anomalie : on bloque l'action, on signale à l'admin, on l'affiche.
 */

import { COMMISSION_CAP } from './commission';
import {
  estimateFare,
  type RideType,
  type VehiclePreference,
} from './pricing';
import type { Neighborhood } from './neighborhoods';

/** Tarif minimum possible à Libreville (FCFA) — plancher Groupe de la
 *  formule (v2.3, baisse de 24 %). */
export const FARE_MIN_FCFA = 400;
/** Tarif maximum possible à Libreville (FCFA). */
export const FARE_MAX_FCFA = 50000;
/** Écart toléré entre le prix proposé par le chauffeur et le tarif de
 *  référence : au plus 2× le tarif estimé, au moins la moitié. Au-delà,
 *  c'est un trop-perçu (ou une erreur) : on refuse. */
export const PRICE_TOLERANCE_HIGH = 2;
export const PRICE_TOLERANCE_LOW = 0.5;

export interface FareCheck {
  ok: boolean;
  /** Message clair pour l'utilisateur (français simple). */
  message?: string;
  /** Tarif de référence recalculé côté serveur. */
  referencePrice?: number;
}

/** Le montant est-il dans les bornes absolues ? */
export function isFareInBounds(amount: number): boolean {
  return Number.isFinite(amount) && amount >= FARE_MIN_FCFA && amount <= FARE_MAX_FCFA;
}

/** Revalide un prix proposé par un chauffeur contre la matrice tarifaire.
 *  Le chauffeur propose son prix, mais il ne peut pas s'éloigner du
 *  tarif de référence (sinon : trop-perçu ou erreur de saisie).
 *  Route non bitumée (v2.6) : la référence inclut le supplément SEULEMENT
 *  si le chauffeur prend la route non bitumée — un chauffeur qui refuse
 *  la piste propose le tarif de base (sans supplément) et doit être
 *  validé contre la base, sinon sa proposition serait rejetée à tort. */
export function validateProposedPrice(
  pickup: Neighborhood,
  destination: Neighborhood,
  rideType: RideType,
  vehiclePreference: VehiclePreference,
  proposedPrice: number,
  options: { unpavedRoad?: boolean } = {}
): FareCheck {
  if (!Number.isFinite(proposedPrice) || proposedPrice <= 0) {
    return { ok: false, message: 'Prix invalide : le montant doit être supérieur à 0 FCFA.' };
  }
  if (!isFareInBounds(proposedPrice)) {
    return {
      ok: false,
      message: `Prix impossible : une course à Libreville coûte entre ${FARE_MIN_FCFA} et ${FARE_MAX_FCFA} FCFA. Vérifie le montant et réessaie.`,
    };
  }
  const estimate = estimateFare(pickup, destination, rideType, vehiclePreference, options);
  const low = Math.floor(estimate.price * PRICE_TOLERANCE_LOW);
  const high = Math.ceil(estimate.price * PRICE_TOLERANCE_HIGH);
  if (proposedPrice < low || proposedPrice > high) {
    return {
      ok: false,
      referencePrice: estimate.price,
      message: `Prix incohérent : pour ce trajet, le tarif de référence est de ${estimate.price} FCFA. Ton prix doit être entre ${low} et ${high} FCFA.`,
    };
  }
  return { ok: true, referencePrice: estimate.price };
}

/** Revalide le tarif figé à l'acceptation (le passager accepte) : on
 *  recalcule depuis la matrice et on compare au prix proposé. La
 *  référence reprend le choix route non bitumée de la proposition
 *  acceptée — sinon un prix avec supplément serait rejeté. */
export function validateAcceptedPrice(
  pickup: Neighborhood,
  destination: Neighborhood,
  rideType: RideType,
  vehiclePreference: VehiclePreference,
  proposedPrice: number,
  options: { unpavedRoad?: boolean } = {}
): FareCheck {
  return validateProposedPrice(pickup, destination, rideType, vehiclePreference, proposedPrice, options);
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
