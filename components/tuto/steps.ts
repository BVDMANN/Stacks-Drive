import { COMMISSION_CAP, COMMISSION_RATE, COMMISSION_RATE_PERMANENT } from '@/lib/commission';
import { DEPOSIT_FCFA } from '@/lib/gamification';

/** Étapes des tutoriels (v2.21) — chaque étape montre la capture du
 *  VRAI écran de l'app (assets dans `public/tuto/`, prises avec
 *  Playwright — voir `public/tuto/README.md` et
 *  `scripts/capture-tuto.mjs`). Aucune illustration, aucune maquette.
 *  Si un écran change, refaire la capture correspondante.
 *
 *  Les chiffres (commission, dépôt) viennent du code — jamais recopiés
 *  à la main : `lib/commission.ts` (5 % / 8 % / plafond 10 %) et
 *  `lib/gamification.ts` (dépôt) restent la source de vérité. */

export interface TutoStep {
  /** Chemin de la capture dans `public/tuto/`. */
  image: string;
  title: string;
  /** Deux lignes maximum — pas de pavé. */
  text: string;
  /** Description de l'image (accessibilité). */
  alt: string;
  /** `cover` (défaut) : capture plein écran, cadrée en haut — le
   *  contenu utile doit être dans le haut de l'image. `contain` :
   *  capture d'un seul composant, affichée en entier. */
  fit?: 'cover' | 'contain';
}

const LAUNCH_RATE = Math.round(COMMISSION_RATE * 100);
const PERMANENT_RATE = Math.round(COMMISSION_RATE_PERMANENT * 100);
const CAP_RATE = Math.round(COMMISSION_CAP * 100);

/** Tutoriel passager — premier lancement : estimation, propositions,
 *  prix figé, code PIN, paiement direct, Solo vs Groupe. */
export const PASSENGER_STEPS: TutoStep[] = [
  {
    image: '/tuto/passager-01-carte.png',
    title: 'La carte, c’est Libreville',
    text: 'Les chauffeurs en ligne autour de toi, dans un rayon de 5 km. La feuille en bas, c’est ta demande de course.',
    alt: 'Écran d’accueil : carte de Libreville la nuit, chauffeurs autour, feuille « Où allez-vous ? » ouverte.',
  },
  {
    image: '/tuto/passager-02-trajet.png',
    title: 'Ton trajet, ton estimation',
    text: 'Départ, destination : tu vois une estimation indicative. Ce n’est pas le prix — le prix se décide avec ton chauffeur.',
    alt: 'Feuille de demande : départ Aéroport Léon-Mba, destination Centre-ville, estimation indicative affichée.',
  },
  {
    image: '/tuto/passager-03-solo-groupe.png',
    title: 'Solo ou Groupe, tu choisis',
    text: 'Groupe : 1 place, partagée, le moins cher. Solo : le véhicule entier, direct, sans arrêt. Moto = Solo uniquement.',
    alt: 'Choix du type de course : carte Groupe « le moins cher » et carte Solo avec leurs estimations.',
    fit: 'contain',
  },
  {
    image: '/tuto/passager-04-propositions.png',
    title: 'Les chauffeurs proposent leur prix',
    text: 'Chaque proposition affiche prix, places, premier arrêt et un compte à rebours de 60 s. Accepte, refuse, ou contre-propose ton prix.',
    alt: 'Carte de proposition d’un chauffeur : prix, places restantes, premier arrêt, boutons Accepter et Refuser.',
    fit: 'contain',
  },
  {
    image: '/tuto/passager-05-pin.png',
    title: 'Prix accepté = prix figé',
    text: 'Une fois accepté, le prix ne bouge plus — jamais de surge. Ton code PIN à 4 chiffres s’affiche : donne-le à ton chauffeur quand il arrive, c’est lui qui démarre la course.',
    alt: 'Écran du code de démarrage : « Ton code de démarrage », 4 chiffres en or.',
    fit: 'contain',
  },
  {
    image: '/tuto/passager-06-paiement.png',
    title: 'Tu paies ton chauffeur directement',
    text: 'Espèces, Airtel Money ou Moov Money — directement au chauffeur. L’appli ne touche jamais ton argent.',
    alt: 'Feuille de demande : choix du paiement, Espèces, Airtel Money ou Moov Money.',
  },
];

