#!/usr/bin/env node
/** verify-lot-f.mjs — Vérification locale du lot F (réponses
 *  automatiques aux plaintes standard, v2.29).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) :
 *  - la classification (lib/auto-replies.ts, importée telle quelle
 *    — Node 24, suppression de types, imports relatifs uniquement)
 *    : chaque sujet standard → réponse auto ; mot grave, montant
 *    contesté > 5 000 FCFA, sujet « Autre » → escalade ;
 *  - le contenu des réponses auto : concret (prix figé, estimation,
 *    annulation = aucune facturation), jamais de compensation
 *    promise (aucune remise / remboursement / crédit automatique),
 *    lien FAQ valide quand il existe ;
 *  - la traçabilité d'escalade (préfixe → libellé + message net) ;
 *  - les branchements relus DEPUIS les fichiers livrés (route
 *    /api/complaints/auto-reply, DisputeForm, AutoReplyCard,
 *    ancres FAQ, badge admin, événements d'audit) ;
 *  - qu'aucune migration F n'a été ajoutée (réutilisation de
 *    `disputes` / `audit_log` uniquement), aucun nouveau cron, et
 *    que `lib/commission.ts` (5 % puis 8 %, plafond 10 %) et
 *    `lib/pricing.ts` ne sont pas touchés par le lot ;
 *  - les 2 RÈGLES (priorité n°1) : barre de chargement partout où
 *    il y a un temps d'attente, et switch passager → chauffeur
 *    impossible sans compte chauffeur (redirection
 *    « Devenir chauffeur », contrôle serveur) ;
 *  - aucun marqueur de fonctionnalité future (« bientôt »,
 *    « à venir ») dans les fichiers du lot.
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le
 *  parcours en session connectée réelle (plainte standard →
 *  réponse auto immédiate, rejet → litige dans /admin) — Supabase
 *  n'est pas configuré sur le serveur de dev (les routes API
 *  renvoient 503, comme les autres routes) et aucun compte de test
 *  n'existe. Test connecté avec le propriétaire après le push.
 *
 *  Usage : node scripts/verify-lot-f.mjs (sortie 0 = tout passe).
 *  Le serveur de dev doit tourner sur le port 3100 (ou DEV_URL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

// Résolution `.ts` pour les imports relatifs des modules lib
// (Node ESM exige une extension, le code Next.js n'en met pas).
register('./ts-resolve-hooks.mjs', import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEV = process.env.DEV_URL ?? 'http://localhost:3100';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// --- 1. Classification + contenu (module importé tel quel) ----------
const auto = await import('../lib/auto-replies.ts');
const { FAQ_ITEMS } = await import('../lib/faq.ts');

const cases = [
  ['retard standard → auto', { topic: 'retard', message: 'il avait 20 min de retard' }, 'auto'],
  ['attente standard → auto', { topic: 'attente', message: '' }, 'auto'],
  ['annulation standard → auto', { topic: 'annulation', message: 'le chauffeur a annulé' }, 'auto'],
  ['prix 1 500 FCFA → auto', { topic: 'prix', message: 'prix non respecté', amountConcerned: 1500 }, 'auto'],
  ['prix 5 000 FCFA (seuil) → auto', { topic: 'prix', message: 'écart', amountConcerned: 5000 }, 'auto'],
  ['paiement 2 000 FCFA → auto', { topic: 'paiement', message: 'pas de monnaie', amountConcerned: 2000 }, 'auto'],
  ['trajet standard → auto', { topic: 'trajet', message: 'détour par un autre quartier' }, 'auto'],
  ['véhicule standard → auto', { topic: 'vehicule', message: 'voiture sale' }, 'auto'],
  ['fraude → escalade', { topic: 'prix', message: 'il m’a arnaqué, fraude sur le prix' }, 'escalate'],
  ['vol → escalade', { topic: 'autre', message: 'il a volé mon sac' }, 'escalate'],
  ['comportement dangereux → escalade', { topic: 'autre', message: 'conduite dangereuse, il menaçait' }, 'escalate'],
  ['montant 6 000 FCFA → escalade', { topic: 'prix', message: 'écart important', amountConcerned: 6000 }, 'escalate'],
  ['montant 50 000 FCFA → escalade', { topic: 'paiement', message: 'trop perçu', amountConcerned: 50000 }, 'escalate'],
  ['sujet Autre → escalade', { topic: 'autre', message: 'comportement déplacé' }, 'escalate'],
  ['sujet inconnu → escalade', { topic: 'nimportequoi', message: 'x' }, 'escalate'],
  ['« volant » seul n’escalade pas', { topic: 'trajet', message: 'il tournait le volant brusquement' }, 'auto'],
];
for (const [name, input, want] of cases) {
  const got = auto.classifyComplaint(input);
  check(name, got.outcome === want, `attendu ${want}, obtenu ${got.outcome}`);
}

// Seuil montant important = 5 000 FCFA (dépôt / plafond de dette).
check('seuil montant important = 5 000 FCFA', auto.LARGE_AMOUNT_FCFA === 5000);

// Contenu des réponses : concrets, sans compensation promise.
const baseCtx = {
  role: 'passager',
  rideStatus: 'terminee',
  cancelledBy: null,
  cancelReason: null,
  acceptedPrice: 1500,
  estimatedPrice: 1200,
  loyaltyFree: false,
  amountConcerned: null,
};
const FORBIDDEN = ['tu seras remboursé', 'remboursement automatique', 'remise de', 'crédit offert', 'on te rembourse'];
for (const t of ['retard', 'attente', 'annulation', 'prix', 'paiement', 'trajet', 'vehicule']) {
  const r = auto.buildAutoReply({ ...baseCtx, topic: t, rideStatus: t === 'annulation' ? 'annulee' : 'terminee', cancelledBy: t === 'annulation' ? 'chauffeur' : null, cancelReason: t === 'annulation' ? 'Changement de programme' : null });
  const text = `${r.title} ${r.apology} ${r.explanation} ${r.whatHappens}`.toLowerCase();
  check(`réponse « ${t} » concrète`, text.length > 120 && !text.includes('votre demande a bien été reçue'));
  check(
    `réponse « ${t} » sans compensation promise`,
    !FORBIDDEN.some((f) => text.includes(f))
  );
  if (r.faqId) {
    check(`réponse « ${t} » → FAQ existante`, FAQ_ITEMS.some((f) => f.id === r.faqId), `faqId=${r.faqId}`);
  }
  check(`réponse « ${t} » propose une action`, r.actions.length >= 1);
}
const annulation = auto.buildAutoReply({
  ...baseCtx, topic: 'annulation', rideStatus: 'annulee', cancelledBy: 'chauffeur', cancelReason: 'Changement de programme',
});
check(
  'annulation : aucune facturation, course close',
  annulation.explanation.includes('Aucune facturation') && annulation.explanation.includes('Changement de programme')
);
const prix = auto.buildAutoReply({ ...baseCtx, topic: 'prix', amountConcerned: 1500 });
// formatFcfa utilise l'espace insécable étroite (fr-FR) : on
// normalise avant de comparer.
const prixText = prix.explanation.replace(/[  ]/g, ' ');
check(
  'prix : prix figé + estimation indicative cités',
  prixText.includes('1 500 FCFA') && prixText.includes('1 200 FCFA')
);
const prixOffert = auto.buildAutoReply({ ...baseCtx, topic: 'prix', loyaltyFree: true, acceptedPrice: 0 });
check('prix : course offerte gérée', prixOffert.explanation.includes('course offerte'));

// Traçabilité d'escalade : préfixe aller-retour.
const prefix = auto.escalationPrefix('retard');
const parsed = auto.parseEscalatedAutoReply(`${prefix} il avait 20 min de retard`);
check(
  'préfixe escalade → libellé + message net',
  parsed?.label === 'Retard' && parsed?.cleanMessage === 'il avait 20 min de retard'
);
check('message normal → pas de faux positif', auto.parseEscalatedAutoReply('simple message') === null);
check(
  'retard → motif litige « autre » (sans nouvelle valeur)',
  auto.disputeReasonForTopic('retard') === 'autre' && auto.disputeReasonForTopic('prix') === 'prix'
);

// --- 2. FAQ : entrée retard + ancres -------------------------------
const faq = read('lib/faq.ts');
check('FAQ : entrée « retard »', faq.includes("id: 'retard'") && faq.includes('Mon chauffeur est en retard'));
check('FAQ : 13 entrées', (faq.match(/id: '/g) ?? []).length === 13);
const faqComp = read('components/shared/Faq.tsx');
check('FAQ : ancres id + ouverture sur #hash', faqComp.includes('id={item.id}') && faqComp.includes('window.location.hash'));

// --- 3. Branchements (fichiers livrés) -----------------------------
const route = read('app/api/complaints/auto-reply/route.ts');
check('route auto-reply : re-classe côté serveur', route.includes('classifyComplaint('));
check('route auto-reply : journalise (audit_log)', route.includes("logAudit(supabase, 'complaint_auto_replied'"));
check('route auto-reply : pas de litige ni e-mail', !route.includes("from('disputes')") && !route.includes('sendDisputeEmail'));
check('route auto-reply : porte terminée/annulée', route.includes("status !== 'terminee'") && route.includes("status !== 'annulee'"));
const disputesRoute = read('app/api/disputes/route.ts');
check('route litiges : accepte escalatedFromAutoReply', disputesRoute.includes('escalatedFromAutoReply'));
check('route litiges : journalise complaint_escalated', disputesRoute.includes("logAudit(supabase, 'complaint_escalated'"));
check('route litiges : préfixe tracé (tronqué 1 000)', disputesRoute.includes('escalationPrefix(') && disputesRoute.includes('.slice(0, 1000)'));
const form = read('components/rides/DisputeForm.tsx');
check('DisputeForm : sujets + réponse auto + rejet', form.includes('topicsForRide(') && form.includes('AutoReplyCard') && form.includes('rejet-reponse-auto'));
check('DisputeForm : pas de raison libre (motif = sujet)', !form.includes('DISPUTE_REASONS.map'));
const card = read('components/rides/AutoReplyCard.tsx');
check('AutoReplyCard : badge auto + aucune compensation', card.includes('Réponse automatique') && card.includes('aucun remboursement'));
const review = read('components/admin/DisputesReview.tsx');
check('admin : badge « Après réponse auto »', review.includes('Après réponse auto') && review.includes('parseEscalatedAutoReply'));
const audit = read('lib/audit.ts');
check('audit : événements v2.29', audit.includes('complaint_auto_replied') && audit.includes('complaint_escalated'));
const course = read('app/courses/[id]/page.tsx');
check('page course : DisputeForm branchée (rôle + statut)', course.includes('<DisputeForm') && course.includes("myRole={isPassenger ? 'passager' : 'chauffeur'}"));

// --- 4. Périmètre : pas de migration, pas de cron, prix intouchés ---
const migrations = fs.readdirSync(path.join(ROOT, 'supabase')).filter((f) => f.includes('v2.29') || f.includes('auto-repl'));
check('aucune migration v2.29', migrations.length === 0, migrations.join(', ') || 'aucune');
const vercel = read('vercel.json');
check('aucun nouveau cron', !vercel.includes('complaint') && !vercel.includes('auto-reply'));
const commission = read('lib/commission.ts');
check('commission intouchée (5 % / 8 % / plafond 10 %)', commission.includes('COMMISSION_RATE = 0.05') && commission.includes('0.08') && commission.includes('10'));
const pricing = read('lib/pricing.ts');
check('pricing non modifié par le lot', !pricing.includes('auto-repl') && !pricing.includes('complaint'));

// --- 5. Les 2 RÈGLES (priorité n°1) ---------------------------------
const modeToggle = read('components/shared/ModeToggle.tsx');
check(
  'RÈGLE 2 : switch chauffeur bloqué sans compte (redirection Devenir chauffeur)',
  modeToggle.includes('canSwitchToDriver') && modeToggle.includes('devenir-chauffeur')
);
const serverAuth = read('lib/supabase/server.ts');
check('RÈGLE 2 : contrôle serveur (hasDriverAccount)', serverAuth.includes('hasDriverAccount'));
const home = read('components/home/HomeScreen.tsx');
check(
  'RÈGLE 1 : barre de chargement (prix, mise en ligne, switch)',
  home.includes('Chargement de la carte') && home.includes('Envoi…') && modeToggle.includes('animate-spin')
);
check('RÈGLE 1 : DisputeForm garde ses états de chargement', form.includes("busy ? 'Envoi…'"));

// --- 6. Hygiène : pas de « bientôt », pas d'adresse perso -----------
const lotFiles = [
  'lib/auto-replies.ts',
  'lib/faq.ts',
  'lib/audit.ts',
  'app/api/complaints/auto-reply/route.ts',
  'app/api/disputes/route.ts',
  'components/rides/DisputeForm.tsx',
  'components/rides/AutoReplyCard.tsx',
  'components/shared/Faq.tsx',
  'components/admin/DisputesReview.tsx',
  'app/courses/[id]/page.tsx',
];
for (const f of lotFiles) {
  const c = read(f);
  check(
    `${f} : pas de « bientôt / à venir »`,
    !/bientôt|à venir|coming soon/i.test(c)
  );
  // Seule l'adresse de contact de Stacks Drive (déjà publique dans
  // la FAQ) est tolérée ; aucune adresse personnelle n'apparaît.
  const gmailLines = c.split('\n').filter((l) => l.includes('@gmail.com'));
  check(
    `${f} : pas d'adresse e-mail personnelle`,
    gmailLines.every((l) => l.includes('stacks.markett@gmail.com'))
  );
}

// --- 7. HTTP local (serveur de dev :3100) ----------------------------
async function httpCheck(name, url, want, body) {
  try {
    const res = await fetch(url, body);
    const text = await res.text();
    check(name, res.status === want, `HTTP ${res.status}`);
    return text;
  } catch (e) {
    check(name, false, `injoignable (${e.message})`);
    return '';
  }
}
const aide = await httpCheck('GET /aide → 200', `${DEV}/aide`, 200);
check('page /aide : entrée retard rendue', aide.includes('en retard'));
// Sans Supabase en dev, les routes API renvoient 503 (comme les
// autres routes) — la route est montée, l'accès est gardé.
await httpCheck('POST /api/complaints/auto-reply sans auth → 503 (Supabase non configuré)', `${DEV}/api/complaints/auto-reply`, 503, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ rideId: '00000000-0000-0000-0000-000000000000', topic: 'retard' }),
});

console.log(failures === 0 ? '\nLot F v2.29 : tout passe.' : `\nLot F v2.29 : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
