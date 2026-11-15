/** Paiement par carte — Stripe, modèle SIMPLIFIÉ (v2.55).
 *
 *  Décisions (propriétaire, 15/11/2026) :
 *  - le propriétaire seul marchand (pas de Stripe Connect, pas d'onboarding
 *    Stripe par chauffeur). L'argent des courses carte arrive sur
 *    son solde Stripe (EUR) ; la commission est la part non reversée.
 *  - Le PASSAGER paie les frais Stripe : prix carte = course + frais
 *    (gross-up), arrondi à 50 FCFA. Même logique pour la caution :
 *    le chauffeur paie les frais sur son dépôt.
 *  - XAF = devise de présentation zéro-décimale (amount: 5000 =
 *    5 000 FCFA), règlement en EUR. Pré-autorisation :
 *    capture_method = manual, retenue 7 jours (Visa / Mastercard).
 *  - Virements Stripe -> banque du propriétaire : MANUELS, jamais activés
 *    automatiquement. Versement chauffeurs : lot QUOTIDIEN préparé
 *    chaque matin ; le rail d'exécution (Global Payouts) est en
 *    PREVIEW chez Stripe et NON VALIDÉ en réel — aucun virement
 *    automatique n'est simulé (voir ADR 0031).
 *  - AUCUN secret dans le code : STRIPE_SECRET_KEY et
 *    STRIPE_WEBHOOK_SECRET sont des variables d'environnement
 *    (Vercel / .env.local), jamais versionnées.
 *  - lib/commission.ts INTOUCHABLE : les taux 5 % / 8 % / 10 %
 *    s'appliquent exactement comme pour les courses espèces.
 */

import Stripe from 'stripe';
import { roundAcceptedPrice } from '@/lib/price-rounding';

/** Frais Stripe sur les cartes (tarif France, vérifié 15/11/2026) :
 *  1,5 % + 0,25 € pour les cartes européennes, 2,9 % + 0,25 € pour
 *  les cartes internationales ; le taux retenu (5,15 %) couvre le
 *  pire cas (carte internationale + marge de sécurité) — le passager
 *  paie les frais, la plateforme ne perd jamais sur une course
 *  carte. Le fixe 0,25 € = 164 FCFA (taux de référence ~656 FCFA/€). */
export const CARD_FEE_RATE = 0.0515;
export const CARD_FEE_FIXED_FCFA = 164;

/** Devise de présentation des paiements carte. */
export const CARD_CURRENCY = 'xaf' as const;

/** Durée de la retenue de pré-autorisation (Visa / Mastercard). */
export const CARD_HOLD_DAYS = 7;

let stripeInstance: Stripe | null = null;

/** Client Stripe (clé secrète, serveur uniquement). Lève une erreur
 *  claire si la clé n'est pas configurée — les routes renvoient
 *  alors 503 « paiement par carte pas encore activé ». */
export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY manquante — paiement par carte non configuré.');
  }
  stripeInstance = new Stripe(key);
  return stripeInstance;
}

/** Vrai si le paiement par carte est configuré (clé secrète
 *  présente). La clé PUBLIABLE (côté client) est lue séparément
 *  par le composant de paiement. */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Clé publiable (côté client, non secrète) — exposée via
 *  /api/stripe/config pour le Payment Element. */
export function getStripePublishableKey(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null;
}

/** Gross-up : montant TOTAL à débiter sur la carte pour que la
 *  plateforme reçoive exactement `netFcfa` après les frais Stripe.
 *  Formule : chargé = (net + fixe) / (1 - taux), arrondi au pas de
 *  50 FCFA le plus proche (même pas que le prix accepté).
 *  Exemples : 1 500 -> 1 750 (frais 250) ; 5 000 -> 5 450
 *  (frais 450) ; caution 5 000 -> 5 450 (frais 450, à la charge
 *  du chauffeur). */
export function cardGrossUp(netFcfa: number): { charged: number; fees: number } {
  const raw = (netFcfa + CARD_FEE_FIXED_FCFA) / (1 - CARD_FEE_RATE);
  const charged = roundAcceptedPrice(Math.ceil(raw));
  return { charged, fees: Math.max(0, charged - netFcfa) };
}

/** Frais Stripe estimés pour un montant net donné (même calcul que
 *  le gross-up, sans arrondi supplémentaire). */
export function cardFeesFor(netFcfa: number): number {
  return cardGrossUp(netFcfa).fees;
}

/** Convertit les frais réels d'une balance_transaction Stripe
 *  (en centimes de la devise de règlement, EUR) en FCFA, via le
 *  taux de change de la transaction. Renvoie null si la conversion
 *  est impossible — l'appelant garde alors les frais estimés. */
export function stripeFeeToFcfa(
  feeMinorUnits: number | null | undefined,
  exchangeRate: number | null | undefined
): number | null {
  if (!feeMinorUnits || !exchangeRate || exchangeRate <= 0) return null;
  const feeEur = feeMinorUnits / 100;
  return Math.max(0, Math.round(feeEur / exchangeRate));
}

/** Types de PaymentIntent utilisés par Stacks Drive (metadata.type). */
export type StripeIntentType = 'ride_hold' | 'deposit' | 'debt_payment';

/** Libellé lisible d'un statut de paiement carte (grand livre). */
export const CARD_PAYMENT_STATUS_LABELS: Record<string, string> = {
  hold_pending: 'Empreinte en attente',
  hold_confirmed: 'Empreinte confirmée',
  captured: 'Encaissé',
  voided: 'Empreinte annulée',
  capture_failed: 'Capture en échec',
  refunded: 'Remboursé',
};

export const CARD_DEPOSIT_STATUS_LABELS: Record<string, string> = {
  en_attente: 'En attente',
  paye: 'Versée',
  rembourse: 'Remboursée',
  rembourse_partiel: 'Remboursée partiellement',
  confisque: 'Confisquée',
};

export const DAILY_BATCH_STATUS_LABELS: Record<string, string> = {
  prepare: 'Préparé',
  pret_a_virer: 'Prêt à virer',
  vire: 'Viré',
  echoue: 'En échec',
};
