#!/usr/bin/env node
/** Vérification du lot v2.55 (paiement par carte — Stripe, modèle
 *  simplifié : empreinte, capture, caution, dette, lot quotidien).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v255.mjs
 * Contrôle :
 *  A. Statique (fichiers + greps + calculs) :
 *     1. Fichiers créés (lib Stripe, 10 routes API, 4 composants,
 *        migration, ADR) + fichiers modifiés (voies de paiement,
 *        acceptation, course, accueil, gains, compte, admin, CGU,
 *        SETUP, .env.example, vercel.json).
 *     2. Frais : gross-up vérifié par le calcul (1 500 -> 1 750,
 *        5 000 -> 5 450, frais 250 / 450) — même formule que le
 *        code (taux 5,15 %, fixe 164, arrondi 50).
 *     3. Sécurité : webhook = signature vérifiée (constructEvent
 *        + STRIPE_WEBHOOK_SECRET) ; aucune clé en dur (greps
 *        motifs de clés) ; aucune clé service_role ; RLS sur les
 *        5 nouvelles tables ; 15 fonctions SECURITY DEFINER.
 *     4. Règles produit : lib/commission.ts inchangée (5 % / 8 % /
 *        10 %) ; démarrage bloqué sans empreinte (402) ; capture
 *        après finalize ; void à l'annulation ; 'carte' dans
 *        PAYMENT_METHODS + libellé ; cron quotidien 04:00 UTC
 *        (GET + POST, entrée vercel.json) ; remboursement caution
 *        anti-double-déclencheur (claim atomique + clé
 *        d'idempotence, garde route manuelle).
 *     5. Règle 1 (chargement = S) : les nouveaux composants
 *        utilisent LogoLoader ; règle 2 (switch verrouillé) :
 *        `driver_account_required` toujours présent.
 *     6. Greps : 0 nom personnel ; 0 mention d'IA ; 0 clé secrète ;
 *        0 import lucide-react dans les nouveaux fichiers.
 *  B. DOM Chromium 390×844 (rendus dans
 *     ~/workspace/your_files/rendus-v255/) : planche de démo
 *     (gains carte temps réel, caution, feuille d'empreinte) +
 *     vraie feuille d'empreinte (état « pas encore activé » en dev
 *     sans clés — l'état honnête). Section ignorée si la planche
 *     a été supprimée avant le push (rendus déjà capturés).
 * Les flux réels (empreinte 3DS, capture, webhook, lot) ne sont
 *  PAS vérifiables en dev (pas de clés Stripe en local, Supabase
 *  non configuré) : premier test en live après push + migration
 *  + clés Vercel, avec une vraie carte gabonaise.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RENDUS = path.join(process.env.HOME ?? '', 'workspace/your_files/rendus-v255');

function exePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const cache = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith('chromium-')) continue;
    const p = path.join(cache, dir, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium introuvable.');
}

const failures = [];
const warnings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => {
  failures.push(m);
  console.log(`  ✗ ${m}`);
};
const warn = (m) => {
  warnings.push(m);
  console.log(`  ! ${m}`);
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}
function has(rel, needle) {
  return read(rel).includes(needle);
}

// Motifs de test d'absence construits par concaténation (les
// fragments ne contiennent jamais le motif complet en clair —
// sinon le script lui-même déclencherait le grep).
const NAME_PARTS = [['Ra', 'ndy'], ['Bou', 'lingui'], ['Gilch', 'rist'], ['boulin', 'guiran', 'dy']];
const SECRET_RES = [
  new RegExp('s' + 'k-[A-Za-z0-9]{16,}'),
  new RegExp('s' + 'k_live_[A-Za-z0-9]{8,}'),
  new RegExp('s' + 'k_test_[A-Za-z0-9]{8,}'),
  new RegExp('wh' + 'sec_[A-Za-z0-9]{8,}'),
  new RegExp('r' + 'e_[A-Za-z0-9]{10,}'),
  new RegExp('gh' + 'p_[A-Za-z0-9]{10,}'),
  new RegExp('github_' + 'pat_[A-Za-z0-9]{10,}'),
];
const AI_RES = [/\bIA\b/, /intelligence artificielle/i, /généré par une IA/i, /travail d.?IA/i];

const NEW_FILES = [
  'lib/stripe.ts',
  'lib/card-ledger.ts',
  'app/api/stripe/config/route.ts',
  'app/api/stripe/hold/route.ts',
  'app/api/stripe/webhook/route.ts',
  'app/api/stripe/deposit/route.ts',
  'app/api/stripe/deposit/refund/route.ts',
  'app/api/stripe/debt/route.ts',
  'app/api/driver/leave/route.ts',
  'app/api/driver/card-earnings/route.ts',
  'app/api/admin/daily-batches/route.ts',
  'app/api/cron/daily-payouts/route.ts',
  'components/home/CardHoldSheet.tsx',
  'components/driver/CardEarningsSection.tsx',
  'components/driver/DepositCard.tsx',
  'components/driver/DebtCardPayment.tsx',
  'supabase/migration-v2.55-card-payments.sql',
  'docs/adr/0031-paiement-par-carte-stripe.md',
  'app/admin/paiements-carte/page.tsx',
];

console.log('A. Statique — fichiers');
for (const f of NEW_FILES) {
  if (exists(f)) ok(`existe : ${f}`);
  else fail(`manquant : ${f}`);
}

console.log('A. Frais — gross-up (même formule que lib/stripe.ts)');
function grossUp(net) {
  const raw = (net + 164) / (1 - 0.0515);
  return Math.round(Math.ceil(raw) / 50) * 50;
}
const cases = [
  [1500, 1750, 250],
  [5000, 5450, 450],
  [950, 1200, 250],
  [2000, 2300, 300],
];
for (const [net, charged, fees] of cases) {
  const got = grossUp(net);
  if (got === charged && got - net === fees) ok(`gross-up ${net} -> ${got} (frais ${got - net})`);
  else fail(`gross-up ${net} : attendu ${charged} (frais ${fees}), obtenu ${got}`);
}
if (has('lib/stripe.ts', 'CARD_FEE_RATE = 0.0515') && has('lib/stripe.ts', 'CARD_FEE_FIXED_FCFA = 164')) {
  ok('constantes de frais 5,15 % + 164 FCFA dans lib/stripe.ts');
} else fail('constantes de frais absentes de lib/stripe.ts');

console.log('A. Sécurité');
const webhook = read('app/api/stripe/webhook/route.ts');
if (webhook.includes('constructEvent') && webhook.includes('STRIPE_WEBHOOK_SECRET')) {
  ok('webhook : signature vérifiée (constructEvent + STRIPE_WEBHOOK_SECRET)');
} else fail('webhook : signature NON vérifiée');
if (webhook.includes('payment_intent.amount_capturable_updated') && webhook.includes('payment_intent.succeeded') && webhook.includes('payment_intent.canceled') && webhook.includes('charge.refunded')) {
  ok('webhook : 4 événements traités');
} else fail('webhook : événements manquants');
const migration = read('supabase/migration-v2.55-card-payments.sql');
const tables = ['card_payments', 'card_deposits', 'card_debt_payments', 'daily_payout_batches', 'daily_payout_items'];
for (const t of tables) {
  if (migration.includes(`create table if not exists public.${t}`)) ok(`migration : table ${t}`);
  else fail(`migration : table ${t} manquante`);
}
const rpcs = [
  'record_card_hold', 'confirm_card_hold', 'void_card_hold', 'apply_card_capture',
  'record_card_capture_failed', 'record_card_deposit', 'confirm_card_deposit',
  'claim_deposit_refund', 'record_deposit_refund', 'forfeit_card_deposit',
  'record_card_debt_payment',
  'apply_card_debt_payment', 'list_refundable_deposits',
  'generate_daily_payout_batches', 'mark_daily_batch_paid',
];
for (const r of rpcs) {
  if (migration.includes(`function public.${r}(`)) ok(`migration : RPC ${r}`);
  else fail(`migration : RPC ${r} manquante`);
}
if (migration.includes('enable row level security')) ok('migration : RLS activée');
else fail('migration : RLS absente');
if (migration.includes("method in ('mobile_money', 'especes', 'autre', 'carte')")) ok("migration : méthode 'carte' dans driver_settlements");
else fail("migration : méthode 'carte' absente de driver_settlements");

console.log('A. Règles produit');
const commission = read('lib/commission.ts');
if (commission.includes('0.05') && commission.includes('0.08') && commission.includes('0.1')) ok('lib/commission.ts : 5 % / 8 % / 10 % intacts');
else fail('lib/commission.ts : taux modifiés !');
const ridesRoute = read('app/api/rides/[id]/route.ts');
if (ridesRoute.includes("cardHoldRequired: true") && ridesRoute.includes('402')) ok('démarrage bloqué sans empreinte (402)');
else fail('démarrage : garde empreinte absente');
if (ridesRoute.includes('captureCardRide(id)') && ridesRoute.includes('voidCardHold(id)')) ok('capture à la clôture + void à l’annulation');
else fail('capture / void absents de la route course');
if (has('lib/neighborhoods.ts', "'carte'") && has('lib/neighborhoods.ts', "carte: 'Carte bancaire'")) ok("'carte' dans PAYMENT_METHODS + libellé");
else fail("'carte' absente des moyens de paiement");
const vercel = read('vercel.json');
if (vercel.includes('/api/cron/daily-payouts') && vercel.includes('0 4 * * *')) ok('cron quotidien 04:00 UTC (05:00 Libreville)');
else fail('cron quotidien absent de vercel.json');
const dailyCron = read('app/api/cron/daily-payouts/route.ts');
if (dailyCron.includes('export async function GET') && dailyCron.includes('export async function POST')) ok('cron quotidien : GET (Vercel Cron) + POST (manuel)');
else fail('cron quotidien : GET manquant (Vercel Cron appelle en GET)');
if (migration.includes("'remboursement_en_cours'")) ok("migration : statut 'remboursement_en_cours' (claim anti-double)");
else fail("migration : statut 'remboursement_en_cours' absent");
const ledger = read('lib/card-ledger.ts');
if (ledger.includes('claim_deposit_refund') && ledger.includes('deposit-refund-${driverId}')) ok('caution : claim atomique + clé d’idempotence Stripe');
else fail('caution : claim atomique ou clé d’idempotence absente');
const refundRoute = read('app/api/stripe/deposit/refund/route.ts');
if (refundRoute.includes('driver_left_at')) ok('caution : route manuelle gardée (remboursement après départ seulement)');
else fail('caution : garde route manuelle absente');

console.log('A. Les 2 règles');
const newComponents = [
  'components/home/CardHoldSheet.tsx',
  'components/driver/CardEarningsSection.tsx',
  'components/driver/DepositCard.tsx',
  'components/driver/DebtCardPayment.tsx',
];
for (const f of newComponents) {
  if (read(f).includes('LogoLoader')) ok(`règle 1 (S qui se remplit) : ${f}`);
  else fail(`règle 1 absente : ${f}`);
}
if (read('app/api/profile/route.ts').includes('driver_account_required')) ok('règle 2 (switch verrouillé) : driver_account_required présent');
else fail('règle 2 : driver_account_required absent');

console.log('A. Greps — nom / IA / clés / lucide');
// Le grep « IA » (mot entier) ne porte que sur les fichiers du lot :
// CHANGELOG.md / SETUP.md / docs/adr/README.md contiennent des
// mentions historiques « greps 0 IA » (les rapports de vérification
// des lots précédents), qui ne sont pas des mentions de travail d'IA.
// Même raison pour lucide-react : CHANGELOG.md cite « 0 import
// lucide-react » dans les bilans des lots précédents — le test
// lucide ne porte donc que sur les fichiers du lot, pas sur les docs
// d'historique.
const AI_SCAN_FILES = [...NEW_FILES, 'lib/neighborhoods.ts', 'lib/supabase/server.ts', 'components/home/HomeScreen.tsx', 'components/driver/DriverEarnings.tsx', 'app/compte/page.tsx', 'app/cgu/page.tsx', 'app/admin/page.tsx', 'app/api/proposals/[id]/route.ts', 'app/api/rides/[id]/route.ts'];
const SCAN_FILES = [...AI_SCAN_FILES, 'SETUP.md', '.env.example', 'vercel.json', 'CHANGELOG.md', 'docs/adr/README.md'];
for (const f of SCAN_FILES) {
  if (!exists(f)) continue;
  const content = read(f);
  for (const parts of NAME_PARTS) {
    const name = parts.join('');
    if (content.toLowerCase().includes(name.toLowerCase())) fail(`nom personnel dans ${f}`);
  }
  for (const re of SECRET_RES) {
    if (re.test(content)) fail(`motif de clé secrète dans ${f} (${re})`);
  }
}
for (const f of AI_SCAN_FILES) {
  if (!exists(f)) continue;
  const content = read(f);
  if (content.includes('lucide-react')) fail(`import lucide-react dans ${f}`);
  for (const re of AI_RES) {
    if (re.test(content)) fail(`mention d’IA dans ${f} (${re})`);
  }
}
ok('greps terminés (voir échecs ci-dessus le cas échéant)');

console.log('A. Dépendances');
const pkg = JSON.parse(read('package.json'));
if (pkg.dependencies?.stripe && pkg.dependencies?.['@stripe/stripe-js'] && pkg.dependencies?.['@stripe/react-stripe-js']) {
  ok(`stripe ${pkg.dependencies.stripe} + @stripe/stripe-js ${pkg.dependencies['@stripe/stripe-js']} + @stripe/react-stripe-js ${pkg.dependencies['@stripe/react-stripe-js']}`);
} else fail('dépendances Stripe manquantes dans package.json');

// ---------- B. DOM ----------
// La planche est une page temporaire : elle est supprimée avant le
// push (précédent v2.52). Si elle n'existe plus, la section DOM est
// ignorée — les rendus ont déjà été capturés.
if (!exists('app/planche-v255/page.tsx')) {
  warn('planche v2.55 supprimée avant push — section DOM ignorée (rendus déjà capturés)');
} else {
console.log('B. DOM — planche v2.55 (390×844)');
fs.mkdirSync(RENDUS, { recursive: true });
const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.goto(`${BASE_URL}/planche-v255`, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
const bodyText = await page.evaluate(() => document.body.innerText);
// Le texte rendu est en CSS uppercase sur certains titres :
// comparaison insensible à la casse pour ces libellés.
const bodyLower = bodyText.toLowerCase();
const checks = [
  ['Gains carte — en temps réel', bodyLower.includes('gains carte')],
  ['À verser demain matin', bodyLower.includes('à verser demain matin')],
  ['Encaissé par carte', bodyText.includes('Encaissé par carte')],
  ['Course offerte — payée par la plateforme', bodyText.includes('Course offerte')],
  ['Lot du 15 nov.', bodyText.includes('Lot du 15 nov.')],
  ['Caution — payer par carte', bodyText.includes('Payer ma caution par carte')],
  ['Rembourser par carte', bodyText.includes('Rembourser par carte')],
  ['Feuille empreinte — total autorisé', bodyText.includes('Total autorisé')],
  ['Feuille empreinte — rien débité', bodyText.includes('Rien n’est débité maintenant')],
  ['Feuille empreinte — 3DS', bodyText.includes('3-D Secure')],
];
for (const [label, present] of checks) {
  if (present) ok(`planche : ${label}`);
  else fail(`planche : ${label} absent`);
}
await page.screenshot({ path: path.join(RENDUS, 'v255-planche-gains.png'), fullPage: false });
// Descendre : caution
await page.evaluate(() => window.scrollTo(0, 1100));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(RENDUS, 'v255-planche-caution.png') });
// Descendre : feuille d'empreinte
await page.evaluate(() => window.scrollTo(0, 2200));
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(RENDUS, 'v255-planche-empreinte.png') });
// Vraie feuille d'empreinte (état honnête sans clés en dev)
await page.evaluate(() => window.scrollTo(0, 2200));
const authorizeBtn = page.locator('text=Autoriser 1 750 FCFA').first();
if (await authorizeBtn.count()) {
  await authorizeBtn.click();
  await page.waitForTimeout(1500);
  const sheetText = await page.evaluate(() => document.body.innerText);
  if (sheetText.includes('pas encore activé')) ok('vraie feuille : état honnête « pas encore activé » sans clés');
  else warn('vraie feuille : message inattendu (ni erreur claire ni formulaire)');
  await page.screenshot({ path: path.join(RENDUS, 'v255-feuille-reelle-sans-cles.png') });
} else {
  warn('bouton « Autoriser » non trouvé pour ouvrir la vraie feuille');
}
const jsErrors = errors.filter((e) => !e.includes('Failed to load resource') && !e.includes('net::'));
if (jsErrors.length === 0) ok('aucune erreur JS sur la planche');
else fail(`erreurs JS sur la planche : ${jsErrors.slice(0, 3).join(' | ')}`);
await browser.close();
}

console.log(`\nRésultat : ${failures.length} échec(s), ${warnings.length} avertissement(s).`);
if (failures.length > 0) {
  console.log('Échecs :');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
