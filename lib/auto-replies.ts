/** Réponses automatiques aux plaintes standard (v2.29, lot F).
 *
 *  Une plainte ouverte depuis une course terminée ou annulée ne
 *  remonte PAS toujours à un humain : quand le motif est standard
 *  (retard, attente, annulation, prix ou paiement contesté sans
 *  fraude, itinéraire, véhicule), l'application répond
 *  IMMÉDIATEMENT, sans intervention humaine — excuse adaptée,
 *  explication concrète avec les chiffres de LA course (prix figé
 *  accepté, estimation indicative, qui a annulé et pourquoi) et
 *  actions existantes (refaire une demande, se remettre en ligne,
 *  entrée FAQ). La réponse est journalisée dans `audit_log`
 *  (`complaint_auto_replied`) : elle ne crée ni litige ni e-mail.
 *
 *  Escalade (litige, flux v2.15 existant : dossier complet dans
 *  /admin + e-mail admin) quand la plainte n'est PAS standard
 *  (mot grave : fraude, vol, comportement dangereux… ; montant
 *  contesté important ; sujet « Autre problème ») OU quand
 *  l'utilisateur rejette la réponse auto (« Ça ne résout pas mon
 *  problème »). Le litige escaladé porte le préfixe
 *  `[Réponse auto « … » rejetée — transmis à Stacks Drive]` dans
 *  son message : l'admin voit d'où il vient, sans nouvelle colonne.
 *
 *  Règles de contenu (comme partout) : l'application ne touche
 *  jamais l'argent — AUCUNE remise, AUCUN remboursement
 *  automatique, AUCUN crédit. La réponse auto = message + guidage
 *  + actions existantes uniquement. Les prix ne sont jamais
 *  recalculés ici, `lib/commission.ts` n'est pas touché.
 *
 *  Imports RELATIFS (et non `@/…`) : ce module est partagé
 *  client + serveur ET importé tel quel par le script de
 *  vérification `scripts/verify-lot-f.mjs` (Node, sans alias
 *  TypeScript — le hook `scripts/ts-resolve-hooks.mjs` ajoute
 *  l'extension `.ts` aux imports relatifs). `lib/commission.ts`,
 *  `lib/faq.ts` et `lib/dispute-types.ts` n'ont eux-mêmes aucun
 *  import : la chaîne reste importable en Node.
 */

import { formatFcfa } from './commission';
import type { DisputeReason } from './dispute-types';

/** Sujets de plainte proposés dans le parcours depuis la course. */
export const COMPLAINT_TOPICS = [
  {
    id: 'retard',
    shortLabel: 'Retard',
    labelPassager: 'Chauffeur en retard',
    labelChauffeur: 'Passager en retard',
    disputeReason: 'autre',
    faqId: 'retard',
    standard: true,
  },
  {
    id: 'attente',
    shortLabel: 'Attente trop longue',
    labelPassager: 'Attente trop longue',
    labelChauffeur: 'Attente trop longue',
    disputeReason: 'autre',
    faqId: 'retard',
    standard: true,
  },
  {
    id: 'annulation',
    shortLabel: 'Annulation',
    labelPassager: "Annulation par l'autre partie",
    labelChauffeur: "Annulation par l'autre partie",
    disputeReason: 'annulation',
    faqId: 'annulation',
    standard: true,
  },
  {
    id: 'prix',
    shortLabel: 'Prix contesté',
    labelPassager: 'Prix / montant contesté',
    labelChauffeur: 'Prix / montant contesté',
    disputeReason: 'prix',
    faqId: 'prix',
    standard: true,
  },
  {
    id: 'paiement',
    shortLabel: 'Paiement',
    labelPassager: 'Paiement / monnaie',
    labelChauffeur: 'Paiement / monnaie',
    disputeReason: 'paiement',
    faqId: 'paiement',
    standard: true,
  },
  {
    id: 'trajet',
    shortLabel: 'Itinéraire',
    labelPassager: 'Itinéraire / destination',
    labelChauffeur: 'Itinéraire / destination',
    disputeReason: 'trajet',
    faqId: null,
    standard: true,
  },
  {
    id: 'vehicule',
    shortLabel: 'Véhicule',
    labelPassager: 'Véhicule / propreté',
    labelChauffeur: 'Véhicule / propreté',
    disputeReason: 'vehicule',
    faqId: null,
    standard: true,
  },
  {
    id: 'autre',
    shortLabel: 'Autre problème',
    labelPassager: 'Autre problème (comportement, sécurité…)',
    labelChauffeur: 'Autre problème (comportement, sécurité…)',
    disputeReason: 'autre',
    faqId: 'securite',
    standard: false,
  },
] as const;

