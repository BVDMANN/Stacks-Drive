/** Gamification Stacks Drive — TOUS les chiffres réglables sont ici.
 *
 *  Principe validé par Randy (13/11/2026) : même un petit prix doit
 *  donner l'impression d'une grande victoire — célébrations, pourcentages,
 *  flashs, confettis. Les montants affichés sont toujours VRAIS
 *  (le chauffeur garde vraiment 92-95 % de chaque course, contre
 *  70-85 % chez Yango / Gozem) : on met en scène des gains réels,
 *  on n'invente pas de chiffres.
 *
 *  Points (v2.3, décision Randy 13/11/2026) : plus d'argent direct.
 *  Le chauffeur gagne des POINTS par course terminée (100, 200 sur une
 *  Course Double, bonus de quête en points) et les échange contre des
 *  courses sans commission (10 000 points = 5 courses où il garde 100 %).
 *  Les niveaux ne réduisent PLUS la commission : ils multiplient les
 *  points gagnés (Argent +5 %, Or +10 %, Diamant +25 %).
 *
 *  ⚠️ NE PAS toucher aux constantes de lib/commission.ts (5 % lancement,
 *  8 % permanent, plafond 10 %) : le taux de commission ne dépend plus
 *  du niveau, il est le même pour tous les chauffeurs.
 */

import { COMMISSION_CAP, COMMISSION_RATE } from './commission';

/** Nom d'un niveau chauffeur. */
export type DriverTierName = 'Bronze' | 'Argent' | 'Or' | 'Diamant';

/** Points gagnés par course terminée (v2.3). */
export const POINTS_PER_RIDE = 100;
/** Points gagnés sur une Course Double (points doublés, v2.3). */
export const POINTS_PER_DOUBLE_RIDE = 200;
/** Points à accumuler pour échanger contre des courses sans commission. */
export const POINTS_REDEEM_TARGET = 10000;
/** Courses sans commission offertes à chaque échange de 10 000 points. */
export const POINTS_REDEEM_FREE_RIDES = 5;

/** Quête du jour (défaut proposé : 8 courses → 1 000 points, v2.3).
 *  Plus de bonus en argent : la quête paie en points. */
export const DAILY_QUEST = {
  /** Courses terminées dans la journée pour valider la quête. */
  targetRides: 8,
  /** Points versés par la plateforme quand la quête est validée.
   *  Enregistrés dans driver_points (table v2.3), jamais en argent. */
  bonusPoints: 1000,
} as const;

/** Défi hebdomadaire (lundi → dimanche) : 40 courses → 5 000 points. */
export const WEEKLY_QUEST = {
  targetRides: 40,
  bonusPoints: 5000,
} as const;

/** Probabilité qu'une course acceptée soit une « Course Double »
 *  (~1 course sur 10, tirée au sort côté serveur à l'acceptation).
 *  Depuis la v2.3, la Course Double ne donne PLUS la commission
 *  offerte : elle double les points de la course (200 au lieu de 100). */
export const DOUBLE_RIDE_CHANCE = 0.1;

/** Dépôt de garantie remboursable demandé à l'inscription (FCFA). */
export const DEPOSIT_FCFA = 5000;

/** Plafond de dette : au-delà, le chauffeur ne reçoit plus de nouvelles
 *  demandes tant qu'il n'a pas réglé ses commissions. */
export const DEBT_CAP_FCFA = 5000;

/** Niveaux chauffeur : paliers (courses terminées + note moyenne) et
 *  multiplicateur de points (v2.3). Les niveaux ne réduisent PLUS la
 *  commission — le taux est le même pour tous (5 % puis 8 %) ; ils
 *  font gagner plus de points par course. */
export interface TierDefinition {
  name: DriverTierName;
  /** Courses terminées pour atteindre le niveau. */
  minRides: number;
  /** Note moyenne minimale (0 = pas d'exigence). */
  minRating: number;
  /** Multiplicateur de points gagnés (1 = 100 points/course,
   *  1.10 = 110 points/course). */
  pointsMultiplier: number;
  /** Avantage affiché dans l'appli. */
  perk: string;
}

export const TIERS: TierDefinition[] = [
  {
    name: 'Bronze',
    minRides: 0,
    minRating: 0,
    pointsMultiplier: 1,
    perk: 'Bienvenue sur Stacks Drive — ta commission de lancement est de 5 %.',
  },
  {
    name: 'Argent',
    minRides: 20,
    minRating: 0,
    pointsMultiplier: 1.05,
    perk: '20 courses terminées — badge Argent, priorité dans les demandes et +5 % de points.',
  },
  {
    name: 'Or',
    minRides: 50,
    minRating: 4.5,
    pointsMultiplier: 1.1,
    perk: '+10 % de points sur chaque course — 110 points au lieu de 100.',
  },
  {
    name: 'Diamant',
    minRides: 100,
    minRating: 4.5,
    pointsMultiplier: 1.25,
    perk: '+25 % de points sur chaque course — 125 points au lieu de 100, le meilleur bonus de Libreville.',
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

/** Taux de commission effectif pour un chauffeur (v2.3) : le niveau
 *  ne change PLUS le taux — il est le même pour tous (5 % au lancement,
 *  puis 8 %, plafond 10 % dans lib/commission.ts). La fonction est
 *  gardée pour les appelants existants : elle renvoie le taux de base,
 *  borné au plafond. */
export function getDriverCommissionRate(
  _tierName: DriverTierName,
  baseRate: number = COMMISSION_RATE
): number {
  return Math.min(COMMISSION_CAP, Math.max(0, baseRate));
}

/** Multiplicateur de points du niveau (v2.3) : 1 / 1,05 / 1,10 / 1,25. */
export function getPointsMultiplier(tierName: DriverTierName): number {
  const tier = TIERS.find((t) => t.name === tierName) ?? TIERS[0];
  return tier.pointsMultiplier;
}

/** Points gagnés sur une course terminée (v2.3) : 100 par course,
 *  200 sur une Course Double, multipliés par le niveau. Entier exact
 *  (100/200 × 1,05/1,10/1,25 tombent toujours juste). */
export function pointsForRide(tierName: DriverTierName, isDoubleRide: boolean): number {
  const base = isDoubleRide ? POINTS_PER_DOUBLE_RIDE : POINTS_PER_RIDE;
  return Math.round(base * getPointsMultiplier(tierName));
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
    description: 'Tu as décroché une Course Double — points doublés sur la course.',
  },
];

/** Quand le nudge « presque au bonus » se déclenche : il reste au plus
 *  2 courses pour valider la quête du jour. */
export const NUDGE_REMAINING_RIDES = 2;