/** Formation chauffeur (v2.21) — version légère de la formation
 *  Gozem, 100 % dans l’app : mise en ligne, demandes, prix, places,
 *  PIN, paiement, commission, règlement hebdo, règles de conduite. */
export const DRIVER_STEPS: TutoStep[] = [
  {
    image: '/tuto/chauffeur-01-mise-en-ligne.png',
    title: 'Mets-toi en ligne',
    text: 'Un interrupteur, ton quartier, et tu apparais sur la carte des passagers. Une pop-up te demande tes places libres.',
    alt: 'Accueil chauffeur : interrupteur « En ligne », quartier, gains du jour, bouton « Mes places ».',
  },
  {
    image: '/tuto/chauffeur-02-demande.png',
    title: 'Une demande arrive',
    text: 'Trajet, type Solo ou Groupe, prix proposé par le passager s’il en a mis un. Tu as 60 s pour répondre — ou ignorer.',
    alt: 'Pop-up « Nouvelle demande de course » : trajet, estimation, champ pour proposer ton prix.',
    fit: 'contain',
  },
  {
    image: '/tuto/chauffeur-03-places.png',
    title: 'Propose ton prix, dis tes places',
    text: 'Tu fixes ton prix librement. En Groupe tu proposes au minimum 1 place ; en Solo, le véhicule entier. Tes places libres bornent ce que tu peux promettre.',
    alt: 'Pop-up « Combien de places libres dans ton véhicule ? » avec compteur de places.',
    fit: 'contain',
  },
  {
    image: '/tuto/chauffeur-04-pin.png',
    title: 'Le code PIN du passager',
    text: 'Le passager te donne son code à 4 chiffres quand tu arrives : tape-le pour démarrer le trajet. 5 codes faux = course verrouillée, seul l’admin débloque.',
    alt: 'Saisie du code PIN à 4 chiffres pour démarrer le trajet.',
    fit: 'contain',
  },
  {
    image: '/tuto/chauffeur-05-commission.png',
    title: `Ta commission : ${LAUNCH_RATE} % puis ${PERMANENT_RATE} %, plafond ${CAP_RATE} %`,
    text: `Tu gardes ${100 - PERMANENT_RATE} à ${100 - LAUNCH_RATE} % de chaque course. Rien n’est déduit pendant tes courses : la commission se règle une fois par semaine.`,
    alt: 'Page « Devenir chauffeur » : « Tu gardes 92 à 95 % de chaque course », commission 5 % puis 8 %, plafond 10 %.',
  },
  {
    image: '/tuto/chauffeur-06-reglement.png',
    title: 'Règlement hebdo et règles de conduite',
    text: `Chaque lundi, ton relevé : courses, commission due, dette. Tu règles en un seul transfert Mobile Money. Dépôt de garantie ${DEPOSIT_FCFA.toLocaleString('fr-FR')} FCFA, remboursable. Conduis proprement — ponctuel, poli, véhicule propre : ta note fait tes prochaines courses.`,
    alt: 'Page « Devenir chauffeur » : dépôt de garantie remboursable de 5 000 FCFA, demandes en pause si la dette dépasse le plafond.',
  },
];

/** Clés localStorage (v2.21). */
export const TUTO_PASSENGER_SEEN_KEY = 'stacks-drive-tuto-passager-vu';
export const TUTO_DRIVER_SEEN_KEY = 'stacks-drive-tuto-chauffeur-vu';
/** Mis à la création d'un compte chauffeur (inscription) : le
 *  tutoriel chauffeur s'ouvre au premier passage sur le tableau de
 *  bord, puis la clé est effacée. */
export const TUTO_DRIVER_PENDING_KEY = 'stacks-drive-tuto-chauffeur-a-faire';

/** Événements pour rouvrir un tutoriel depuis n'importe quelle page
 *  où sa modale est montée (compte, tableau de bord, accueil). */
export const TUTO_PASSENGER_OPEN_EVENT = 'stacks-drive:open-tuto-passager';
export const TUTO_DRIVER_OPEN_EVENT = 'stacks-drive:open-tuto-chauffeur';
