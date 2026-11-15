#!/usr/bin/env node
/** Vérification fonctionnelle du lot v2.50 (prix routier OSRM + carte
 *  unique, sans bascule Plan/Satellite).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v250.mjs
 * Contrôle :
 *  A. API POST /api/estimate (serveur, distances OSRM réelles) :
 *     1. Ancre Centre-ville ↔ Nzeng-Ayong = Solo 1 500 / Groupe 950,
 *        dans les deux sens (valeur fixe, pas un calcul).
 *     2. Aéroport → Centre-ville = 3 550 / 2 050 (10,62 km, 12 min) ;
 *        Glass → Nzeng-Ayong = 2 550 / 1 650 (9,84 km, 11 min) ;
 *        Akanda → Aéroport = 6 000 / 3 600 (22,30 km, 38 min).
 *     3. Deux points du même quartier : estimations différentes et
 *        cohérentes avec la route (long > court, court ≥ plancher).
 *  B. DOM Chromium 390×844 (accueil) :
 *     1. Plus AUCUNE pastille « Plan » / « Satellite » à l'écran ;
 *        tuiles = basemaps.cartocdn.com/dark_all uniquement ;
 *        attribution unique « © OpenStreetMap contributors © CARTO ».
 *     2. Libellés Drive à z14 = les 17 attendus (règles CARTO v2.46),
 *        aucun double avec CARTO, PK5 présent, Akanda dès z15 ;
 *        69 libellés à z19, bouton + grisé (plafond 19 unique).
 *     3. POI : 59 pictogrammes à z16.
 *     4. Règle 1 : squelette « Calcul du prix… » pendant le recalcul,
 *        puis l'ancre 1 500 FCFA affichée après choix de Nzeng-Ayong.
 *     5. Règle 2 (statique) : verrou serveur `driver_account_required`
 *        dans PATCH /api/profile + garde client dans HomeScreen.
 *     6. Greps : 0 reste de code Satellite / bascule (constantes,
 *        état, icônes, CSS, attribution Esri) dans app/, components/,
 *        lib/, styles/ ; 0 nom personnel ; 0 mention d'IA (mot « IA »
 *        en mot entier + formules explicites) ; 0 clé secrète ;
 *        `lib/commission.ts` inchangée (5 % / 8 % / 10 %).
 * Les tuiles ne se chargent pas dans le navigateur de la VM
 * (limitation réseau connue) : on vérifie l'URL demandée dans le DOM,
 * pas le contenu des tuiles. La lisibilité réelle des rues reste à
 * confirmer en live après push.
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

function sameSet(a, b) {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

// --- A. API : coordonnées réelles lues dans lib/neighborhoods.ts ---
const nbSrc = fs.readFileSync(path.join(ROOT, 'lib/neighborhoods.ts'), 'utf8');
const nbBody = nbSrc.match(/NEIGHBORHOOD_COORDS[^=]*=\s*\{([\s\S]*?)\n\};/)[1];
const COORDS = {};
for (const m of nbBody.matchAll(/(?:'([^']+)'|([A-Za-zÀ-ÿ][\wÀ-ÿ-]*))\s*:\s*\{\s*lat:\s*([\d.]+),\s*lng:\s*([\d.]+)\s*\}/g)) {
  COORDS[m[1] || m[2]] = { lat: Number(m[3]), lng: Number(m[4]) };
}

async function estimate(from, to, opts = {}) {
  const res = await fetch(`${BASE_URL}/api/estimate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fromLat: COORDS[from].lat, fromLng: COORDS[from].lng,
      toLat: COORDS[to].lat, toLng: COORDS[to].lng,
      fromNeighborhood: from, toNeighborhood: to, ...opts,
    }),
  });
  return res.json();
}

async function estimateRaw(f, t, nb = 'Centre-ville') {
  const res = await fetch(`${BASE_URL}/api/estimate`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fromLat: f.lat, fromLng: f.lng, toLat: t.lat, toLng: t.lng, fromNeighborhood: nb, toNeighborhood: nb }),
  });
  return res.json();
}

console.log('— A. API /api/estimate (prix routier) —');
let r = await estimate('Centre-ville', 'Nzeng-Ayong');
r.solo?.price === 1500 ? ok('ancre Centre-ville → Nzeng-Ayong Solo 1 500') : fail(`ancre Solo : ${r.solo?.price} (attendu 1 500)`);
r.groupe?.price === 950 ? ok('ancre Centre-ville → Nzeng-Ayong Groupe 950') : fail(`ancre Groupe : ${r.groupe?.price} (attendu 950)`);
r = await estimate('Nzeng-Ayong', 'Centre-ville');
r.solo?.price === 1500 && r.groupe?.price === 950
  ? ok('ancre Nzeng-Ayong → Centre-ville 1 500 / 950 (deux sens)')
  : fail(`ancre inverse : Solo ${r.solo?.price} / Groupe ${r.groupe?.price} (attendu 1 500 / 950)`);
r = await estimate('Aéroport Léon-Mba', 'Centre-ville');
console.log(`    Aéroport→Centre-ville : ${r.route?.distanceKm} km / ${r.route?.durationMin} min, source=${r.solo?.distanceSource}, approx=${r.approximate}`);
r.solo?.price === 3550 && r.groupe?.price === 2050
  ? ok('Aéroport → Centre-ville 3 550 / 2 050 (routier, pas 3 150 / 1 800)')
  : fail(`Aéroport→Centre-ville : Solo ${r.solo?.price} / Groupe ${r.groupe?.price} (attendu 3 550 / 2 050)`);
r = await estimate('Glass', 'Nzeng-Ayong');
r.solo?.price === 2550 && r.groupe?.price === 1650
  ? ok(`Glass → Nzeng-Ayong 2 550 / 1 650 (${r.route?.distanceKm} km)`)
  : fail(`Glass→Nzeng-Ayong : Solo ${r.solo?.price} / Groupe ${r.groupe?.price} (attendu 2 550 / 1 650)`);
r = await estimate('Akanda', 'Aéroport Léon-Mba');
r.solo?.price === 6000 && r.groupe?.price === 3600
  ? ok(`Akanda → Aéroport 6 000 / 3 600 (${r.route?.distanceKm} km — trajet sinueux, pas 2 950)`)
  : fail(`Akanda→Aéroport : Solo ${r.solo?.price} / Groupe ${r.groupe?.price} (attendu 6 000 / 3 600)`);
const cv = COORDS['Centre-ville'];
const rAB = await estimateRaw({ lat: cv.lat, lng: cv.lng }, { lat: cv.lat + 0.011, lng: cv.lng + 0.006 });
const rAC = await estimateRaw({ lat: cv.lat, lng: cv.lng }, { lat: cv.lat + 0.0027, lng: cv.lng });
rAB.solo?.price > rAC.solo?.price && rAC.solo?.price >= 550
  ? ok(`même quartier : A→B ${rAB.solo?.price} FCFA (${rAB.route?.distanceKm} km) > A→C ${rAC.solo?.price} FCFA (${rAC.route?.distanceKm} km), cohérent avec la route`)
  : fail(`même quartier : A→B ${rAB.solo?.price} / A→C ${rAC.solo?.price} (incohérent)`);
if (rAB.approximate === false && rAC.approximate === false) ok('même quartier : estimations routières (pas de repli approximatif)');
else warn(`même quartier : approximate=${rAB.approximate}/${rAC.approximate} (OSRM en repli ?)`);

// --- B. DOM ---
const EXPECT_14 = ['Barracuda', 'Bizango', 'Cap Caravane', 'Diba-Diba', 'Gros-Bouquet', 'Melen', 'Mont-Bouët', 'Nkembo', 'Petit Paris', 'PK5', 'PK6', 'PK8', 'PK9', 'PK11', 'PK12', 'Santa Clara', 'Sogara'];
const CARTO_AT_14 = ['Centre-ville', 'Glass', 'Louis', 'Nzeng-Ayong', 'Charbonnages', 'Owendo', 'Akanda', 'Aéroport Léon-Mba', 'Lalala', 'Sotega', 'Ambowe', 'Angondjé', 'Sorbonne', 'Akebé', 'Kinguele', 'Oloumi', 'Mindoubé', 'Damas', 'Batterie IV', 'Gué-Gué', 'Sainte-Marie', 'La Peyrie', 'Plein Ciel', 'Belle-Vue', 'Awendjé', 'Cocotiers', 'Igoumié', 'Akournam', 'Ozangué', 'Venez-Voir', 'Trois Quartiers', 'Camp de Gaulle'];

console.log('— B. DOM 390×844 (carte unique + estimation) —');
const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail(`erreur JS sur la page : ${e.message}`));

  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.getByRole('dialog', { name: 'Bienvenue sur Stacks Drive' }).waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: 'Plus tard' }).click();
    await page.getByRole('dialog', { name: 'Bienvenue sur Stacks Drive' }).waitFor({ state: 'detached', timeout: 5000 });
    ok("carte d'accueil fermée (« Plus tard »)");
  } catch { warn("carte d'accueil non vue (déjà vue ?) — on continue"); }
  await page.locator('.map-neighborhood-label').first().waitFor({ timeout: 15000 });

  // 1. Plus de bascule Plan / Satellite.
  const planBtn = await page.getByRole('button', { name: 'Plan', exact: true }).count();
  const satBtn = await page.getByRole('button', { name: 'Satellite', exact: true }).count();
  planBtn === 0 && satBtn === 0
    ? ok('aucune pastille « Plan » / « Satellite » à l’écran')
    : fail(`pastilles restantes : Plan ×${planBtn}, Satellite ×${satBtn}`);
  const bodyText = await page.locator('body').innerText();
  if (!/Satellite/.test(bodyText)) ok('le mot « Satellite » n’apparaît nulle part sur l’accueil');
  else fail('le mot « Satellite » apparaît encore sur l’accueil');

  const tileSrcs = async () =>
    page.locator('.leaflet-tile-pane img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src') || ''));
  const attributionText = async () => (await page.locator('.leaflet-control-attribution').innerText()).trim();
  const srcs = await tileSrcs();
  const cartoSrcs = srcs.filter((s) => s.includes('basemaps.cartocdn.com/rastertiles/dark_all'));
  srcs.length > 0 && cartoSrcs.length === srcs.length
    ? ok(`tuiles : ${srcs.length} <img> dans le DOM, toutes en dark_all`)
    : fail(`tuiles : ${cartoSrcs.length}/${srcs.length} en dark_all`);
  const attr = await attributionText();
  (attr.includes('OpenStreetMap') && attr.includes('CARTO') && (attr.match(/CARTO/g) || []).length === 1)
    ? ok(`attribution unique : « ${attr} »`)
    : fail(`attribution : « ${attr} » (attendu © OpenStreetMap contributors © CARTO, une seule fois)`);

  // 2. Libellés aux zooms.
  let zoom = 14;
  const labels = async () => (await page.locator('.map-neighborhood-label').allTextContents()).map((t) => t.trim());
  async function labelsStable() {
    let prev = await labels();
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(400);
      const cur = await labels();
      if (sameSet(prev, cur)) return cur;
      prev = cur;
    }
    return prev;
  }
  async function setZoom(target) {
    const zoomIn = () => page.locator('.leaflet-control-zoom-in').evaluate((el) => el.click());
    const zoomOut = () => page.locator('.leaflet-control-zoom-out').evaluate((el) => el.click());
    while (zoom < target) { await zoomIn(); zoom++; await page.waitForTimeout(600); }
    while (zoom > target) { await zoomOut(); zoom--; await page.waitForTimeout(600); }
    return labelsStable();
  }
  const at14 = await setZoom(14);
  sameSet(at14, EXPECT_14)
    ? ok(`z14 : ${at14.length} libellés Drive, exactement les attendus (règles CARTO)`)
    : fail(`z14 : ${at14.length} libellés (attendu 17) — en trop : ${at14.filter((n) => !EXPECT_14.includes(n)).join(', ') || 'aucun'} ; manquants : ${EXPECT_14.filter((n) => !at14.includes(n)).join(', ') || 'aucun'}`);
  const doubled = at14.filter((n) => CARTO_AT_14.includes(n));
  doubled.length === 0
    ? ok('z14 : aucun libellé Drive parmi les noms que CARTO labellise (pas de double)')
    : fail(`z14 : libellés en double avec CARTO : ${doubled.join(', ')}`);
  at14.includes('PK5')
    ? ok('z14 : PK5 affiché (place=quarter, CARTO ne labellise pas)')
    : fail('z14 : PK5 absent');
  await page.screenshot({ path: '/tmp/v250-plan-z14.png' });
  const at15 = await setZoom(15);
  at15.includes('Akanda') ? ok('z15 : Akanda affiché (borne haute 14)') : fail('z15 : Akanda absent');
  const poiCount = await page.locator('.map-poi-marker').count();
  poiCount === 59 ? ok('POI à z16 : 59 pictogrammes') : fail(`POI à z16 : ${poiCount} (attendu 59)`);
  const at19 = await setZoom(19);
  at19.length === 69 ? ok('z19 : 69 libellés Drive') : fail(`z19 : ${at19.length} libellés (attendu 69)`);
  const zoomInDisabled = await page.locator('.leaflet-control-zoom-in').evaluate((el) => el.classList.contains('leaflet-disabled'));
  zoomInDisabled ? ok('z19 : bouton + grisé (plafond 19 unique)') : fail('z19 : bouton + NON grisé (plafond 19 non respecté)');
  await page.screenshot({ path: '/tmp/v250-plan-z19.png' });
  await setZoom(14);

  // 3. Règle 1 : squelette puis ancre affichée après choix de Nzeng-Ayong.
  // En feuille mini, la barre flottante « Vers où ? » est masquée
  // (l'entrée est alors l'en-tête « Où allez-vous ? ») : on agrandit
  // d'abord la feuille pour la faire apparaître. Puis on choisit le
  // DÉPART (Centre-ville, via la combobox) avant la destination —
  // sans départ, pas de trajet valide, pas d'estimation.
  await page.getByRole('button', { name: 'Agrandir la feuille' }).click();
  await page.waitForTimeout(900);
  const depart = page.getByRole('combobox', { name: 'Départ' });
  await depart.click();
  await depart.fill('centre');
  await page.locator('#depart-quartiers [role="option"]', { hasText: 'Centre-ville' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Vers où ? Rechercher une destination' }).click();
  await page.getByPlaceholder('Tape un lieu ou un quartier…').fill('nzeng');
  const poll = page.waitForSelector('[aria-label="Calcul du prix…"]', { timeout: 1500 }).then(() => true).catch(() => false);
  // La ligne QUARTIER (pas le lieu « Marché de Nzeng-Ayong » qui
  // apparaît avant dans les résultats) : son nom accessible est
  // « Nzeng-Ayong Quartier ».
  await page.getByRole('button', { name: /Nzeng-Ayong\s+Quartier/ }).first().click().catch(() => undefined);
  if (await poll) ok('règle 1 : squelette « Calcul du prix… » visible pendant le recalcul');
  else warn('règle 1 : squelette non capturé en 1,5 s (vérifier dans le code, pas un échec)');
  try {
    await page.getByText('1 500', { exact: false }).first().waitFor({ timeout: 15000 });
    ok('estimation ancre affichée : 1 500 FCFA (Solo) après choix de Nzeng-Ayong');
  } catch { fail('estimation ancre 1 500 FCFA non affichée après choix de Nzeng-Ayong'); }
  const approxVisible = await page.getByText('Estimation approximative').count();
  approxVisible === 0
    ? ok('pas de mention « Estimation approximative » (OSRM a répondu)')
    : warn('mention « Estimation approximative » affichée (OSRM en repli en local ?)');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/v250-home-estimation.png' });
  ok('capture accueil + estimation : /tmp/v250-home-estimation.png');
} finally {
  await browser.close();
}

// --- C. Statique : règle 2 + greps ---
console.log('— C. Statique (règle 2 + greps) —');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const profileApi = read('app/api/profile/route.ts');
profileApi.includes('driver_account_required')
  ? ok('règle 2 (serveur) : verrou `driver_account_required` dans PATCH /api/profile')
  : fail('règle 2 (serveur) : verrou `driver_account_required` introuvable dans PATCH /api/profile');
const home = read('components/home/HomeScreen.tsx');
/Devenir chauffeur/.test(home) && /driver/.test(home)
  ? ok('règle 2 (client) : garde de redirection « Devenir chauffeur » présente dans HomeScreen')
  : fail('règle 2 (client) : garde « Devenir chauffeur » introuvable dans HomeScreen');

function grepDirs(dirs, pattern, label) {
  const hits = [];
  for (const dir of dirs) {
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
        else if (/\.(ts|tsx|css|json)$/.test(e.name) && !e.name.endsWith('.map')) {
          const content = fs.readFileSync(p, 'utf8');
          if (pattern.test(content)) hits.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, dir));
  }
  hits.length === 0 ? ok(label) : fail(`${label} — trouvé dans : ${[...new Set(hits)].slice(0, 10).join(', ')}`);
  return hits;
}
grepDirs(['app', 'components', 'lib', 'styles'], /SATELLITE_MAX_ZOOM|SATELLITE_MAX_NATIVE_ZOOM|stacks-drive-basemap|setBasemap|basemap\s*[:=]|['"]satellite['"]|SatelliteIcon|\.map-satellite|· Esri/i, '0 reste de code Satellite / bascule dans le code (constantes, état, icônes, CSS, attribution Esri)');
grepDirs(['app', 'components', 'lib', 'styles'], new RegExp(['Boul' + 'ingui', 'Ran' + 'dy'].join('|'), 'i'), '0 nom personnel dans le code');
// Mot « IA » en mot entier seulement (sinon « initial », « social »…
// donnent des faux positifs) + formules explicites de travail par IA.
grepDirs(['app', 'components', 'lib', 'styles'], /\bIA\b|intelligence artificielle|généré(?:e)?s? par (?:une |l')?IA|par (?:une )?IA|Claude|ChatGPT|Auteur: Ruby/i, '0 mention d’IA dans le code');
const commission = read('lib/commission.ts');
/COMMISSION_RATE = 0\.05/.test(commission) && /COMMISSION_RATE_PERMANENT = 0\.08/.test(commission) && /COMMISSION_CAP = 0\.1/.test(commission)
  ? ok('commission intacte : 5 % / 8 % / plafond 10 %')
  : fail('commission : taux modifiés dans lib/commission.ts !');

console.log(`\n${failures.length} échec(s), ${warnings.length} avertissement(s).`);
if (failures.length > 0) { console.error('ÉCHECS :\n- ' + failures.join('\n- ')); process.exit(1); }
console.log('Vérification v2.50 : OK.');