export type ComplaintTopicId = (typeof COMPLAINT_TOPICS)[number]['id'];
export const COMPLAINT_TOPIC_IDS = COMPLAINT_TOPICS.map((t) => t.id) as unknown as [
  ComplaintTopicId,
  ...ComplaintTopicId[],
];

export type ComplaintTopic = (typeof COMPLAINT_TOPICS)[number];

export function topicById(id: string): ComplaintTopic | null {
  return COMPLAINT_TOPICS.find((t) => t.id === id) ?? null;
}

/** Libellé du sujet, selon le rôle de celui qui se plaint. */
export function topicLabel(topic: ComplaintTopic, role: 'passager' | 'chauffeur'): string {
  return role === 'chauffeur' ? topic.labelChauffeur : topic.labelPassager;
}

/** Sujets proposés pour une course : l'annulation n'a de sens que
 *  si la course a été annulée ; les autres sujets valent pour une
 *  course terminée comme annulée. */
export function topicsForRide(rideStatus: 'terminee' | 'annulee'): ComplaintTopic[] {
  return COMPLAINT_TOPICS.filter((t) => t.id !== 'annulation' || rideStatus === 'annulee');
}

// ---------------------------------------------------------------------------
// Classification : standard (réponse auto) ou escalade (litige humain)
// ---------------------------------------------------------------------------

/** Montant contesté au-delà duquel la plainte n'est plus standard :
 *  un humain doit trancher. Même seuil que le dépôt de garantie et
 *  le plafond de dette (~5 000 FCFA) : un montant « important »
 *  pour les deux parties. */
export const LARGE_AMOUNT_FCFA = 5000;

/** Mots graves (texte normalisé : minuscules, sans accents) : la
 *  plainte parle de fraude, de vol ou de sécurité — jamais de
 *  réponse auto, un humain examine. 'vol' est traité à part pour
 *  ne pas escalader sur « volant ». */
