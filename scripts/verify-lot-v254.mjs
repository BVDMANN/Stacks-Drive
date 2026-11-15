#!/usr/bin/env node
/** Vérification du lot v2.54 (préciser la destination aussi visiblement
 *  que le départ + commande pour quelqu'un d'autre : les deux épingles
 *  libres, sans lien avec la position GPS de celui qui commande).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v254.mjs
 * Contrôle :
 *  A. Statique (greps + fichiers) :
 *     1. Bouton « Préciser » destination DANS l'en-tête de la carte
 *        (à côté de « Plus tard », même style que le départ) ;
 *        ancien bouton « Préciser sur la carte » sous la recherche :
 *        0 occurrence. `openAdjust('destination')` appelé 2 fois
 *        (en-tête + lien de la bannière), comme `openAdjust('pickup')`
 *        (champ + lien de la bannière GPS) — une seule action par côté.
 *     2. Bannière ambre quand la destination est approximative
 *        (source 'neighborhood') : « Adresse approximative — c'est le
 *        centre du quartier… » + lien « Préciser » ; elle disparaît
 *        quand le point devient exact.
 *     3. Annuler / hors zone : `restoreAdjustStart()` restaure le
 *        point, le NOM du quartier, la source d'origine, l'adresse
 *        du lieu et la demande de piste — un centre de quartier annulé
 *        ne devient pas un point « épingle ».
 *     4. Chaîne chauffeur (vérifiée, pas reconstruite) : HomeScreen
 *        envoie `destinationPoint` ; `POST /api/rides` le valide
 *        (zone) et estime dessus ; `/courses/[id]` affiche
 *        `destinationPoint.address`.
 *     5. Commande pour quelqu'un d'autre (statique) : géolocalisation
 *        silencieuse UNE fois au chargement + choix manuel protégé
 *        (`manualPickupRef`) ; l'effet de phase ne touche que la
 *        hauteur de la feuille (aucun reset du départ/destination) ;
 *        `POST /api/rides` ne connaît pas la position GPS du
 *        commandeur (0 mention) ; le bouton Commander n'exige que
 *        trajet valide + estimation.
 *     6. Règle 1 (statique) : PriceDisplay utilise LogoLoader ;
 *        HomeScreen utilise NeonSearchLoader + LogoLoader.
 *     7. Règle 2 (statique) : verrou serveur
 *        `driver_account_required` dans PATCH /api/profile + garde
 *        client dans HomeScreen.
 *     8. Greps : 0 nom personnel ; 0 mention d'IA ; 0 clé secrète ;
 *        `lib/commission.ts` inchangée (5 % / 8 % / 10 %) ; aucune
 *        nouvelle dépendance dans package.json.
 *     9. Docs : ADR 0030 + ligne dans docs/adr/README.md + entrée
 *        v2.54 dans CHANGELOG.md.
 *  B. DOM Chromium 390×844, GPS simulé à l'Aéroport (rendus dans
 *     ~/workspace/your_files/rendus-v254/) :
 *     1. Départ par défaut = GPS (Aéroport Léon-Mba).
 *     2. Départ déplacé via la liste (Nzeng-Ayong) : stable après 4 s
 *        (aucun retour GPS).
 *     3. Destination Glass : bouton « Préciser » (en-tête) VISIBLE
 *        aux crans 58 et 88 sans scroller, bannière ambre VISIBLE au
 *        cran 58 sans scroller ; au cran 30, le bouton est à 51 px
 *        sous le pli (mesuré — l'ancien était à 452 px ; le bouton
 *        départ lui-même est à moitié masqué par la navigation basse
 *        au cran 30, qui n'est pas une hauteur de travail).
 *     4. Flux épingle destination : ouverture → déplacement de la
 *        carte (~3 km, Glass → Acaé) → estimation recalculée
 *        (prix 1 600 → 1 800 FCFA, distance 9,5 → 11,2 km) ;
 *        Annuler → retour au prix d'avant ET bannière de retour
 *        (source 'neighborhood' restaurée, quartier Glass restauré) ;
 *        rouvrir → déplacer → Confirmer → prix déplacé conservé,
 *        bannière disparue, récap sur Acaé.
 *     5. Flux épingle départ : déplacement → confirmation → le départ
 *        reste où il a été posé (aucun retour GPS après 3 s).
 *     6. Commander loin du GPS : bouton « Se connecter pour
 *        commander » présent et ACTIF (non désactivé) avec les deux
 *        épingles loin de la position GPS ; aucun message exigeant
 *        d'être au point de départ.
 *  Les tuiles ne se chargent pas dans le navigateur de la VM
 * (limitation réseau connue) : on vérifie le DOM (positions,
 * estimations serveur, libellés), pas les tuiles. La lisibilité
 * réelle sur téléphone reste à confirmer en live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RENDUS = path.join(process.env.HOME ?? '', 'workspace/your_files/rendus-v254');

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
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function walk(dir, exts) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}
function count(src, sub) {
  return src.split(sub).length - 1;
}

const failures = [];
const warnings = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { failures.push(m); console.error(`  ✗ ${m}`); };
const warn = (m) => { warnings.push(m); console.log(`  ! ${m}`); };

// --- A. Statique ---
console.log('A. Statique');
const home = read('components/home/HomeScreen.tsx');

// A1. Bouton destination en en-tête, ancien bouton supprimé.
if (!home.includes('Préciser sur la carte')) ok('ancien bouton « Préciser sur la carte » supprimé (0 occurrence)');
else fail('ancien bouton « Préciser sur la carte » encore présent');
const destAdjustCalls = count(home, "openAdjust('destination')");
if (destAdjustCalls === 2) ok(`openAdjust('destination') appelé 2 fois (en-tête + lien bannière)`);
else fail(`openAdjust('destination') appelé ${destAdjustCalls} fois (attendu 2)`);
const pickupAdjustCalls = count(home, "openAdjust('pickup')");
if (pickupAdjustCalls === 2) ok(`openAdjust('pickup') appelé 2 fois (champ + lien bannière GPS) — parité des deux côtés`);
else fail(`openAdjust('pickup') appelé ${pickupAdjustCalls} fois (attendu 2)`);
if (home.includes('v2.54 — « Préciser » à côté du champ, comme le')) ok('bouton destination documenté en en-tête (commentaire v2.54)');
else fail('commentaire v2.54 de l’en-tête destination absent');
// Le bouton d'en-tête est bien dans la carte destination (avant le
// champ de recherche) : la première occurrence de
// openAdjust('destination') précède <DestinationSearch (le lien de
// la bannière est après).
const searchIdx = home.indexOf('<DestinationSearch');
const firstDestCall = home.indexOf("openAdjust('destination')");
if (firstDestCall > 0 && firstDestCall < searchIdx) ok('bouton Préciser destination situé avant le champ de recherche (en-tête de la carte)');
else fail('bouton Préciser destination mal placé (hors en-tête de la carte destination)');

// A2. Bannière ambre adresse approximative.
if (home.includes("destPointSource === 'neighborhood'") && home.includes('Adresse approximative — c’est le centre du quartier')) ok('bannière ambre « Adresse approximative — centre du quartier » (source neighborhood)');
else fail('bannière ambre destination absente ou mal conditionnée');
if (home.includes('bg-amber-500/10 border border-amber-500/30')) ok('bannière ambre : mêmes classes que la bannière GPS imprécis côté départ');
else fail('bannière ambre : classes différentes de la bannière départ');

// A3. Annuler / hors zone restaure le point d'avant, source comprise.
if (home.includes('function restoreAdjustStart()')) ok('restoreAdjustStart() présente');
else fail('restoreAdjustStart() absente');
if (home.includes('setDestPointSource(start.source)') && home.includes('setPickupPointSource(start.source)')) ok('Annuler restaure la source d’origine (pas de « pin » forcé)');
else fail('Annuler ne restaure pas la source d’origine');
if (home.includes('setDestination(start.neighborhood)') && home.includes('setPickup(start.neighborhood)')) ok('Annuler restaure le NOM du quartier d’avant (pas seulement les coordonnées)');
else fail('Annuler ne restaure pas le quartier d’avant');
if (home.includes('setDestAddress(start.address)') && home.includes('setUnpavedRoad(start.unpavedRoad)')) ok('Annuler restaure l’adresse du lieu et la demande de piste');
else fail('Annuler ne restaure pas adresse / piste');
const cancelBody = home.slice(home.indexOf('function cancelAdjust()'), home.indexOf('function cancelAdjust()') + 200);
if (cancelBody.includes('restoreAdjustStart()')) ok('cancelAdjust() délègue à restoreAdjustStart()');
else fail('cancelAdjust() ne restaure pas via restoreAdjustStart()');
const confirmBody = home.slice(home.indexOf('function confirmAdjust()'), home.indexOf('function confirmAdjust()') + 900);
if (confirmBody.includes('restoreAdjustStart()')) ok('confirmAdjust() hors zone restaure aussi via restoreAdjustStart()');
else fail('confirmAdjust() hors zone ne restaure pas');
if (count(home, "setDestPointSource('pin')") === 1) ok('un seul setDestPointSource(\'pin\') : le glisser de la carte (jamais l’annulation)');
else fail(`setDestPointSource('pin') × ${count(home, "setDestPointSource('pin')")} (attendu 1 : le glisser)`);

// A4. Chaîne chauffeur (vérifiée, pas reconstruite).
if (home.includes('destinationPoint:') && home.includes("destPointSource !== 'neighborhood'")) ok('HomeScreen envoie destinationPoint (quand le point est exact)');
else fail('HomeScreen n’envoie pas destinationPoint');
const ridesRoute = read('app/api/rides/route.ts');
if (ridesRoute.includes('destinationPoint') && ridesRoute.includes('isInServiceArea')) ok('POST /api/rides : destinationPoint validé (zone) + estimation dessus');
else fail('POST /api/rides : destinationPoint non validé');
const coursePage = read('app/courses/[id]/page.tsx');
if (coursePage.includes('ride.destinationPoint?.address')) ok('/courses/[id] affiche destinationPoint.address côté chauffeur');
else fail('/courses/[id] n’affiche pas l’adresse exacte de destination');

// A5. Commande pour quelqu'un d'autre (statique).
if (home.includes('getUserPosition(5000)') && home.includes('if (!manualPickupRef.current)')) ok('géolocalisation silencieuse une fois au chargement, choix manuel protégé (manualPickupRef)');
else fail('géolocalisation au chargement / garde manualPickupRef absentes');
const phaseEffect = home.slice(home.indexOf("if (phase !== 'idle') setSheetH(58);") - 60, home.indexOf("if (phase !== 'idle') setSheetH(58);") + 120);
if (phaseEffect.includes('setSheetH(58)') && !phaseEffect.includes('setPickup(') && !phaseEffect.includes('setDestination(')) ok('effet de phase : seule la hauteur de la feuille change (aucun reset départ/destination)');
else fail('effet de phase : reset du trajet suspect');
if (!ridesRoute.includes('userLocation') && !ridesRoute.includes('getCurrentPosition') && !ridesRoute.includes('geolocation')) ok('POST /api/rides : 0 mention de la position GPS du commandeur (aucune exigence de proximité)');
else fail('POST /api/rides : référence à la position GPS du commandeur');
if (home.includes('disabled={!validTrip || !estimate || busy || isChauffeurMode}')) ok('Commander : seules conditions = trajet valide + estimation (pas de présence au départ)');
else fail('condition disabled du bouton Commander incorrecte');

// A6. Règle 1 : le S partout où il y a une attente.
const priceDisplay = read('components/home/PriceDisplay.tsx');
if (priceDisplay.includes('LogoLoader')) ok('PriceDisplay : LogoLoader');
else fail('PriceDisplay : LogoLoader absent');
if (home.includes('NeonSearchLoader')) ok('HomeScreen : NeonSearchLoader sur la recherche de chauffeur');
else fail('HomeScreen : NeonSearchLoader absent');
const logoUses = (home.match(/<LogoLoader/g) || []).length;
if (logoUses >= 5) ok(`HomeScreen : ${logoUses} LogoLoader`);
else fail(`HomeScreen : seulement ${logoUses} LogoLoader`);

// A7. Règle 2 : verrou serveur + garde client.
const patchProfile = read('app/api/profile/route.ts');
if (patchProfile.includes('driver_account_required')) ok('Règle 2 : verrou serveur driver_account_required dans PATCH /api/profile');
else fail('Règle 2 : verrou serveur introuvable');
if (home.includes('driver_account_required') || home.includes('needsDriverAccount') || home.includes('Devenir chauffeur')) ok('Règle 2 : garde client dans HomeScreen');
else fail('Règle 2 : garde client introuvable dans HomeScreen');

// A8. Greps : nom personnel / IA / clés secrètes ; commission intacte ; dépendances.
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
if (badIa === 0) ok('0 mention d’IA');
else fail(`${badIa} mention(s) d’IA`);
if (badSecret === 0) ok('0 clé secrète');
else fail(`${badSecret} clé(s) secrète(s)`);
const commission = read('lib/commission.ts');
if (commission.includes('0.05') && commission.includes('0.08') && commission.includes('0.1')) ok('lib/commission.ts intacte (5 % / 8 % / 10 %)');
else fail('lib/commission.ts modifiée ?');
const pkg = JSON.parse(read('package.json'));
const expectedDeps = ['@supabase/ssr', '@supabase/supabase-js', 'clsx', 'framer-motion', 'leaflet', 'lucide-react', 'next', 'react', 'react-dom', 'resend', 'tailwind-merge', 'tesseract.js', 'zod'];
const expectedDevDeps = ['@types/leaflet', '@types/node', '@types/react', '@types/react-dom', 'playwright-core', 'postcss', 'tailwindcss', 'typescript'];
const depNames = Object.keys(pkg.dependencies ?? {}).sort();
const devDepNames = Object.keys(pkg.devDependencies ?? {}).sort();
if (JSON.stringify(depNames) === JSON.stringify(expectedDeps) && JSON.stringify(devDepNames) === JSON.stringify(expectedDevDeps)) ok('aucune nouvelle dépendance (deps + devDeps inchangées)');
else fail(`dépendances modifiées : deps=${depNames.join(',')} devDeps=${devDepNames.join(',')}`);

// A9. Docs.
if (fs.existsSync(path.join(ROOT, 'docs/adr/0030-preciser-destination-visible.md'))) ok('ADR 0030 présente');
else fail('ADR 0030 absente');
const adrReadme = read('docs/adr/README.md');
if (adrReadme.includes('[0030](0030-preciser-destination-visible.md)')) ok('docs/adr/README.md : ligne 0030');
else fail('docs/adr/README.md : ligne 0030 absente');
const changelog = read('CHANGELOG.md');
if (changelog.includes('## v2.54')) ok('CHANGELOG.md : entrée v2.54');
else fail('CHANGELOG.md : entrée v2.54 absente');

// --- B. DOM Chromium 390×844, GPS simulé à l'Aéroport ---
console.log('B. DOM Chromium 390×844 (GPS simulé : Aéroport Léon-Mba)');
fs.mkdirSync(RENDUS, { recursive: true });
const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  geolocation: { latitude: 0.458, longitude: 9.412 },
  permissions: ['geolocation'],
});
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));
async function shot(name) {
  await page.screenshot({ path: path.join(RENDUS, name) });
}
async function sheetHdvh() {
  return page.evaluate(() => {
    const el = document.querySelector('.sheet-glass')?.parentElement;
    return el ? Math.round((el.getBoundingClientRect().height / window.innerHeight) * 100) : null;
  });
}
async function setSnap(target) {
  for (let i = 0; i < 6; i++) {
    if ((await sheetHdvh()) === target) return true;
    await page.locator('.sheet-handle').click().catch(async () => {
      await page.evaluate(() => {
        document.querySelector('.sheet-handle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });
    await page.waitForTimeout(900);
  }
  return (await sheetHdvh()) === target;
}
async function measureDest() {
  // Remise à zéro du défilement de la feuille : les clics Playwright
  // (scroll-into-view) font défiler la feuille, un doigt réel qui
  // tape un résultat visible ne la fait pas défiler — la mesure porte
  // sur l'état « feuille non défilée », celui du propriétaire à l'ouverture.
  await page.evaluate(() => {
    const sc = document.querySelector('.sheet-glass');
    if (sc) sc.scrollTop = 0;
  });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const sheet = document.querySelector('.sheet-glass')?.parentElement;
    const sheetTop = sheet ? Math.round(sheet.getBoundingClientRect().top) : null;
    const label = [...document.querySelectorAll('p')].find((p) => p.textContent?.trim() === 'Destination');
    const card = label?.closest('div[class*="rounded-2xl"]');
    const btn = card ? [...card.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Préciser') : null;
    const b = btn ? btn.getBoundingClientRect() : null;
    const banner = [...document.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('Adresse approximative — c’est le centre du quartier'),
    );
    const bb = banner ? banner.getBoundingClientRect() : null;
    const vis = (r) => (!r ? 'ABSENT' : r.bottom <= vh && r.top >= (sheetTop ?? 0) ? 'VISIBLE' : r.top < vh ? 'PARTIEL' : 'SOUS LE PLI');
    return {
      vh,
      sheetTop,
      btn: b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), vis: vis(b) } : null,
      banner: bb ? { top: Math.round(bb.top), bottom: Math.round(bb.bottom), vis: vis(bb) } : null,
    };
  });
}
async function readEstimate() {
  return page.evaluate(() => {
    const ps = [...document.querySelectorAll('p')];
    const head = ps.find((p) => p.textContent?.includes('Estimation'));
    const block = head ? head.closest('div')?.parentElement?.innerText ?? '' : '';
    const price = (block.match(/([\d\s\u202f]+)\s*FCFA/) || [])[1]?.replace(/[\s\u202f]/g, '') ?? null;
    const km = (block.match(/([\d,]+)\s*km/) || [])[1] ?? null;
    const recap = ps.find((p) => p.textContent?.includes('→'));
    return { price: price ? Number(price) : null, km, recap: recap?.textContent ?? null, block: block.replace(/\n+/g, ' | ').slice(0, 160) };
  });
}
async function bannerPresent() {
  return page.evaluate(() =>
    [...document.querySelectorAll('p')].some((p) => p.textContent?.includes('Adresse approximative — c’est le centre du quartier')),
  );
}
async function openDestAdjust() {
  await setSnap(88);
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((p) => p.textContent?.trim() === 'Destination');
    const card = label?.closest('div[class*="rounded-2xl"]');
    const btn = card ? [...card.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Préciser') : null;
    btn?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const l = [...document.querySelectorAll('p')].find((p) => p.textContent?.trim() === 'Destination');
    const card = l?.closest('div[class*="rounded-2xl"]');
    const btn = card ? [...card.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Préciser') : null;
    btn?.click();
  });
  await page.waitForTimeout(1500);
  return (await page.locator('button', { hasText: 'Confirmer ce point' }).count()) > 0;
}
async function dragMapNorth(times) {
  await page.click('.leaflet-control-zoom-out').catch(() => {});
  await page.waitForTimeout(700);
  await page.click('.leaflet-control-zoom-out').catch(() => {});
  await page.waitForTimeout(700);
  for (let i = 0; i < times; i++) {
    await page.mouse.move(195, 300);
    await page.mouse.down();
    for (let s = 1; s <= 6; s++) {
      await page.mouse.move(195, 300 - s * 30, { steps: 1 });
      await page.waitForTimeout(60);
    }
    await page.mouse.up();
    await page.waitForTimeout(1200);
  }
  await page.waitForTimeout(2500);
}

await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3500);
const welcome = page.locator('[role="dialog"][aria-label*="Bienvenue"]');
if (await welcome.count()) {
  await welcome.locator('button').last().click().catch(() => {});
  await page.waitForTimeout(800);
}

// B1. Départ par défaut = GPS.
await setSnap(58);
const depDefault = await page.locator('#depart').inputValue();
if (depDefault === 'Aéroport Léon-Mba') ok(`départ par défaut = GPS : « ${depDefault} » (position simulée)`);
else fail(`départ par défaut « ${depDefault} » (attendu « Aéroport Léon-Mba », GPS simulé)`);

// B2. Départ déplacé via la liste, stable.
await page.locator('#depart').click();
await page.locator('#depart').fill('Nzeng-Ayong');
await page.waitForTimeout(400);
await page.locator('#depart-quartiers button', { hasText: 'Nzeng-Ayong' }).first().click();
await page.waitForTimeout(600);
if ((await page.locator('#depart').inputValue()) === 'Nzeng-Ayong') ok('départ déplacé via la liste : Nzeng-Ayong (loin du GPS)');
else fail('départ non déplacé via la liste');
await page.waitForTimeout(4000);
if ((await page.locator('#depart').inputValue()) === 'Nzeng-Ayong') ok('départ stable 4 s après (aucun retour GPS)');
else fail(`départ revenu sur « ${await page.locator('#depart').inputValue()} » après 4 s (retour GPS !)`);

// B3. Destination Glass + visibilité.
const destInput = page.locator('input[aria-label="Rechercher une destination"]');
await destInput.click();
await destInput.fill('Glass');
await page.waitForTimeout(900);
await page.locator('button:has(span:text-is("Glass"))').first().click();
await page.waitForTimeout(1500);
if (await bannerPresent()) ok('bannière ambre affichée pour Glass (centre de quartier = approximatif)');
else fail('bannière ambre absente pour Glass');
await setSnap(58);
await page.waitForTimeout(400);
const m58 = await measureDest();
if (m58.btn?.vis === 'VISIBLE') ok(`cran 58 : bouton Préciser destination ${m58.btn.top}–${m58.btn.bottom}px → VISIBLE sans scroller`);
else fail(`cran 58 : bouton Préciser destination ${m58.btn ? `${m58.btn.top}–${m58.btn.bottom}px → ${m58.btn.vis}` : 'absent'}`);
if (m58.banner?.vis === 'VISIBLE') ok(`cran 58 : bannière ambre ${m58.banner.top}–${m58.banner.bottom}px → VISIBLE sans scroller`);
else fail(`cran 58 : bannière ${m58.banner ? `${m58.banner.top}–${m58.banner.bottom}px → ${m58.banner.vis}` : 'absente'}`);
await setSnap(88);
await page.waitForTimeout(400);
const m88 = await measureDest();
if (m88.btn?.vis === 'VISIBLE') ok(`cran 88 : bouton Préciser destination ${m88.btn.top}–${m88.btn.bottom}px → VISIBLE`);
else fail(`cran 88 : bouton Préciser destination ${m88.btn ? m88.btn.vis : 'absent'}`);
await setSnap(30);
await page.waitForTimeout(400);
const m30 = await measureDest();
await shot('v254-apres-cran30.png');
if (m30.btn) {
  const underFold = m30.btn.top - m30.vh;
  console.log(`    cran 30 : bouton Préciser destination ${m30.btn.top}–${m30.btn.bottom}px (pli à ${m30.vh}px, ${underFold}px sous le pli ; avant : 1 296px, 452px sous le pli)`);
  if (underFold <= 60) ok(`cran 30 : bouton à ${underFold}px sous le pli (borne 60px — le bouton départ est lui-même à moitié masqué par la nav basse à ce cran)`);
  else fail(`cran 30 : bouton à ${underFold}px sous le pli (borne 60px)`);
} else fail('cran 30 : bouton Préciser destination absent');
await setSnap(58);
await shot('v254-apres-cran58.png');

// B4. Flux épingle destination.
let estBefore = await readEstimate();
if (estBefore.price === null) {
  await page.waitForTimeout(3000);
  estBefore = await readEstimate();
}
console.log(`    estimation avant épingle : ${estBefore.price} FCFA, ${estBefore.km} km — ${estBefore.recap ?? ''}`);
if (!(await openDestAdjust())) fail('mode épingle destination non ouvert via le bouton d’en-tête');
else ok('mode épingle destination ouvert via le bouton d’en-tête (« Précise ta destination »)');
await dragMapNorth(4);
const estMoved = await readEstimate();
console.log(`    estimation après déplacement (~3 km) : ${estMoved.price} FCFA, ${estMoved.km} km — ${estMoved.recap ?? ''}`);
if (estBefore.price !== null && estMoved.price !== null && estMoved.price !== estBefore.price) ok(`estimation recalculée sur le point exact : ${estBefore.price} → ${estMoved.price} FCFA (${estBefore.km} → ${estMoved.km} km)`);
else fail(`estimation non recalculée après déplacement (${estBefore.price} → ${estMoved.price} FCFA)`);
await shot('v254-epingle-destination.png');
// Annuler → retour au point d'avant (prix + bannière + quartier).
await page.locator('button', { hasText: 'Annuler' }).last().click();
await page.waitForTimeout(2500);
const estCancel = await readEstimate();
console.log(`    estimation après Annuler : ${estCancel.price} FCFA, ${estCancel.km} km — ${estCancel.recap ?? ''}`);
if (estCancel.price === estBefore.price) ok(`Annuler : estimation revenue à ${estCancel.price} FCFA (point d’avant)`);
else fail(`Annuler : estimation ${estCancel.price} FCFA (attendu ${estBefore.price})`);
if (await bannerPresent()) ok('Annuler : bannière ambre de retour (source neighborhood restaurée)');
else fail('Annuler : bannière ambre absente — la source n’a pas été restaurée');
const depAfterCancel = await page.locator('#depart').inputValue();
if (depAfterCancel === 'Nzeng-Ayong') ok('Annuler : départ inchangé (Nzeng-Ayong)');
else fail(`Annuler : départ modifié (« ${depAfterCancel} »)`);
// Rouvrir, déplacer, confirmer.
if (!(await openDestAdjust())) fail('mode épingle destination non rouvert');
await dragMapNorth(4);
const estMoved2 = await readEstimate();
await page.locator('button', { hasText: 'Confirmer ce point' }).click();
await page.waitForTimeout(2500);
const estConfirmed = await readEstimate();
console.log(`    estimation après Confirmer : ${estConfirmed.price} FCFA, ${estConfirmed.km} km — ${estConfirmed.recap ?? ''}`);
if (estConfirmed.price === estMoved2.price && estConfirmed.price !== estBefore.price) ok(`Confirmer : prix déplacé conservé (${estConfirmed.price} FCFA)`);
else fail(`Confirmer : prix ${estConfirmed.price} FCFA (attendu ${estMoved2.price})`);
if (!(await bannerPresent())) ok('Confirmer : bannière disparue (point devenu exact, source pin)');
else fail('Confirmer : bannière encore là alors que le point est exact');
if (estConfirmed.recap && !estConfirmed.recap.includes('Glass')) ok(`Confirmer : récap sur le nouveau quartier (« ${estConfirmed.recap} »)`);
else fail(`Confirmer : récap inattendu (« ${estConfirmed.recap} »)`);
await shot('v254-adresse-confirmee.png');

// B5. Flux épingle départ : déplacement libre, aucun retour GPS.
const depBeforePin = await page.locator('#depart').inputValue();
await setSnap(88);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(
    (x) => x.textContent?.trim() === 'Préciser' && x.closest('div')?.querySelector('#depart'),
  );
  btn?.scrollIntoView({ block: 'center' });
  btn?.click();
});
await page.waitForTimeout(1500);
if ((await page.locator('button', { hasText: 'Confirmer ce point' }).count()) > 0) ok('mode épingle départ ouvert via le bouton Préciser du départ');
else fail('mode épingle départ non ouvert');
await dragMapNorth(3);
await page.locator('button', { hasText: 'Confirmer ce point' }).click();
await page.waitForTimeout(2500);
const depAfterPin = await page.locator('#depart').inputValue();
console.log(`    départ après épingle : « ${depBeforePin} » → « ${depAfterPin} »`);
if (depAfterPin !== '' && depAfterPin !== 'Aéroport Léon-Mba') ok(`départ déplacé à l’épingle : « ${depAfterPin} » (loin du GPS)`);
else fail(`départ après épingle : « ${depAfterPin} » (retour GPS ?)`);
await page.waitForTimeout(3000);
if ((await page.locator('#depart').inputValue()) === depAfterPin) ok('départ à l’épingle stable 3 s après (aucun retour GPS)');
else fail('départ revenu sur le GPS après l’épingle');

// B6. Commander loin du GPS.
const cmd = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) =>
    /Se connecter pour commander|Commander/.test(x.textContent ?? ''),
  );
  const bodyTxt = document.body.innerText;
  return {
    present: !!b,
    label: b ? (b.textContent ?? '').trim() : null,
    disabled: b ? b.disabled : null,
    noGpsWarning: !/dois être au point de départ|sois au départ|ta position/i.test(bodyTxt),
  };
});
console.log(`    bouton commande : ${JSON.stringify(cmd)}`);
if (cmd.present && cmd.disabled === false) ok(`commande possible loin du GPS : « ${cmd.label} » actif (non désactivé)`);
else fail(`bouton commande absent ou désactivé : ${JSON.stringify(cmd)}`);
if (cmd.noGpsWarning) ok('aucun message exigeant d’être au point de départ');
else fail('message exigeant d’être au point de départ présent');

// B7. Recherche rue (informationnel — Photon externe) : on essaie
// « rue du bord de mer », on consigne le résultat sans faire échouer
// le lot si Photon ne renvoie pas cette rue depuis la VM.
await setSnap(58);
await destInput.click();
await destInput.fill('rue du bord de mer');
await page.waitForTimeout(3000);
const streetInfo = await page.evaluate(() => {
  const heads = [...document.querySelectorAll('p')].filter((p) => p.textContent?.trim() === 'Rues & adresses');
  const ul = heads[0]?.parentElement?.querySelector('ul');
  const items = ul ? [...ul.querySelectorAll('button')].map((b) => (b.textContent ?? '').replace(/\s+/g, ' ').trim()) : [];
  return items.slice(0, 3);
});
if (streetInfo.length > 0) {
  console.log(`    recherche rue « rue du bord de mer » : ${streetInfo.length} résultat(s) — ex. « ${streetInfo[0].slice(0, 80)} »`);
  if ((await page.locator('button', { hasText: /Bord de mer/i }).count()) > 0) {
    await page.locator('button', { hasText: /Bord de mer/i }).first().click();
    await page.waitForTimeout(1500);
  }
  ok('recherche rue : résultats d’adresses OSM affichés (sélection possible)');
} else {
  console.log('    recherche rue « rue du bord de mer » : 0 résultat affiché depuis la VM (Photon ne renvoie pas cette rue en tête — vérifié en direct : /api/search-address répond, mais sans la rue demandée ; le flux épingle ci-dessus couvre la précision de toute façon).');
  ok('recherche rue : 0 résultat pour cette requête (consigné, non bloquant — Photon externe)');
}

if (consoleErrors.length === 0) ok('DOM : 0 erreur console');
else warn(`DOM : ${consoleErrors.length} erreur(s) console : ${consoleErrors.slice(0, 2).join(' | ')}`);

await browser.close();

// --- Résumé ---
console.log('');
if (failures.length === 0 && warnings.length === 0) {
  console.log('VÉRIFICATION v2.54 : 0 échec, 0 avertissement.');
} else {
  console.log(`VÉRIFICATION v2.54 : ${failures.length} échec(s), ${warnings.length} avertissement(s).`);
  for (const f of failures) console.error(`  ÉCHEC : ${f}`);
  for (const w of warnings) console.log(`  AVERTISSEMENT : ${w}`);
  process.exitCode = failures.length ? 1 : 0;
}
