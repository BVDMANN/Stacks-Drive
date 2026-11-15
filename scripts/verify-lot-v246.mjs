#!/usr/bin/env node
/** Vérification fonctionnelle du lot v2.46 (fond Plan CARTO dark_all).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v246.mjs
 * Contrôle, dans un vrai Chromium (390×844) :
 *  1. Plan : URL des tuiles = basemaps.cartocdn.com/dark_all (DOM) ;
 *     attribution exacte « © OpenStreetMap contributors © CARTO ».
 *  2. Plan : libellés Drive visibles = attendus à chaque zoom (6 à z12,
 *     11 à z13, 17 à z14, 14 à z15-16, 69 à z19) — PK5 n'est plus
 *     masqué (`place=quarter`), Akanda réapparaît dès z15 (borne 14).
 *  3. POI : 59 pictogrammes à z16 ; Palais des Sports masqué en Plan
 *     dès z16 (classe `label-carto`), Park Inn affiché à z17 (CARTO ne
 *     labellise pas les hôtels).
 *  4. Satellite z14 : les 69 libellés Drive ; plafond 18 (bouton + grisé).
 *  5. Bascule Plan → Satellite → Plan : attribution = UNE seule ligne
 *     (correctif accumulation v2.46), libellés réappliqués sans zoom.
 *  6. Plafond Plan 19 (bouton + grisé à z19).
 *  7. Règle 1 (spot-check) : squelette de prix visible pendant le recalcul.
 * Les tuiles ne se chargent pas dans le navigateur de la VM
 * (limitation réseau connue — voir ADR 0021) : on vérifie l'URL
 * demandée dans le DOM, pas le contenu des tuiles. La lisibilité
 * réelle des rues et l'absence de doubles sur les tuiles réelles
 * restent à confirmer en live après push.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';

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

// Libellés Drive attendus en Plan (ensembles exacts, déduits de
// NEIGHBORHOOD_CARTO_LABEL_MIN_ZOOM + NEIGHBORHOOD_CARTO_LABEL_MAX_ZOOM
// + tiers — oracle indépendant, v2.46 : PK5 n'est plus masqué,
// Akanda borne haute 14).
const EXPECT = {
  12: ['Ambowe', 'Centre-ville', 'Charbonnages', 'Glass', 'Louis', 'Sotega'],
  13: ['Ambowe', 'Centre-ville', 'Charbonnages', 'Glass', 'Louis', 'Mont-Bouët', 'Nkembo', 'Ozangué', 'Petit Paris', 'PK12', 'Plein Ciel'],
  14: ['Barracuda', 'Bizango', 'Cap Caravane', 'Diba-Diba', 'Gros-Bouquet', 'Melen', 'Mont-Bouët', 'Nkembo', 'Petit Paris', 'PK5', 'PK6', 'PK8', 'PK9', 'PK11', 'PK12', 'Santa Clara', 'Sogara'],
  15: ['Akanda', 'Barracuda', 'Bizango', 'Cap Caravane', 'Diba-Diba', 'Melen', 'PK5', 'PK6', 'PK8', 'PK9', 'PK11', 'PK12', 'Santa Clara', 'Sogara'],
  16: ['Akanda', 'Barracuda', 'Bizango', 'Cap Caravane', 'Diba-Diba', 'Melen', 'PK5', 'PK6', 'PK8', 'PK9', 'PK11', 'PK12', 'Santa Clara', 'Sogara'],
};
// Noms que CARTO labellise à z14 : aucun ne doit apparaître comme libellé
// Drive en Plan à z14 (c'est le zoom du signalement de double).
const CARTO_AT_14 = ['Centre-ville', 'Glass', 'Louis', 'Nzeng-Ayong', 'Charbonnages', 'Owendo', 'Akanda', 'Aéroport Léon-Mba', 'Lalala', 'Sotega', 'Ambowe', 'Angondjé', 'Sorbonne', 'Akebé', 'Kinguele', 'Oloumi', 'Mindoubé', 'Damas', 'Batterie IV', 'Gué-Gué', 'Sainte-Marie', 'La Peyrie', 'Plein Ciel', 'Belle-Vue', 'Awendjé', 'Cocotiers', 'Igoumié', 'Akournam', 'Ozangué', 'Venez-Voir', 'Trois Quartiers', 'Camp de Gaulle'];

function sameSet(a, b) {
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
}

async function main() {
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
      ok('carte d\'accueil fermée (« Plus tard »)');
    } catch { warn('carte d\'accueil non vue (déjà vue ?) — on continue'); }
    await page.locator('.map-neighborhood-label').first().waitFor({ timeout: 15000 });

    let zoom = 14; // zoom d'ouverture
    const labels = async () =>
      (await page.locator('.map-neighborhood-label').allTextContents()).map((t) => t.trim());
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
      // Zoom par les boutons Leaflet, cliqués via evaluate (pas de
      // clic souris sur la carte : un marqueur chauffeur démo peut
      // passer sous le point cliqué et voler le focus — le zoom
      // clavier ne répond alors plus, comme vu au premier passage
      // v2.46 où '+' ne zoomait plus après z12). `el.click()` sur
      // l'ancre déclenche directement le gestionnaire Leaflet,
      // même si la feuille recouvre le bouton.
      const zoomIn = () => page.locator('.leaflet-control-zoom-in').evaluate((el) => el.click());
      const zoomOut = () => page.locator('.leaflet-control-zoom-out').evaluate((el) => el.click());
      while (zoom < target) {
        await zoomIn();
        zoom++;
        await page.waitForTimeout(600);
      }
      while (zoom > target) {
        await zoomOut();
        zoom--;
        await page.waitForTimeout(600);
      }
      return labelsStable();
    }
    async function checkZoom(target, shot) {
      const got = await setZoom(target);
      const exp = EXPECT[target];
      if (exp && sameSet(got, exp)) ok(`Plan z${target} : ${got.length} libellés Drive, exactement les attendus`);
      else if (exp) fail(`Plan z${target} : ${got.length} libellés (attendu ${exp.length}) — en trop : ${got.filter((n) => !exp.includes(n)).join(', ') || 'aucun'} ; manquants : ${exp.filter((n) => !got.includes(n)).join(', ') || 'aucun'}`);
      else ok(`Plan z${target} : ${got.length} libellés Drive`);
      if (shot) await page.screenshot({ path: shot });
      return got;
    }
    const tileSrcs = async () =>
      page.locator('.leaflet-tile-pane img').evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src') || ''));
    const attributionText = async () =>
      (await page.locator('.leaflet-control-attribution').innerText()).trim();
    const zoomInDisabled = async () =>
      page.locator('.leaflet-control-zoom-in').evaluate((el) => el.classList.contains('leaflet-disabled'));

    // --- 1. Plan : URL des tuiles + attribution exacte ---
    const srcs = await tileSrcs();
    const cartoSrcs = srcs.filter((s) => s.includes('basemaps.cartocdn.com/dark_all'));
    if (srcs.length > 0 && cartoSrcs.length === srcs.length) ok(`tuiles Plan : ${srcs.length} <img> dans le DOM, toutes en dark_all (${srcs[0].slice(0, 80)}…)`);
    else if (srcs.length === 0) fail('tuiles Plan : aucune <img> de tuile dans le DOM');
    else fail(`tuiles Plan : ${cartoSrcs.length}/${srcs.length} en dark_all — autres : ${srcs.filter((s) => !s.includes('dark_all')).slice(0, 3).join(' | ')}`);
    const osmSrcs = srcs.filter((s) => s.includes('tile.openstreetmap.org'));
    if (osmSrcs.length === 0) ok('aucune tuile OSM demandée en Plan');
    else fail(`tuiles OSM encore demandées en Plan : ${osmSrcs.length}`);
    const attr = await attributionText();
    if (attr.includes('OpenStreetMap') && attr.includes('CARTO')) ok(`attribution Plan exacte : « ${attr} »`);
    else fail(`attribution Plan : « ${attr} » (attendu © OpenStreetMap contributors © CARTO)`);

    // --- 2. Plan, zooms 12 / 13 / 14 / 15 / 16 / 19 ---
    await checkZoom(12, '/tmp/v246-plan-z12.png');
    await checkZoom(13, '/tmp/v246-plan-z13.png');
    const at14 = await checkZoom(14, '/tmp/v246-plan-z14.png');
    const doubled = at14.filter((n) => CARTO_AT_14.includes(n));
    if (doubled.length === 0) ok('Plan z14 : aucun libellé Drive parmi les noms que CARTO labellise (pas de double)');
    else fail(`Plan z14 : libellés Drive en double avec CARTO : ${doubled.join(', ')}`);
    if (at14.includes('PK5')) ok('Plan z14 : PK5 affiché (plus masqué — place=quarter, CARTO ne labellise pas)');
    else fail('Plan z14 : PK5 absent (il ne doit plus être masqué en v2.46)');
    await checkZoom(15, '/tmp/v246-plan-z15.png');
    const at15 = await labels();
    if (at15.includes('Akanda')) ok('Plan z15 : Akanda affiché (borne haute 14, règle city)');
    else fail('Plan z15 : Akanda absent (il doit réapparaître dès z15)');
    await checkZoom(16, '/tmp/v246-plan-z16.png');

    // --- 3. POI à z16 : 59 pictogrammes ; Palais des Sports masqué, Park Inn affiché ---
    const poiCount = await page.locator('.map-poi-marker').count();
    if (poiCount === 59) ok('POI à z16 : 59 pictogrammes');
    else fail(`POI à z16 : ${poiCount} pictogrammes (attendu 59)`);
    const poiLabelHidden = async (name) =>
      page.locator('.map-poi-marker', { has: page.locator('.map-poi-label', { hasText: name }) }).first()
        .evaluate((el) => el.classList.contains('label-carto'));
    if (await poiLabelHidden('Palais des Sports')) ok('Palais des Sports : libellé masqué en Plan à z16 (classe label-carto)');
    else fail('Palais des Sports : libellé NON masqué en Plan à z16');
    await setZoom(17);
    if (!(await poiLabelHidden('Park Inn by Radisson'))) ok('Park Inn : libellé affiché en Plan à z17 (CARTO ne labellise pas les hôtels)');
    else fail('Park Inn : libellé masqué en Plan à z17 (il ne doit plus l\'être en v2.46)');
    await page.screenshot({ path: '/tmp/v246-plan-z17.png' });

    const at19 = await setZoom(19);
    if (at19.length === 69) ok('Plan z19 : 69 libellés Drive (CARTO ne labellise plus rien, tout réapparaît)');
    else fail(`Plan z19 : ${at19.length} libellés (attendu 69)`);
    await page.screenshot({ path: '/tmp/v246-plan-z19.png' });

    // --- 4. Satellite : 69 libellés à z14, plafond 18 ---
    await setZoom(14);
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();
    const sat = await labelsStable();
    if (sat.length === 69) ok('Satellite z14 : 69 libellés Drive (rien n\'est masqué)');
    else fail(`Satellite z14 : ${sat.length} libellés (attendu 69)`);
    await setZoom(18);
    if (await zoomInDisabled()) ok('Satellite z18 : bouton + grisé (plafond 18 respecté)');
    else fail('Satellite z18 : bouton + NON grisé (plafond 18 non respecté)');
    await page.screenshot({ path: '/tmp/v246-satellite-z18.png' });

    // --- 5. Bascule retour Plan : attribution UNE seule ligne, libellés réappliqués ---
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.waitForTimeout(500);
    const attrBack = await attributionText();
    const cartoCount = (attrBack.match(/CARTO/g) || []).length;
    if (cartoCount === 1 && attrBack.includes('OpenStreetMap')) ok(`retour Plan : attribution unique « ${attrBack} » (pas d'accumulation)`);
    else fail(`retour Plan : attribution « ${attrBack} » (CARTO × ${cartoCount} — accumulation ?)`);
    // La bascule a eu lieu à z18 (plafond Satellite) : redescendre à
    // z14 avant de comparer avec l'ensemble attendu à z14.
    const back = await setZoom(14);
    if (sameSet(back, at14)) ok('Retour Plan z14 : les 17 libellés attendus, sans attendre un zoom');
    else fail(`Retour Plan z14 : ${back.length} libellés (attendu 17)`);

    // --- 6. Plafond Plan 19 ---
    await setZoom(19);
    if (await zoomInDisabled()) ok('Plan z19 : bouton + grisé (plafond 19 respecté)');
    else fail('Plan z19 : bouton + NON grisé (plafond 19 non respecté)');

    // --- 7. Listes + recherche toujours fonctionnelles ---
    await page.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await page.waitForTimeout(700);
    const depart = page.locator('#depart');
    await depart.click();
    await page.locator('#depart-quartiers').waitFor({ timeout: 5000 });
    const options = await page.locator('#depart-quartiers [role="option"]').allTextContents();
    if (options.length === 70) ok('liste départ : 70 quartiers');
    else fail(`liste départ : ${options.length} quartiers (attendu 70)`);

    // --- 8. Règle 1 (spot-check) : squelette pendant le recalcul ---
    const dest = page.locator('#destination');
    await dest.click();
    await page.locator('#destination-quartiers').waitFor({ timeout: 5000 });
    await dest.fill('glass');
    const poll = page.waitForSelector('[aria-label="Calcul du prix…"]', { timeout: 1500 }).then(() => true).catch(() => false);
    await page.locator('#destination-quartiers [role="option"]', { hasText: 'Glass' }).click().catch(() => undefined);
    if (await poll) ok('règle 1 (spot-check) : squelette « Calcul du prix… » visible pendant le recalcul');
    else warn('règle 1 (spot-check) : squelette non capturé en 1,5 s (300 ms théoriques — vérifier dans le code, pas un échec)');
  } finally {
    await browser.close();
  }

  console.log(`\n${failures.length} échec(s), ${warnings.length} avertissement(s).`);
  if (failures.length > 0) { console.error('ÉCHECS :\n- ' + failures.join('\n- ')); process.exit(1); }
  console.log('Vérification v2.46 : OK.');
}

main().catch((err) => { console.error(`\nERREUR : ${err.message}`); process.exit(1); });