const GRAVE_STEMS = [
  'fraud',
  'arnaqu',
  'escroq',
  'menac',
  'agress',
  'violence',
  'violent',
  'danger',
  'arme',
  'couteau',
  'drogue',
  'alcool',
  'ivre',
  'harcel',
  'insult',
];
const VOL_WORDS = new Set(['vol', 'vole', 'voler', 'voles', 'volee', 'volent']);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function containsGraveKeyword(text: string): boolean {
  const words = normalize(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words.some((w) => VOL_WORDS.has(w) || GRAVE_STEMS.some((s) => w.startsWith(s)));
}

export type EscalationReason =
  | 'mot-grave'
  | 'montant-important'
  | 'sujet-non-standard'
  | 'rejet-reponse-auto';

export const ESCALATION_LABELS: Record<EscalationReason, string> = {
  'mot-grave':
    'Motif grave signalé (fraude, vol, sécurité…) — un humain doit examiner.',
  'montant-important':
    'Montant contesté important (plus de 5 000 FCFA) — un humain doit trancher.',
  'sujet-non-standard':
    'Sujet hors des plaintes standard — un humain doit examiner.',
  'rejet-reponse-auto':
    'Réponse automatique rejetée par l’utilisateur — un humain prend le relais.',
};

export type ComplaintClassification =
  | { outcome: 'auto'; autoReplyId: ComplaintTopicId }
  | { outcome: 'escalate'; escalationReason: EscalationReason };

/** Classifie une plainte. Seule source de vérité, côté client
 *  (affichage immédiat) comme côté serveur (route
 *  /api/complaints/auto-reply, qui re-classe avant de répondre). */
export function classifyComplaint(input: {
  topic: string;
  message?: string | null;
  amountConcerned?: number | null;
}): ComplaintClassification {
  const topic = topicById(input.topic);
  if (!topic) return { outcome: 'escalate', escalationReason: 'sujet-non-standard' };
  if (!topic.standard) {
    return { outcome: 'escalate', escalationReason: 'sujet-non-standard' };
  }
  if (input.message && containsGraveKeyword(input.message)) {
    return { outcome: 'escalate', escalationReason: 'mot-grave' };
  }
  if (
    (input.topic === 'prix' || input.topic === 'paiement') &&
    input.amountConcerned != null &&
    input.amountConcerned > LARGE_AMOUNT_FCFA
  ) {
    return { outcome: 'escalate', escalationReason: 'montant-important' };
  }
  return { outcome: 'auto', autoReplyId: topic.id };
}

// ---------------------------------------------------------------------------
// Réponses automatiques (contenu concret, avec les chiffres de la course)
// ---------------------------------------------------------------------------

export interface AutoReplyAction {
  label: string;
  href: string;
}

export interface AutoReply {
  id: ComplaintTopicId;
  title: string;
  apology: string;
  explanation: string;
  whatHappens: string;
  actions: AutoReplyAction[];
  /** Entrée FAQ liée (`/aide#<faqId>`), null quand aucune entrée
   *  ne couvre le sujet — on ne renvoie jamais vers une FAQ
   *  approximative. */
  faqId: string | null;
}

export interface AutoReplyContext {
  topic: ComplaintTopicId;
  role: 'passager' | 'chauffeur';
  rideStatus: 'terminee' | 'annulee';
  cancelledBy: 'passager' | 'chauffeur' | null;
  cancelReason: string | null;
  acceptedPrice: number | null;
  estimatedPrice: number;
  loyaltyFree: boolean;
  amountConcerned?: number | null;
}

function priceSentence(ctx: AutoReplyContext): string {
  if (ctx.loyaltyFree) return 'ta course était offerte (10e course), tu n’as rien payé';
  if (ctx.acceptedPrice !== null) {
    return `le prix figé accepté était de ${formatFcfa(ctx.acceptedPrice)}`;
  }
  return 'le prix accepté est resté figé';
}

function newRequestAction(role: 'passager' | 'chauffeur'): AutoReplyAction {
  return role === 'chauffeur'
    ? { label: 'Te remettre en ligne', href: '/tableau-de-bord' }
    : { label: 'Refaire une demande', href: '/' };
}

function cancelledBySentence(ctx: AutoReplyContext): string {
  if (!ctx.cancelledBy) return 'annulée';
  const who =
    ctx.cancelledBy === ctx.role
      ? 'par toi'
      : ctx.cancelledBy === 'chauffeur'
        ? 'par le chauffeur'
        : 'par le passager';
  return `annulée ${who}${ctx.cancelReason ? ` — motif : ${ctx.cancelReason}` : ''}`;
}

export function buildAutoReply(ctx: AutoReplyContext): AutoReply {
  const price = priceSentence(ctx);
  switch (ctx.topic) {
    case 'retard': {
      const other = ctx.role === 'passager' ? 'Ton chauffeur' : 'Ton passager';
      return {
        id: 'retard',
        title: ctx.role === 'passager' ? 'Retard du chauffeur' : 'Retard du passager',
        apology:
          ctx.role === 'passager'
            ? 'Désolé pour cette attente — un chauffeur en retard, c’est du temps perdu, et c’est normal de le signaler.'
            : 'Désolé — attendre un passager qui n’arrive pas, c’est du temps perdu.',
        explanation:
          ctx.role === 'passager'
            ? `${other} est arrivé en retard, mais le prix n’a pas bougé : ${price} — un retard ne change jamais le prix, ni la commission.`
            : `La course est restée au prix convenu : ${price}. Tant qu’elle n’a pas démarré, tu peux annuler sans frais quand le passager n’est pas là — une course annulée ne génère aucune commission.`,
        whatHappens:
          'Ton signalement est consigné dans l’historique de la course. Les retards répétés sont visibles par Stacks Drive.',
        actions: [newRequestAction(ctx.role)],
        faqId: 'retard',
      };
    }
    case 'attente':
      return {
        id: 'attente',
        title: 'Attente trop longue',
        apology: 'Désolé pour cette longue attente.',
        explanation: `L’attente ne change pas le prix : ${price}. La prochaine fois, si personne n’arrive, tu peux annuler sans frais tant que la course n’a pas démarré — une course annulée n’est jamais facturée.`,
        whatHappens: 'Ton signalement est consigné dans l’historique de la course.',
        actions: [newRequestAction(ctx.role)],
        faqId: 'retard',
      };
    case 'annulation':
      return {
        id: 'annulation',
        title: 'Course annulée',
        apology: 'Désolé — une course annulée au dernier moment, c’est frustrant.',
        explanation: `Cette course est close : ${cancelledBySentence(ctx)}. Aucune facturation — ${
          ctx.role === 'passager'
            ? 'tu n’as rien payé et le chauffeur n’a rien touché'
            : 'tu n’as rien touché et le passager n’a rien payé'
        } ; une course annulée ne génère aucune commission.`,
        whatHappens:
          'La course est fermée, il n’y a plus rien à régler. Tu peux refaire une demande quand tu veux.',
        actions: [newRequestAction(ctx.role)],
        faqId: 'annulation',
      };
    case 'prix':
      return {
        id: 'prix',
        title: 'Prix contesté',
        apology: 'Désolé pour ce désaccord sur le prix — voici exactement ce qui a été convenu.',
        explanation:
          `Prix figé accepté : ${
            ctx.loyaltyFree
              ? '0 FCFA — course offerte (10e course)'
              : ctx.acceptedPrice !== null
                ? formatFcfa(ctx.acceptedPrice)
                : 'non fixé'
          }. Estimation indicative affichée avant la course : ${formatFcfa(ctx.estimatedPrice)} — ce n’était qu’une indication pour négocier, pas le prix de la course. Un détour, un retard ou un embouteillage ne change jamais le prix figé.` +
          (ctx.amountConcerned != null
            ? ` Tu contestes ${formatFcfa(ctx.amountConcerned)} — c’est l’écart que tu as indiqué.`
            : ''),
        whatHappens:
          'Tu n’avais à payer que le prix figé — rien de plus. Si le chauffeur t’a demandé plus que ce prix, transmets le litige : un humain examinera la course.',
        actions: [newRequestAction(ctx.role)],
        faqId: 'prix',
      };
    case 'paiement':
      return {
        id: 'paiement',
        title: 'Paiement / monnaie',
        apology: 'Désolé pour ce souci de paiement.',
        explanation: `Le montant à payer était le prix figé accepté : ${
          ctx.loyaltyFree
            ? '0 FCFA — course offerte (10e course)'
            : ctx.acceptedPrice !== null
              ? formatFcfa(ctx.acceptedPrice)
              : 'non fixé'
        }. Tu paies directement ton chauffeur, en espèces ou par Mobile Money (Airtel Money ou Moov Money) — l’application ne touche jamais l’argent, elle compte seulement.`,
        whatHappens:
          'Si la monnaie manquait, prévois l’appoint la prochaine fois. Si tu as payé plus que le prix figé, transmets le litige : un humain examinera la course.',
        actions: [newRequestAction(ctx.role)],
        faqId: 'paiement',
      };
    case 'trajet':
      return {
        id: 'trajet',
        title: 'Itinéraire / destination',
        apology: 'Désolé — l’itinéraire n’était pas celui que tu attendais.',
        explanation: `Le prix ne dépend pas de l’itinéraire pris : une fois accepté, il est figé (${price}) — un détour ne l’augmente pas.`,
        whatHappens:
          'Ton signalement est consigné dans l’historique de la course. Si le chauffeur ne t’a pas mené à la bonne destination, transmets le litige : un humain examinera la course.',
        actions: [newRequestAction(ctx.role)],
        faqId: null,
      };
    case 'vehicule':
      return {
        id: 'vehicule',
        title: 'Véhicule / propreté',
        apology: 'Désolé pour l’état du véhicule.',
        explanation:
          'La propreté et l’état du véhicule font partie de ce qu’on attend d’un chauffeur Stacks Drive.',
        whatHappens:
          'Ton signalement est consigné dans l’historique du chauffeur — les signalements répétés sur un véhicule sont visibles par Stacks Drive.',
        actions: [newRequestAction(ctx.role)],
        faqId: null,
      };
    case 'autre':
    default:
      // Sujet non standard : pas de réponse auto — ce cas ne doit
      // pas arriver (classifyComplaint escalade avant), mais on ne
      // renvoie jamais une réponse vide.
      return {
        id: 'autre',
        title: 'Autre problème',
        apology: 'Merci pour ton signalement.',
        explanation:
          'Ce sujet demande l’examen d’un humain : ton litige est transmis à Stacks Drive, qui examinera ta course.',
        whatHappens: 'Un humain va examiner ta course et te recontacter si besoin.',
        actions: [],
        faqId: 'securite',
      };
  }
}

// ---------------------------------------------------------------------------
// Traçabilité de l'escalade (sans nouvelle colonne : le préfixe vit
// dans le message du litige, visible dans /admin et dans l'e-mail)
// ---------------------------------------------------------------------------

/** Préfixe ajouté au message d'un litige escaladé après une
 *  réponse auto (rejetée par l'utilisateur). */
export function escalationPrefix(topicId: string): string {
  const topic = topicById(topicId);
  return `[Réponse auto « ${topic?.shortLabel ?? topicId} » rejetée — transmis à Stacks Drive]`;
}

/** Détecte un litige escaladé après réponse auto et rend son
 *  message lisible (préfixe retiré). Null sinon. */
export function parseEscalatedAutoReply(message: string): {
  label: string;
  cleanMessage: string;
} | null {
  const m = message.match(/^\[Réponse auto « (.+?) » rejetée — transmis à Stacks Drive\] ?/);
  if (!m) return null;
  return { label: m[1] ?? '', cleanMessage: message.slice(m[0].length) };
}

/** Motif de litige (v2.15) vers lequel un sujet de plainte est
 *  routé quand il escalade. */
export function disputeReasonForTopic(topicId: string): DisputeReason {
  return topicById(topicId)?.disputeReason ?? 'autre';
}
