#!/usr/bin/env node
/** Vérification du lot v2.53 (carte claire : les quartiers doivent se
 *  lire — retour au fond OpenStreetMap standard, libellés sombres
 *  opaques + halo clair, règles de masquage OSM, attribution OSM
 *  seule).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v253.mjs
 * Contrôle :
 *  A. Statique (greps + fichiers) :
 *     1. Tuiles OSM standard dans LibrevilleMap + HeroMiniMap
 *        (`tile.openstreetmap.org/{z}/{x}/{y}.png`) ; 0 référence
 *        à l'ancien fond sombre dans le code actif de la carte
 *        (URL, clé, attribution) dans app/ + components/ + lib/
 *        + styles/.
 *     2. Attribution « © OpenStreetMap contributors » seule
 *        (carte, pied de page d'accueil, page cookies).
 *     3. Libellés lisibles : quartiers #191432 opacité pleine +
 *        halo clair ; libellés POI #191432 opacité pleine + halo
 *        clair ; fond du conteneur #E9E6DB (terre claire).
 *     4. Règles de masquage OSM : tables
 *        NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM / MAX_ZOOM présentes,
 *        Akanda borne 14, PK5 hors table ; POI `osmLabelMinZoom`
 *        v2.43 (Lycée z15, Palais des Sports z16, Park Inn /
 *        Rond-Point / Institut Français z17) ; classe `label-osm`.
 *     5. Règle 1 (statique) : PriceDisplay utilise LogoLoader ;
 *        HomeScreen utilise NeonSearchLoader + LogoLoader.
 *     6. Règle 2 (statique) : verrou serveur
 *        `driver_account_required` dans PATCH /api/profile + garde
 *        client dans HomeScreen.
 *     7. Greps : 0 nom personnel ; 0 mention d'IA (mot « IA » en
 *        mot entier + formules explicites) ; 0 clé secrète ;
 *        `lib/commission.ts` inchangée (5 % / 8 % / 10 %).
 *     8. Feuille du bas (v2.53) : crans [15, 30, 58, 88] ; glisser
 *        par écouteurs `window` (pas de `setPointerCapture`) ;
 *        cycle par le `onClick` de la poignée + suppression du clic
 *        fantôme après un glisser ; `atFull` à 88 ; garde de focus
 *        `lastKeyRef` dans DestinationSearch ; boutons +/− remontés
 *        au-dessus de la feuille sur mobile (`.map-with-sheet`,
 *        `--sheet-h`).
 *  B. DOM Chromium 390×844 (rendus dans
 *     ~/workspace/your_files/rendus-v253/) :
 *     1. Accueil zoom 12 : 6 libellés de quartiers dans le DOM ;
 *        URL des tuiles = OSM ; attribution OSM seule ; fond du
 *        conteneur clair ; libellé calculé #191432, opacité 1,
 *        halo clair.
 *     2. Zoom 14 : 17 libellés ; zoom 16 : 14 libellés.
 *     3. Zoom 13 : 11 libellés (vue multi-libellés).
 *     4. Zoom 16 : clic sur un POI → fiche du lieu ouverte
 *        (nom + « Y aller »).
 *     5. Feuille du bas : tap poignée 15 → 30 → 58 (sans vol de
 *        focus) ; chevron 58 → 88 → 15 ; glisser vers le haut
 *        30 → 88 et y reste ; glisser vers le bas 88 → 15 ;
 *        boutons +/− atteignables au cran mini.
 * Les tuiles ne se chargent pas dans le navigateur de la VM
 * (limitation réseau connue) : on vérifie le DOM (URL des tuiles,
 * libellés, couleurs calculées), pas les tuiles. La lisibilité
 * réelle sur téléphone reste à confirmer en live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RENDUS = path.join(process.env.HOME ?? '', 'workspace/your_files/rendus-v253');

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

function objectBody(src, name) {
  // `name` doit être l'amorce de la déclaration (`const NOM…`) : le
  // nom seul apparaît aussi dans les commentaires au-dessus, et le
  // corps extrait serait alors celui d'un autre objet.
  const i = src.indexOf(name);
  if (i < 0) return null;
  const start = src.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < src.length; j++) {
    if (src[j] === '{') depth += 1;
    if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1); }
  }
  return null;
}

// --- A. Statique ---
console.log('A. Statique');

// A1. Tuiles OSM dans le code de la carte ; 0 ancien fond sombre.
const mapSrc = read('components/map/LibrevilleMap.tsx');
const heroSrc = read('components/activite/HeroMiniMap.tsx');
for (const [label, src] of [['LibrevilleMap', mapSrc], ['HeroMiniMap', heroSrc]]) {
  if (src.includes('https://tile.openstreetmap.org/{z}/{x}/{y}.png')) ok(`${label} : tuiles OSM standard`);
  else fail(`${label} : URL des tuiles OSM absente`);
  if (src.includes('OSM_ATTRIBUTION') && src.includes('OpenStreetMap</a> contributors')) ok(`${label} : attribution OSM`);
  else fail(`${label} : attribution OSM absente`);
}
const codeFiles = [
  ...walk(path.join(ROOT, 'app'), ['.tsx', '.ts']),
  ...walk(path.join(ROOT, 'components'), ['.tsx', '.ts']),
  ...walk(path.join(ROOT, 'lib'), ['.ts']),
  ...walk(path.join(ROOT, 'styles'), ['.css']),
];
let oldTile = 0;
let oldKey = 0;
let oldAttr = 0;
for (const f of codeFiles) {
  const s = fs.readFileSync(f, 'utf8');
  const low = s.toLowerCase();
  if (low.includes('cartocdn') || low.includes('dark_all') || s.includes('CARTO')) {
    oldTile += 1;
    console.error(`    ancien fond sombre dans ${path.relative(ROOT, f)}`);
  }
  if (s.includes('CARTO_API_KEY')) { oldKey += 1; console.error(`    clé ancien fond dans ${path.relative(ROOT, f)}`); }
  if (s.includes('carto.com/attributions') || s.includes('© CARTO')) {
    oldAttr += 1;
    console.error(`    attribution ancien fond dans ${path.relative(ROOT, f)}`);
  }
}
if (oldTile === 0) ok('0 mention de l\u2019ancien fond sombre dans app/ + components/ + lib/ + styles/');
else fail(`${oldTile} fichier(s) mentionnent encore l\u2019ancien fond sombre`);
if (oldKey === 0) ok('0 lecture de l\u2019ancienne clé de fond de carte');
else fail(`${oldKey} fichier(s) lisent encore l\u2019ancienne clé`);
if (oldAttr === 0) ok('0 attribution ancien fond');
else fail(`${oldAttr} fichier(s) avec attribution ancien fond`);

// A2. Attribution OSM seule (pied de page + cookies).
const home = read('components/home/HomeScreen.tsx');
if (home.includes('© OpenStreetMap') && !home.includes('© CARTO')) ok('pied de page : « © OpenStreetMap » seul');
else fail('pied de page : attribution incorrecte');
const cookies = read('app/cookies/page.tsx');
if (cookies.includes('tuiles OpenStreetMap') && !cookies.toLowerCase().includes('carto')) ok('page cookies : tuiles OpenStreetMap');
else fail('page cookies : mention incorrecte');

// A3. Libellés lisibles + fond du conteneur clair.
const css = read('styles/globals.css');
const labelBlock = css.match(/\.map-neighborhood-label \{[^}]*\}/s)?.[0] ?? '';
if (labelBlock.includes('color: #191432') && !labelBlock.includes('0.55')) ok('libellés quartiers : #191432, opacité pleine');
else fail('libellés quartiers : couleur / opacité incorrectes');
if (labelBlock.includes('255, 255, 255')) ok('libellés quartiers : halo clair');
else fail('libellés quartiers : halo clair absent');
if (labelBlock.includes('font-size: 11px')) ok('libellés quartiers : 11 px');
else fail('libellés quartiers : taille incorrecte');
const poiLabelBlock = css.match(/\.map-poi-label \{[^}]*\}/s)?.[0] ?? '';
if (poiLabelBlock.includes('color: #191432') && poiLabelBlock.includes('255, 255, 255')) ok('libellés POI : #191432 + halo clair');
else fail('libellés POI : couleur / halo incorrects');
const containerBlock = css.match(/\.leaflet-container \{[^}]*\}/s)?.[0] ?? '';
if (containerBlock.includes('#E9E6DB') && !containerBlock.includes('#191432')) ok('fond du conteneur : terre claire #E9E6DB');
else fail('fond du conteneur : couleur incorrecte');
if (css.includes('.map-poi-marker.label-osm') && !css.includes('label-carto')) ok('classe anti-double : `label-osm`');
else fail('classe anti-double incorrecte');

// A4. Règles de masquage OSM.
const nb = read('lib/neighborhoods.ts');
if (nb.includes('NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM') && nb.includes('NEIGHBORHOOD_OSM_LABEL_MAX_ZOOM')) ok('tables OSM présentes dans lib/neighborhoods.ts');
else fail('tables OSM absentes');
const minBody = objectBody(nb, 'const NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM');
const maxBody = objectBody(nb, 'const NEIGHBORHOOD_OSM_LABEL_MAX_ZOOM');
const minBodyNoComments = minBody ? minBody.replace(/\/\/.*$/gm, '') : '';
if (minBody && !minBodyNoComments.includes('PK5')) ok('PK5 hors table des minimums (mentionné seulement en commentaire)');
else fail('PK5 dans la table des minimums (ou table illisible)');
if (maxBody && /Akanda:\s*14/.test(maxBody)) ok('Akanda : borne haute 14');
else fail('Akanda : borne haute incorrecte');
const pois = read('lib/pois.ts');
const poiChecks = [
  ['Lycée National Léon Mba', 15],
  ['Palais des Sports', 16],
  ['Park Inn by Radisson', 17],
  ['Rond-Point de la Démocratie', 17],
  ['Institut Français du Gabon', 17],
];
let poiOk = true;
for (const [name, z] of poiChecks) {
  const re = new RegExp(`name: '${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[^}]*osmLabelMinZoom: ${z}`);
  if (!re.test(pois)) { poiOk = false; console.error(`    osmLabelMinZoom incorrect pour ${name} (attendu ${z})`); }
}
if (poiOk) ok('POI : 5 valeurs osmLabelMinZoom v2.43 restaurées (15 / 16 / 17 / 17 / 17)');
else fail('POI : valeurs osmLabelMinZoom incorrectes');
if (mapSrc.includes("classList.toggle('label-osm'")) ok('LibrevilleMap : classe `label-osm` posée par updateLabels');
else fail('LibrevilleMap : classe `label-osm` absente');

// A5. Règle 1 : le S partout où il y a une attente
const priceDisplay = read('components/home/PriceDisplay.tsx');
if (priceDisplay.includes('LogoLoader')) ok('PriceDisplay : LogoLoader');
else fail('PriceDisplay : LogoLoader absent');
if (home.includes('NeonSearchLoader')) ok('HomeScreen : NeonSearchLoader sur la recherche de chauffeur');
else fail('HomeScreen : NeonSearchLoader absent');
const logoUses = (home.match(/<LogoLoader/g) || []).length;
if (logoUses >= 5) ok(`HomeScreen : ${logoUses} LogoLoader`);
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

// A8. Feuille du bas (v2.53) : crans, glisser, chevron, zoom.
if (home.includes('const SHEET_SNAPS = [15, 30, 58, 88]')) ok('feuille : crans [15, 30, 58, 88] (88 = quasi plein écran)');
else fail('feuille : SHEET_SNAPS incorrects (attendu [15, 30, 58, 88])');
if (!home.includes('.setPointerCapture(')) ok('feuille : pas de setPointerCapture (glisser par écouteurs window)');
else fail('feuille : setPointerCapture encore utilisé');
if (home.includes("window.addEventListener('pointermove', onDragPointerMove)") && home.includes("window.addEventListener('pointerup', onDragPointerUp)")) ok('feuille : glisser suivi par écouteurs window (pointermove / pointerup)');
else fail('feuille : écouteurs window du glisser absents');
if (home.includes('onClick={onHandleClick}') && home.includes('onPointerDown={onHandlePointerDown}')) ok('feuille : poignée = pointerdown (glisser) + onClick (cycle)');
else fail('feuille : handlers de la poignée incorrects');
if (home.includes("window.addEventListener('click', stopClick, true)") && home.includes('suppressClickRef')) ok('feuille : clic fantôme après glisser supprimé');
else fail('feuille : suppression du clic fantôme absente');
if (home.includes('const atFull = sheetH >= 88')) ok('feuille : atFull à 88 (chevron bas seulement en haut)');
else fail('feuille : atFull incorrect');
if (home.includes('--sheet-h') && home.includes('map-with-sheet')) ok('feuille : hauteur transmise à la carte (--sheet-h, .map-with-sheet)');
else fail('feuille : variable --sheet-h / classe map-with-sheet absentes');
if (css.includes('.map-with-sheet .leaflet-bottom.leaflet-right') && css.includes('var(--sheet-h') && css.includes('var(--sheet-fab')) ok('feuille : boutons +/− remontés au-dessus de la feuille et du bouton flottant sur mobile');
else fail('feuille : remontée des boutons +/− absente dans globals.css');
const destSearch = read('components/home/DestinationSearch.tsx');
if (destSearch.includes('lastKeyRef')) ok('feuille : garde de focus lastKeyRef dans DestinationSearch (pas de focus volé)');
else fail('feuille : garde de focus lastKeyRef absente');

// --- B. DOM Chromium 390×844 ---
console.log('B. DOM Chromium 390×844');
fs.mkdirSync(RENDUS, { recursive: true });
const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function shot(name) {
  const out = path.join(RENDUS, name);
  await page.screenshot({ path: out });
  return out;
}
async function currentZoom() {
  // Le zoom réel se lit sur les tuiles : le z de l'URL des tuiles
  // visibles (mode des z, pour ignorer les tuiles de l'ancien zoom
  // pendant l'animation). L'ancienne déduction par le nombre de
  // libellés ne distinguait pas z15 de z16 (14 libellés aux deux
  // zooms) et cliquait jusqu'au zoom max.
  return page.evaluate(() => {
    const zs = [...document.querySelectorAll('.leaflet-tile')]
      .map((i) => {
        const m = (i.getAttribute('src') || '').match(/openstreetmap\.org\/(\d+)\//);
        return m ? Number(m[1]) : null;
      })
      .filter((z) => z !== null);
    if (!zs.length) return null;
    const counts = {};
    for (const z of zs) counts[z] = (counts[z] ?? 0) + 1;
    return Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
  });
}
async function setZoom(target) {
  // Le zoom courant se lit sur les tuiles (voir currentZoom) ; on
  // clique sur les boutons Leaflet jusqu'au zoom voulu (max 10 clics).
  for (let i = 0; i < 10; i++) {
    const cur = await currentZoom();
    if (cur === target) return true;
    if (cur == null || cur < target) await page.click('.leaflet-control-zoom-in');
    else await page.click('.leaflet-control-zoom-out');
    await page.waitForTimeout(700);
  }
  return false;
}
async function labelCount() {
  return page.evaluate(() => document.querySelectorAll('.map-neighborhood-label').length);
}

await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// B1. Accueil zoom 12 (vue ville)
if (await setZoom(12)) ok('zoom 12 atteint');
else fail('zoom 12 non atteint');
await shot('v253-accueil-z12.png');
const z12 = await labelCount();
if (z12 === 6) ok(`zoom 12 : 6 libellés de quartiers dans le DOM`);
else fail(`zoom 12 : ${z12} libellés (attendu 6)`);
const tileInfo = await page.evaluate(() => {
  const img = document.querySelector('.leaflet-tile');
  const attr = document.querySelector('.leaflet-control-attribution');
  const cont = document.querySelector('.leaflet-container');
  const label = document.querySelector('.map-neighborhood-label');
  const cs = label ? getComputedStyle(label) : null;
  return {
    tileSrc: img ? img.getAttribute('src') : null,
    attribution: attr ? attr.innerText : '',
    containerBg: cont ? getComputedStyle(cont).backgroundColor : '',
    labelColor: cs ? cs.color : '',
    labelOpacity: cs ? cs.opacity : '',
    labelShadow: cs ? cs.textShadow : '',
  };
});
if (tileInfo.tileSrc && tileInfo.tileSrc.includes('tile.openstreetmap.org')) ok(`tuiles : ${tileInfo.tileSrc.split('/').slice(0, 3).join('/')}/…`);
else fail(`tuiles : src inattendue (${tileInfo.tileSrc})`);
if (tileInfo.attribution.includes('OpenStreetMap') && !tileInfo.attribution.includes('CARTO')) ok(`attribution : « ${tileInfo.attribution.trim()} »`);
else fail(`attribution incorrecte : « ${tileInfo.attribution.trim()} »`);
if (tileInfo.containerBg === 'rgb(233, 230, 219)') ok('fond du conteneur : rgb(233, 230, 219) (#E9E6DB)');
else fail(`fond du conteneur : ${tileInfo.containerBg} (attendu rgb(233, 230, 219))`);
if (tileInfo.labelColor === 'rgb(25, 20, 50)') ok('libellé calculé : rgb(25, 20, 50) (#191432)');
else fail(`libellé calculé : ${tileInfo.labelColor} (attendu rgb(25, 20, 50))`);
if (tileInfo.labelOpacity === '1') ok('libellé : opacité 1 (pleine)');
else fail(`libellé : opacité ${tileInfo.labelOpacity} (attendue 1)`);
if (tileInfo.labelShadow.includes('255, 255, 255')) ok('libellé : halo clair (text-shadow blanc)');
else fail(`libellé : halo clair absent (${tileInfo.labelShadow})`);
if (consoleErrors.length === 0) ok('accueil : 0 erreur console');
else warn(`accueil : ${consoleErrors.length} erreur(s) console : ${consoleErrors.slice(0, 2).join(' | ')}`);

// B2. Zoom 14 : 17 libellés
if (await setZoom(14)) ok('zoom 14 atteint');
else fail('zoom 14 non atteint');
await shot('v253-accueil-z14.png');
const z14 = await labelCount();
if (z14 === 17) ok('zoom 14 : 17 libellés de quartiers dans le DOM');
else fail(`zoom 14 : ${z14} libellés (attendu 17)`);

// B3. Zoom 13 : 11 libellés (vue multi-libellés)
if (await setZoom(13)) ok('zoom 13 atteint');
else fail('zoom 13 non atteint');
await shot('v253-accueil-z13-labels.png');
const z13 = await labelCount();
if (z13 === 11) ok('zoom 13 : 11 libellés de quartiers dans le DOM');
else fail(`zoom 13 : ${z13} libellés (attendu 11)`);

// B4. Zoom 16 : 14 libellés + fiche POI
if (await setZoom(16)) ok('zoom 16 atteint');
else fail('zoom 16 non atteint');
await shot('v253-accueil-z16.png');
const z16 = await labelCount();
if (z16 === 14) ok('zoom 16 : 14 libellés de quartiers dans le DOM');
else fail(`zoom 16 : ${z16} libellés (attendu 14)`);
const poiCount = await page.evaluate(() => document.querySelectorAll('.map-poi-marker').length);
if (poiCount >= 50) ok(`${poiCount} marqueurs POI dans le DOM à z16`);
else fail(`seulement ${poiCount} marqueurs POI à z16`);
const poiClicked = await page.evaluate(() => {
  const m = document.querySelector('.map-poi-marker');
  if (!m) return null;
  m.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return m.textContent;
});
await page.waitForTimeout(1200);
await shot('v253-fiche-poi-z16.png');
const fiche = await page.evaluate(() => document.body.innerText);
if (poiClicked && fiche.includes('Y aller')) ok(`fiche POI ouverte (${poiClicked.trim().slice(0, 40)}…)`);
else fail(`fiche POI non ouverte (clic sur : ${poiClicked})`);

// B5. Feuille du bas (page tactile 390×844)
const page2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
page2.on('pageerror', (e) => consoleErrors.push(String(e)));
await page2.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page2.waitForTimeout(2500);
const welcome2 = page2.locator('[role="dialog"][aria-label*="Bienvenue"]');
if (await welcome2.count()) {
  await welcome2.locator('button').last().click().catch(() => {});
  await page2.waitForTimeout(800);
}
async function shot2(name) {
  const out = path.join(RENDUS, name);
  await page2.screenshot({ path: out });
  return out;
}
const sheetH2 = () => page2.evaluate(() => document.querySelector('.sheet-glass')?.parentElement?.style?.height ?? 'ABSENT');
const zoomOk2 = () => page2.evaluate(() => {
  // Les DEUX boutons (+ et −) doivent être atteignables : le bouton
  // flottant rose « Remonter la feuille » (cran mini) cachait le −
  // avant la v2.53 (remontée de 62 px, voir `--sheet-fab`).
  const reach = (sel) => {
    const b = document.querySelector(sel);
    if (!b) return false;
    const r = b.getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el === b || (el && b.contains(el));
  };
  return reach('.leaflet-control-zoom-in') && reach('.leaflet-control-zoom-out');
});
async function dragSheet(pageObj, dy, steps) {
  const box = await pageObj.locator('.sheet-handle').boundingBox();
  if (!box) return false;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await pageObj.context().newCDPSession(pageObj);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy + (dy * i) / steps, id: 1 }] });
    await pageObj.waitForTimeout(40);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await pageObj.waitForTimeout(800);
  return true;
}
if ((await sheetH2()) === '15dvh') ok('feuille : cran mini 15 dvh à l’arrivée (carte libérée)');
else fail(`feuille : hauteur initiale ${(await sheetH2())} (attendue 15dvh)`);
if (await zoomOk2()) ok('feuille : boutons +/− atteignables au cran mini');
else fail('feuille : boutons +/− recouverts au cran mini');
const handle2 = page2.locator('.sheet-handle');
await handle2.tap();
await page2.waitForTimeout(800);
if ((await sheetH2()) === '30dvh') ok('feuille : tap poignée 15 → 30 (un seul cran)');
else fail(`feuille : tap poignée → ${(await sheetH2())} (attendu 30dvh)`);
const focusAfterTap = await page2.evaluate(() => document.activeElement?.tagName ?? 'none');
if (focusAfterTap === 'BUTTON') ok('feuille : pas de vol de focus après le tap (focus sur la poignée, pas l’input)');
else fail(`feuille : focus volé après le tap (activeElement = ${focusAfterTap})`);
await handle2.tap();
await page2.waitForTimeout(800);
if ((await sheetH2()) === '58dvh') ok('feuille : tap poignée 30 → 58');
else fail(`feuille : tap poignée → ${(await sheetH2())} (attendu 58dvh)`);
const chevron2 = page2.locator('button[aria-label="Déplier la feuille"], button[aria-label="Replier la feuille"]');
await chevron2.tap();
await page2.waitForTimeout(800);
if ((await sheetH2()) === '88dvh') ok('feuille : chevron 58 → 88 (quasi plein écran, recouvre la carte)');
else fail(`feuille : chevron → ${(await sheetH2())} (attendu 88dvh)`);
await shot2('v253-feuille-grande.png');
await chevron2.tap();
await page2.waitForTimeout(800);
if ((await sheetH2()) === '15dvh') ok('feuille : chevron 88 → 15 (boucle, jamais coincée à 30)');
else fail(`feuille : chevron → ${(await sheetH2())} (attendu 15dvh)`);
await shot2('v253-feuille-repliee.png');
await handle2.tap();
await page2.waitForTimeout(800);
if ((await sheetH2()) !== '30dvh') fail(`feuille : remontée à 30 avant le glisser → ${(await sheetH2())}`);
if (await dragSheet(page2, -550, 10)) {
  if ((await sheetH2()) === '88dvh') ok('feuille : glisser vers le haut 30 → 88');
  else fail(`feuille : glisser vers le haut → ${(await sheetH2())} (attendu 88dvh)`);
  await page2.waitForTimeout(600);
  if ((await sheetH2()) === '88dvh') ok('feuille : reste à 88 après 600 ms (pas de retour au cran)');
  else fail(`feuille : retombée à ${(await sheetH2())} après le glisser`);
} else fail('feuille : glisser vers le haut impossible (poignée introuvable)');
if (await dragSheet(page2, 650, 13)) {
  if ((await sheetH2()) === '15dvh') ok('feuille : glisser vers le bas 88 → 15');
  else fail(`feuille : glisser vers le bas → ${(await sheetH2())} (attendu 15dvh)`);
} else fail('feuille : glisser vers le bas impossible (poignée introuvable)');
if (await zoomOk2()) ok('feuille : boutons +/− toujours atteignables après les glissers');
else fail('feuille : boutons +/− recouverts après les glissers');
await page2.close();

await browser.close();

// --- Résumé ---
console.log('');
if (failures.length === 0 && warnings.length === 0) {
  console.log('VÉRIFICATION v2.53 : 0 échec, 0 avertissement.');
} else {
  console.log(`VÉRIFICATION v2.53 : ${failures.length} échec(s), ${warnings.length} avertissement(s).`);
  for (const f of failures) console.error(`  ÉCHEC : ${f}`);
  for (const w of warnings) console.log(`  AVERTISSEMENT : ${w}`);
  process.exitCode = failures.length ? 1 : 0;
}
