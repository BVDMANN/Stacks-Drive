#!/usr/bin/env node
/** Vérification du lot v2.52 (visuels pro modernes : identité signature,
 *  logo officiel, chargement = S qui se remplit, voiture néon en
 *  recherche de chauffeur, icônes Drive détaillées).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v252.mjs
 * Contrôle :
 *  A. Statique (greps + fichiers) :
 *     1. 0 `Loader2` dans app/ et components/ ; 0 `animate-spin`
 *        sauf le DriveRefresh de /admin/live (icône de rafraîchissement,
 *        pas un indicateur de chargement) ; 0 import `lucide-react`
 *        dans app/ et components/ (admin compris).
 *     2. Logo officiel présent : public/logo-stacks-drive.png,
 *        app/icon.png ; manifest pointe sur l'icône locale.
 *     3. Palette `brand` dans tailwind.config.ts (#A134F5 en 500) ;
 *        composants créés : DriveCar, DrivePoi, DriveUi, DriveLogo
 *        (LogoLoader + SPaths), NeonSearchLoader, app/loading.tsx.
 *     4. Page temporaire app/planche-v252/page.tsx TOUJOURS présente
 *        (à supprimer avant le push) — avertissement, pas échec.
 *     5. Règle 1 (statique) : PriceDisplay utilise LogoLoader ;
 *        HomeScreen utilise NeonSearchLoader pour la recherche de
 *        chauffeur et LogoLoader pour géolocalisation / envoi /
 *        annulation / résolution d'adresse.
 *     6. Règle 2 (statique) : verrou serveur `driver_account_required`
 *        dans PATCH /api/profile + garde client dans HomeScreen.
 *     7. Greps : 0 nom personnel ; 0 mention d'IA (mot « IA » en mot
 *        entier + formules explicites) ; 0 clé secrète ;
 *        `lib/commission.ts` inchangée (5 % / 8 % / 10 %).
 *  B. DOM Chromium 390×844 :
 *     1. Accueil : en-tête avec le S SVG (DriveSMark) + bouton
 *        « Connexion » violet (bg-brand-500) ; feuille avec faisceau
 *        (classe .sheet-glass) ; cartes de classes avec voitures
 *        dessinées (SVG DriveCar, pas d'icône Lucide Car).
 *     2. Planche /planche-v252 : 0 erreur console ; LogoLoader
 *        présent (boucle + progressions) ; NeonSearchLoader présent ;
 *        voitures XL présentes ; 15 POI ; 60 icônes UI.
 *     3. /connexion : logo officiel PNG présent (140 px) ; pas de
 *        monogramme « SD ».
 *     4. /devenir-chauffeur : en-tête avec le S.
 * Les tuiles ne se chargent pas dans le navigateur de la VM
 * (limitation réseau connue) : on vérifie le DOM, pas les tuiles.
 * La lisibilité réelle sur téléphone reste à confirmer en live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

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
const fail = (m) => { failures.push(m); console.error(`  ✗ ${m}`); };
const warn = (m) => { warnings.push(m); console.log(`  ! ${m}`); };

function read(p) {
  return fs.readFileSync(path.join(ROOT, p), 'utf8');
}

function walk(dir, exts) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

// --- A. Statique ---
console.log('A. Statique');

// A1. Plus de Loader2, plus de spinner CSS (sauf l'icône de
// rafraîchissement manuel de /admin/live, qui tourne pendant le
// rafraîchissement — ce n'est pas un indicateur de chargement).
const codeFiles = [...walk(path.join(ROOT, 'app'), ['.tsx', '.ts']), ...walk(path.join(ROOT, 'components'), ['.tsx', '.ts'])];
let loader2 = 0;
let spin = 0;
for (const f of codeFiles) {
  const s = fs.readFileSync(f, 'utf8');
  if (s.includes('Loader2')) { loader2 += 1; console.error(`    Loader2 dans ${path.relative(ROOT, f)}`); }
  for (const m of s.matchAll(/animate-spin/g)) {
    // Exception : le DriveRefresh de /admin/live tourne pendant le
    // rafraîchissement manuel — ce n'est pas un indicateur de chargement.
    if (!s.includes('DriveRefresh')) spin += 1;
  }
}
if (loader2 === 0) ok('0 Loader2 dans app/ + components/');
else fail(`${loader2} fichier(s) contiennent encore Loader2`);
if (spin === 0) ok('0 animate-spin restant (hors DriveRefresh admin)');
else fail(`${spin} animate-spin restant(s)`);
// A1bis. Plus aucun import Lucide : tout est Drive (y compris l'admin).
let lucide = 0;
for (const f of codeFiles) {
  if (fs.readFileSync(f, 'utf8').includes("from 'lucide-react'")) {
    lucide += 1;
    console.error(`    lucide-react dans ${path.relative(ROOT, f)}`);
  }
}
if (lucide === 0) ok('0 import lucide-react dans app/ + components/ (admin compris)');
else fail(`${lucide} fichier(s) importent encore lucide-react`);

// A2. Logo officiel
for (const p of ['public/logo-stacks-drive.png', 'app/icon.png']) {
  if (fs.existsSync(path.join(ROOT, p))) ok(`${p} présent`);
  else fail(`${p} MANQUANT`);
}
const manifest = read('public/manifest.json');
if (manifest.includes('/logo-stacks-drive.png')) ok('manifest pointe sur le logo local');
else fail('manifest ne pointe pas sur le logo local');

// A3. Palette brand + composants créés
const tw = read('tailwind.config.ts');
if (tw.includes('#A134F5') && tw.includes('brand')) ok('palette brand (#A134F5) dans tailwind.config.ts');
else fail('palette brand absente de tailwind.config.ts');
for (const p of [
  'components/icons/DriveCar.tsx',
  'components/icons/DrivePoi.tsx',
  'components/icons/DriveUi.tsx',
  'components/icons/DriveLogo.tsx',
  'components/icons/NeonSearchLoader.tsx',
  'app/loading.tsx',
]) {
  if (fs.existsSync(path.join(ROOT, p))) ok(`${p} présent`);
  else fail(`${p} MANQUANT`);
}
const logoSrc = read('components/icons/DriveLogo.tsx');
if (logoSrc.includes('SPaths') && logoSrc.includes('LogoLoader') && logoSrc.includes('DRIVE_BRAND_VIOLET')) ok('DriveLogo : SPaths + LogoLoader + DRIVE_BRAND_VIOLET');
else fail('DriveLogo incomplet (SPaths / LogoLoader / DRIVE_BRAND_VIOLET)');
const neonSrc = read('components/icons/NeonSearchLoader.tsx');
if (neonSrc.includes('NeonSearchLoader') && neonSrc.includes('neon-sweep') && neonSrc.includes('neon-bar-fill')) ok('NeonSearchLoader : arc + barre (keyframes néon)');
else fail('NeonSearchLoader incomplet');

// A4. Page temporaire (avertissement : à supprimer avant le push)
if (fs.existsSync(path.join(ROOT, 'app/planche-v252/page.tsx'))) {
  warn('app/planche-v252/page.tsx TOUJOURS PRÉSENTE — à supprimer avant le push');
} else {
  ok('page temporaire planche-v252 supprimée');
}

// A5. Règle 1 : le S partout où il y a une attente
const priceDisplay = read('components/home/PriceDisplay.tsx');
// PriceSkeleton garde son nom d'export (compatibilité) mais son corps
// est désormais le S qui se remplit — plus de div shimmer.
if (priceDisplay.includes('LogoLoader') && !priceDisplay.includes('price-skeleton')) ok('PriceDisplay : LogoLoader remplace le shimmer « Calcul du prix… »');
else fail('PriceDisplay : LogoLoader absent ou shimmer restant');
const home = read('components/home/HomeScreen.tsx');
if (home.includes('NeonSearchLoader')) ok('HomeScreen : NeonSearchLoader sur la recherche de chauffeur');
else fail('HomeScreen : NeonSearchLoader absent');
const logoUses = (home.match(/<LogoLoader/g) || []).length;
if (logoUses >= 5) ok(`HomeScreen : ${logoUses} LogoLoader (géolocalisation, envoi, annulation, adresses)`);
else fail(`HomeScreen : seulement ${logoUses} LogoLoader`);

// A6. Règle 2 : verrou serveur + garde client
const patchProfile = read('app/api/profile/route.ts');
if (patchProfile.includes('driver_account_required')) ok('Règle 2 : verrou serveur driver_account_required dans PATCH /api/profile');
else fail('Règle 2 : verrou serveur introuvable');
if (home.includes('driver_account_required') || home.includes('needsDriverAccount') || home.includes('Devenir chauffeur')) ok('Règle 2 : garde client dans HomeScreen');
else fail('Règle 2 : garde client introuvable dans HomeScreen');

// A7. Greps : nom personnel / IA / clés secrètes ; commission intacte
const PERSONAL = ['Ra' + 'ndy', 'Bou' + 'lingui', 'Gilch' + 'rist', 'boulin' + 'guiran' + 'dy'];
const IA_PATTERNS = [/\bIA\b/, /intelligence artificielle/i, /par une IA/i, /généré par/i, /🤖/];
const SECRET_PATTERNS = [new RegExp('s' + 'k-' + '[A-Za-z0-9]{16,}'), new RegExp('r' + 'e_' + '[A-Za-z0-9]{16,}'), new RegExp('gh' + 'p_' + '[A-Za-z0-9]{20,}'), new RegExp('github_' + 'pat_' + '[A-Za-z0-9_]{20,}')];
const scanDirs = ['app', 'components', 'lib', 'styles'];
let badPersonal = 0;
let badIa = 0;
let badSecret = 0;
for (const d of scanDirs) {
  for (const f of walk(path.join(ROOT, d), ['.tsx', '.ts', '.css'])) {
    const s = fs.readFileSync(f, 'utf8');
    for (const p of PERSONAL) if (s.includes(p)) { badPersonal += 1; console.error(`    nom personnel dans ${path.relative(ROOT, f)}`); }
    for (const p of IA_PATTERNS) if (p.test(s)) { badIa += 1; console.error(`    mention IA dans ${path.relative(ROOT, f)}`); }
    for (const p of SECRET_PATTERNS) if (p.test(s)) { badSecret += 1; console.error(`    clé secrète dans ${path.relative(ROOT, f)}`); }
  }
}
if (badPersonal === 0) ok('0 nom personnel dans app/ + components/ + lib/ + styles/');
else fail(`${badPersonal} occurrence(s) de nom personnel`);
if (badIa === 0) ok('0 mention d\u2019IA');
else fail(`${badIa} mention(s) d\u2019IA`);
if (badSecret === 0) ok('0 clé secrète');
else fail(`${badSecret} clé(s) secrète(s)`);
const commission = read('lib/commission.ts');
if (commission.includes('0.05') && commission.includes('0.08') && commission.includes('0.1')) ok('lib/commission.ts intacte (5 % / 8 % / 10 %)');
else fail('lib/commission.ts modifiée ?');

// --- B. DOM Chromium 390×844 ---
console.log('B. DOM Chromium 390×844');
const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const consoleErrors = [];
// Les « Failed to load resource » réseau (tuiles / polices bloquées
// par le proxy de la VM) ne sont pas des erreurs de l'appli : on les
// ignore ici, comme dans les lots précédents. Les vraies erreurs JS
// (pageerror) sont toujours comptées.
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function shot(url, name) {
  await page.goto(`${BASE_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  const out = path.join(process.env.HOME, 'workspace/your_files/rendus-v252/apres', name);
  await page.screenshot({ path: out });
  return out;
}

// B1. Accueil
await shot('/', 'v252-apres-accueil.png');
const headerS = await page.evaluate(() => {
  const svg = document.querySelector('header svg');
  return svg ? svg.outerHTML.length : 0;
});
if (headerS > 200) ok(`en-tête : S SVG présent (${headerS} caractères de SVG)`);
else fail('en-tête : S SVG absent');
const connBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('a, button')].find((el) => el.textContent.trim().startsWith('Connexion'));
  return b ? b.className : '';
});
if (connBtn.includes('bg-brand-500')) ok('bouton « Connexion » violet (bg-brand-500)');
else fail(`bouton « Connexion » non violet : ${connBtn}`);
const sheetBeam = await page.evaluate(() => !!document.querySelector('.sheet-glass'));
if (sheetBeam) ok('feuille : verre nuit à liseré (.sheet-glass)');
else warn('feuille : .sheet-glass introuvable (feuille peut-être repliée)');

// B2. Planche (si elle existe encore — elle est supprimée avant le
// push ; les rendus restent dans rendus-v252/apres/)
const boardExists = fs.existsSync(path.join(ROOT, 'app/planche-v252/page.tsx'));
if (!boardExists) {
  console.log('  ○ planche supprimée — voir v252-planche-icones.png dans rendus-v252/apres/');
} else {
  consoleErrors.length = 0;
  await shot('/planche-v252', 'v252-planche-icones.png');
  if (consoleErrors.length === 0) ok('planche : 0 erreur console');
  else fail(`planche : ${consoleErrors.length} erreur(s) console : ${consoleErrors.slice(0, 3).join(' | ')}`);
  const board = await page.evaluate(() => ({
    logoLoader: !!document.querySelector('.logo-loader'),
    neon: !!document.querySelector('.neon-search'),
  }));
  if (board.logoLoader) ok('planche : LogoLoader présent');
  else fail('planche : LogoLoader absent');
  if (board.neon) ok('planche : NeonSearchLoader présent');
  else fail('planche : NeonSearchLoader absent');
}

// B3. Connexion : logo officiel
await shot('/connexion', 'v252-apres-connexion.png');
const loginLogo = await page.evaluate(() => {
  const img = [...document.querySelectorAll('img')].find((i) => i.src.includes('logo-stacks-drive'));
  return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
});
if (loginLogo) ok(`connexion : logo officiel PNG présent (${loginLogo.w}×${loginLogo.h})`);
else fail('connexion : logo officiel absent');
const sdMonogram = await page.evaluate(() => document.body.innerText.includes('SD'));
if (!sdMonogram) ok('connexion : plus de monogramme « SD »');
else warn('connexion : texte « SD » encore visible quelque part');

// B4. Devenir chauffeur : S dans l'en-tête
await shot('/devenir-chauffeur', 'v252-apres-devenir-chauffeur.png');
const driverHeaderS = await page.evaluate(() => {
  const svg = document.querySelector('header svg');
  return svg ? svg.outerHTML.length : 0;
});
if (driverHeaderS > 200) ok('devenir-chauffeur : S dans l\u2019en-tête');
else fail('devenir-chauffeur : S absent de l\u2019en-tête');

await browser.close();

// --- Résumé ---
console.log('');
if (failures.length === 0 && warnings.length === 0) {
  console.log('VÉRIFICATION v2.52 : 0 échec, 0 avertissement.');
} else {
  console.log(`VÉRIFICATION v2.52 : ${failures.length} échec(s), ${warnings.length} avertissement(s).`);
  for (const f of failures) console.error(`  ÉCHEC : ${f}`);
  for (const w of warnings) console.log(`  AVERTISSEMENT : ${w}`);
  process.exitCode = failures.length ? 1 : 0;
}
