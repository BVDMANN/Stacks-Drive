/** FAQ in-app (v2.24) — réponses automatiques aux questions
 *  courantes. Aucune question courante ne remonte à
 *  l'administrateur : seules les questions sans réponse ici
 *  renvoient vers l'ouverture d'un litige (depuis la course) ou
 *  un message à l'administrateur — jamais d'e-mail direct au
 *  propriétaire pour une question courante.
 *
 *  Règles de contenu (comme partout) : les montants affichés sont
 *  des estimations indicatives, jamais des prix fixes — le prix
 *  final se négocie et se fige une fois accepté ; Groupe = 1 place,
 *  Solo = véhicule entier. */

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  /** Mots-clés (sans accent, minuscules) pour la recherche. */
  keywords: string[];
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'prix',
    question: 'Combien coûte une course ?',
    answer:
      "Il n'y a pas de tarif fixe : l'application affiche une estimation indicative selon ton trajet, puis les chauffeurs proposent leur prix. Tu peux accepter, refuser ou contre-proposer. Une fois que tu acceptes un prix, il est figé : il ne bougera plus.",
    keywords: ['prix', 'cout', 'coute', 'tarif', 'combien', 'cher', 'payer', 'montant', 'estimation'],
  },
  {
    id: 'estimation',
    question: "C'est quoi l'estimation affichée avant de commander ?",
    answer:
      "C'est une indication pour t'aider à négocier, calculée selon la distance entre ton départ et ta destination. Ce n'est pas le prix de la course : le prix final est celui que tu acceptes avec ton chauffeur. Pour un quartier à accès difficile, un supplément route non bitumée peut s'ajouter si tu demandes de continuer jusqu'au bout.",
    keywords: ['estimation', 'estime', 'indicatif', 'indication', 'approximatif', 'devis'],
  },
  {
    id: 'pin',
    question: "C'est quoi le code PIN ?",
    answer:
      "C'est un code à 4 chiffres affiché dans ton application quand ta course est confirmée. Donne-le à ton chauffeur quand il arrive : c'est lui qui le saisit pour démarrer la course, et ça prouve que c'est bien ton chauffeur. Ne le donne à personne d'autre, et ne le partage jamais par message avant son arrivée. Après 5 codes faux, la course est verrouillée et l'administrateur doit la débloquer.",
    keywords: ['pin', 'code', 'demarrer', 'depart', 'deblocage', 'verrouille', 'verrouillage', 'chiffres'],
  },
  {
    id: 'paiement',
    question: 'Comment je paie ma course ?',
    answer:
      "Tu paies directement ton chauffeur à la fin de la course, en espèces ou par Mobile Money (Airtel Money ou Moov Money). L'application ne touche jamais à l'argent : elle compte seulement. Le prix à payer est le prix figé quand tu as accepté la proposition.",
    keywords: ['paiement', 'payer', 'paye', 'especes', 'cash', 'mobile', 'money', 'airtel', 'moov', 'transfert', 'argent'],
  },
  {
    id: 'annulation',
    question: 'Comment annuler une course ?',
    answer:
      "Tu peux annuler tant que la course n'a pas démarré, depuis l'écran de ta course : un motif est demandé. Si la course était déjà acceptée, ton chauffeur est prévenu tout de suite dans l'application. Une course démarrée ne peut plus être annulée. Les annulations répétées sont signalées.",
    keywords: ['annuler', 'annulation', 'annule', 'supprimer', 'plus', 'besoin', 'rembourser', 'remboursement'],
  },
  {
    id: 'retard',
    question: 'Mon chauffeur est en retard, que faire ?',
    answer:
      "Suis son arrivée sur la carte : l'heure estimée se met à jour en direct. Si la course n'a pas démarré, tu peux annuler sans frais depuis l'écran de la course — une course annulée n'est jamais facturée. Le prix, lui, ne change pas : une fois accepté, il est figé, retard ou pas. Si le retard t'a vraiment pénalisé, signale-le depuis ta course : tu reçois une réponse tout de suite, et un humain tranche si ça ne suffit pas.",
    keywords: ['retard', 'en retard', 'attendre', 'attente', 'long', 'longue', 'tard', 'arrive', 'arrivee', 'arrive'],
  },
  {
    id: 'solo-groupe',
    question: 'Quelle est la différence entre Solo et Groupe ?',
    answer:
      "Solo : le véhicule entier est pour toi, personne d'autre ne monte. Groupe : tu prends 1 place, le chauffeur peut prendre d'autres passagers sur le même trajet. La moto est toujours en Solo, jamais en Groupe.",
    keywords: ['solo', 'groupe', 'partage', 'partagee', 'place', 'places', 'seul', 'vehicule', 'entier', 'moto'],
  },
  {
    id: 'propositions',
    question: "Je ne reçois pas de proposition, que faire ?",
    answer:
      "Vérifie que ton départ et ta destination sont bien choisis et différents. Si aucun chauffeur n'est en ligne près de toi, attends un peu : la recherche s'élargit toute seule après 30 secondes. Tu peux aussi proposer ton prix directement dans ta demande : les chauffeurs le voient et peuvent l'accepter.",
    keywords: ['proposition', 'propositions', 'aucun', 'personne', 'chauffeur', 'trouve', 'attendre', 'recherche', 'vide', 'repond'],
  },
  {
    id: 'verification-chauffeur',
    question: 'Comment devenir chauffeur ?',
    answer:
      "Crée ton compte chauffeur depuis « Devenir chauffeur », renseigne ton véhicule, puis envoie ton selfie et ta pièce d'identité (ou ton permis) pour la vérification. Sans vérification, tu ne peux pas te mettre en ligne. Une fois vérifié, tu te mets en ligne, tu déclares tes places libres, et tu proposes ton prix aux passagers près de toi.",
    keywords: ['devenir', 'chauffeur', 'verification', 'verifier', 'verifie', 'selfie', 'piece', 'identite', 'permis', 'inscrire', 'inscription', 'compte'],
  },
  {
    id: 'commission-chauffeur',
    question: 'Combien coûte la commission pour les chauffeurs ?',
    answer:
      "La commission est de 5 % au lancement, puis 8 %, et elle est plafonnée à 10 % pour toujours. Tu gardes le reste du prix de chaque course. Tu règles tes commissions une fois par semaine, par transfert Mobile Money, et tu déclares ton paiement dans ton tableau de bord (« J'ai payé »). Si ce que tu dois atteint 5 000 FCFA, tu ne reçois plus de nouvelles demandes tant que tu n'as pas réglé.",
    keywords: ['commission', 'frais', 'pourcentage', 'gagner', 'gains', 'dette', 'regler', 'reglement', 'payer', 'plafond', 'depot'],
  },
  {
    id: 'fidelite',
    question: "C'est quoi la 10e course offerte ?",
    answer:
      "À chaque course terminée, tu gagnes des points. Quand tu as assez de points, ta 10e course est offerte : tu ne paies rien, et ton chauffeur touche tout le tarif quand même.",
    keywords: ['fidelite', 'points', 'offerte', 'offert', 'gratuit', 'gratuite', '10e', 'dixieme', 'bonus', 'cadeau'],
  },
  {
    id: 'securite',
    question: 'Comment je reste en sécurité pendant une course ?',
    answer:
      "Ton chauffeur est vérifié (selfie + pièce d'identité). Pendant la course, tu peux écrire à ton chauffeur dans la messagerie de l'application — ton numéro de téléphone n'est jamais affiché. Tu peux aussi partager ton trajet en direct avec un proche (contact de confiance) et utiliser le bouton SOS en cas de problème. Si quelque chose ne va pas, ouvre un litige depuis ta course : l'administrateur tranche.",
    keywords: ['securite', 'securite', 'sos', 'danger', 'probleme', 'litige', 'plainte', 'partager', 'suivi', 'proche', 'confiance', 'urgence'],
  },
  {
    id: 'compte',
    question: 'Je ne peux pas passer en mode Chauffeur, pourquoi ?',
    answer:
      "Le mode Chauffeur demande un compte chauffeur créé : si tu n'as qu'un compte passager, la bascule est bloquée et l'application te dirige vers « Devenir chauffeur » pour créer ton compte et te faire vérifier. Un compte chauffeur vérifié peut basculer librement entre les deux modes.",
    keywords: ['mode', 'bascule', 'basculer', 'passager', 'compte', 'bloque', 'changer', 'role'],
  },
];

/** Normalise une recherche : minuscules, sans accents. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Trouve la meilleure réponse à une question libre. Renvoie null
 *  quand aucune question courante ne correspond : c'est le cas
 *  ambigu — l'interface renvoie alors vers l'ouverture d'un
 *  litige ou un message à l'administrateur, jamais vers une
 *  réponse inventée. */
export function answerFaq(query: string): FaqItem | null {
  const q = normalize(query.trim());
  if (q.length < 2) return null;
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  let best: FaqItem | null = null;
  let bestScore = 0;
  for (const item of FAQ_ITEMS) {
    let score = 0;
    const questionNorm = normalize(item.question);
    if (questionNorm.includes(q) && q.length > 4) score += 10;
    for (const word of words) {
      if (item.keywords.some((k) => k === word)) score += 3;
      else if (item.keywords.some((k) => k.startsWith(word) || word.startsWith(k))) score += 1;
      if (questionNorm.includes(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return bestScore >= 3 ? best : null;
}
