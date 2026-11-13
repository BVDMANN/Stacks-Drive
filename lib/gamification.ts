/** Gamification Stacks Drive — TOUS les chiffres réglables sont ici.
 *
 *  Principe validé par Randy (13/11/2026) : même un petit prix doit
 *  donner l'impression d'une grande victoire — célébrations, pourcentages,
 *  flashs, confettis. Les montants affichés sont toujours VRAIS
 *  (le chauffeur garde vraiment 92-95 % de chaque course, contre
 *  70-85 % chez Yango / Gozem) : on met en scène des gains réels,
 *  on n'invente pas de chiffres.
 *
 *  ⚠️ NE PAS toucher aux constantes de lib/commission.ts (5 % lancement,
 *  8 % permanent, plafond 10 %) : les niveaux ci-dessous ne font que
 *  RÉDUIRE le taux pour les meilleurs chauffeurs, jamais l'augmenter.
 */

import { COMMISSION_CAP, COMMISSION_RATE } from './commission';

/** Nom d'un niveau chauffeur. */
export type DriverTierName = 'Bronze' | 'Argent' | 'Or' | 'Diamant';

/** Quête du jour (défaut proposé : 8 courses → bonus 1 000 FCFA). */
export const DAILY_QUEST = {
  /** Courses terminées dans la journée pour valider la quête. */
  targetRides: 8,
  /** Bonus versé par la plateforme quand la quête est validée (FCFA).
   *  Enregistré comme coût plateforme dans driver_earnings. */
  bonusFcfa: 1000,
} as const;

/** Défi hebdomadaire (lundi → dimanche). */
export const WEEKLY_QUEST = {
  targetRides: 40,
  bonusFcfa: 5000,
} as const;

/** Probabilité qu'une course acceptée soit une « Course Double »
 *  (~1 course sur 10, tirée au sort côté serveur à l'acceptation). */
export const DOUBLE_RIDE_CHANCE = 0.1;

/** Dépôt de garantie remboursable demandé à l'inscription (FCFA). */
export const DEPOSIT_FCFA = 5000;

/** Plafond de dette : au-delà, le chauffeur ne reçoit plus de nouvelles
 *  demandes tant qu'il n'a pas réglé ses commissions. */
export const DEBT_CAP_FCFA = 5000;

/** Niveaux chauffeur : paliers (courses terminées + note moyenne) et
 *  réduction de commission. Les niveaux Or / Diamant sont à valider par
 *  Randy (coût : 1 à 2 points de commission offerts aux meilleurs). */
export interface TierDefinition {
  name: DriverTierName;
  /** Courses terminées pour atteindre le niveau. */
  minRides: number;
  /** Note moyenne minimale (0 = pas d'exigence). */
  minRating: number;
  /** Points de commission offerts (0.01 = 1 point). */
  commissionDiscount: number;
  /** Avantage affiché dans l'appli. */
  perk: string;
}

export const TIERS: TierDefinition[] = [
  {
    name: 'Bronze',
    minRides: 0,
    minRating: 0,
    commissionDiscount: 0,
    perk: 'Bienvenue sur Stacks Drive — ta commission de lancement est de 5 %.',
  },
  {
    name: 'Argent',
    minRides: 20,
    minRating: 0,
    commissionDiscount: 0,
    perk: '20 courses terminées — badge Argent et priorité dans les demandes.',
  },
  {
    name: 'Or',
    minRides: 50,
    minRating: 4.5,
    commissionDiscount: 0.01,
    perk: 'Commission réduite : 1 point offert (ex : 5 % → 4 % au lancement).',
  },
  {
    name: 'Diamant',
    minRides: 100,
    minRating: 4.5,
    commissionDiscount: 0.02,
    perk: 'Commission réduite : 2 points offerts — le meilleur taux de Libreville.',
  },
];

/** Niveau atteint pour un nombre de courses terminées et une note moyenne. */
export function getTierForStats(completedRides: number, avgRating: number | null): TierDefinition {
  let current = TIERS[0];
  for (const tier of TIERS) {
    const ratingOk = tier.minRating === 0 || (avgRating !== null && avgRating >= tier.minRating);
    if (completedRides >= tier.minRides && ratingOk) current = tier;
  }
  return current;
}

/** Prochain niveau + courses restantes pour l'atteindre. */
export function getNextTier(completedRides: number, avgRating: number | null): {
  tier: TierDefinition | null;
  ridesLeft: number;
  ratingNeeded: number | null;
} {
  const current = getTierForStats(completedRides, avgRating);
  const idx = TIERS.findIndex((t) => t.name === current.name);
  const next = TIERS[idx + 1] ?? null;
  if (!next) return { tier: null, ridesLeft: 0, ratingNeeded: null };
  const ridesLeft = Math.max(0, next.minRides - completedRides);
  const ratingNeeded =
    next.minRating > 0 && (avgRating === null || avgRating < next.minRating)
      ? next.minRating
      : null;
  return { tier: next, ridesLeft, ratingNeeded };
}

/** Taux de commission effectif pour un chauffeur selon son niveau.
 *  Ne touche JAMAIS aux constantes de lib/commission.ts : le taux de
 *  base vient de là, on ne fait que soustraire la réduction du niveau,
 *  bornée entre 0 et le plafond de 10 %. */
export function getDriverCommissionRate(
  tierName: DriverTierName,
  baseRate: number = COMMISSION_RATE
): number {
  const tier = TIERS.find((t) => t.name === tierName) ?? TIERS[0];
  const rate = baseRate - tier.commissionDiscount;
  return Math.min(COMMISSION_CAP, Math.max(0, rate));
}

/** Tirage de la Course Double (côté serveur uniquement). */
export function rollDoubleRide(random: () => number = Math.random): boolean {
  return random() < DOUBLE_RIDE_CHANCE;
}

/** Badges chauffeur : id, titre, description, condition d'attribution
 *  (évaluée côté serveur à la clôture de chaque course). */
export interface BadgeDefinition {
  id: string;
  title: string;
  description: string;
}

export const BADGES: BadgeDefinition[] = [
  {
    id: 'premiere-course',
    title: 'Première course',
    description: 'Ta première course terminée sur Stacks Drive.',
  },
  {
    id: 'dix-courses',
    title: '10 courses',
    description: '10 courses terminées — tu es lancé.',
  },
  {
    id: 'cinquante-courses',
    title: '50 courses',
    description: '50 courses terminées — les passagers te connaissent.',
  },
  {
    id: 'cent-courses',
    title: '100 courses',
    description: '100 courses terminées — légende de Libreville.',
  },
  {
    id: 'cinq-etoiles',
    title: '5 étoiles',
    description: 'Note moyenne de 5,0 sur au moins 10 courses.',
  },
  {
    id: 'roi-de-la-nuit',
    title: 'Roi de la nuit',
    description: '10 courses terminées entre 20 h et 6 h.',
  },
  {
    id: 'serie-7',
    title: 'Série de 7 jours',
    description: '7 jours d’affilée en ligne avec au moins une course.',
  },
  {
    id: 'course-double',
    title: 'Course Double',
    description: 'Tu as décroché une Course Double — commission offerte.',
  },
];

/** Quand le nudge « presque au bonus » se déclenche : il reste au plus
 *  2 courses pour valider la quête du jour. */
export const NUDGE_REMAINING_RIDES = 2;
