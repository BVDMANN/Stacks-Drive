#!/usr/bin/env node
/** Vérification fonctionnelle du lot v2.43 (POI : grands lieux, bars,
 *  grands restaurants).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v243.mjs
 * Contrôle, dans un vrai Chromium (390×844) :
 *  1. Comptages par zoom en Plan : z14 = 48 pictogrammes standard,
 *     0 dense ; z15 = 59 pictogrammes, 47 libellés visibles (les 11
 *     denses n'ont pas encore de libellé, le Lycée est masqué par la
 *     règle OSM) ; z16 = 57 libellés (Palais + Lycée masqués) ;
 *     z17 = 54 libellés (Palais, Lycée, Park Inn, Rond-Point,
 *     Institut masqués).
 *  2. Satellite z17 : les 59 libellés s'affichent (rien n'est masqué).
 *  3. Bascule Satellite → Plan : la règle OSM se réapplique
 *     immédiatement (sans attendre un changement de zoom).
 *  4. Clic sur un nouveau lieu (Palais des Sports, puis Roma
 *     Restaurant & Hotel après déplacement vers Louis) : la
 *     mini-carte d'info s'ouvre avec le bon nom et la bonne catégorie.
 *  5. Règle 1 (spot-check) : squelette de prix visible pendant le
 *     recalcul (départ Nzeng-Ayong → Glass).
 * Les tuiles ne se chargent pas dans le navigateur de la VM
 * (limitation réseau connue) : les doublons OSM eux-mêmes ont été
 * vérifiés par curl (32 tuiles z15–z17 lues visuellement) — ici on
 * vérifie que le DOM masque bien les libellés Drive attendus.
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

const NEW_STANDARD = ['Palais des Sports', 'Rond-Point de la Démocratie', 'Institut Français du Gabon', 'Lycée National Léon Mba', 'Park Inn by Radisson'];
const NEW_DENSE = ['Roma Restaurant & Hotel', 'Bantu Restaurant', 'Le Wap', 'Restaurant Okande', 'Amaya Restaurant', 'D’Ici et D’Ailleurs', 'L’Emir', 'Le Phare Du Large', 'L’Odika', 'Yoka Lounge', 'Luxury Lounge'];
// Libellés Drive masqués en Plan par la règle OSM (osmLabelMinZoom).
const MASKED_AT_15 = ['Lycée National Léon Mba'];
const MASKED_AT_16 = ['Lycée National Léon Mba', 'Palais des Sports'];
const MASKED_AT_17 = ['Lycée National Léon Mba', 'Palais des Sports', 'Park Inn by Radisson', 'Rond-Point de la Démocratie', 'Institut Français du Gabon'];

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
    // État des marqueurs POI dans le DOM : nom, dense ou non, libellé
    // visible (style calculé) ou masqué (classe label-osm / seuil).
    const poiState = async () =>
      page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll('.map-poi-marker')) {
          const label = el.querySelector('.map-poi-label');
          out.push({
            name: label ? label.textContent.trim() : '',
            dense: el.classList.contains('dense'),
            labelOsm: el.classList.contains('label-osm'),
            labelVisible: label ? getComputedStyle(label).display !== 'none' : false,
          });
        }
        return out;
      });
    async function poiStable() {
      let prev = JSON.stringify(await poiState());
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(400);
        const cur = JSON.stringify(await poiState());
        if (cur === prev) return JSON.parse(cur);
        prev = cur;
      }
      return JSON.parse(prev);
    }
    async function setZoom(target) {
      // Zoom à la molette, pas au clavier : le clic de focus au centre
      // de la carte peut tomber sur un marqueur (ex. Palais des
      // Sports, proche du centre) et ouvrir sa mini-carte, qui vole
      // ensuite le focus clavier — les touches '+' ne zoomaient plus
      // (échec constaté au premier passage du script). La molette
      // zoome sans clic ni focus ; on la place au centre de la carte
      // pour garder le même centre (Leaflet zoome autour du pointeur).
      await page.mouse.move(195, 400);
      await page.waitForTimeout(200);
      while (zoom < target) {
        await page.mouse.wheel(0, -120);
        zoom++;
        await page.waitForTimeout(700);
      }
      while (zoom > target) {
        await page.mouse.wheel(0, 120);
        zoom--;
        await page.waitForTimeout(700);
      }
      return poiStable();
    }
    function checkCounts(state, target, expMarkers, expDense, expLabels, expMasked) {
      const markers = state.length;
      const dense = state.filter((p) => p.dense).length;
      const labels = state.filter((p) => p.labelVisible).map((p) => p.name);
      const masked = state.filter((p) => p.labelOsm).map((p) => p.name);
      let good = true;
      if (markers !== expMarkers) { fail(`Plan z${target} : ${markers} pictogrammes (attendu ${expMarkers})`); good = false; }
      if (dense !== expDense) { fail(`Plan z${target} : ${dense} pictogrammes denses (attendu ${expDense})`); good = false; }
      if (labels.length !== expLabels) { fail(`Plan z${target} : ${labels.length} libellés visibles (attendu ${expLabels})`); good = false; }
      if (!sameSet(masked, expMasked)) { fail(`Plan z${target} : libellés masqués OSM = ${masked.join(', ') || 'aucun'} (attendu ${expMasked.join(', ') || 'aucun'})`); good = false; }
      if (good) ok(`Plan z${target} : ${markers} pictogrammes (dont ${dense} denses), ${labels.length} libellés, masqués OSM : ${masked.join(', ') || 'aucun'}`);
      return { labels, masked };
    }

    // --- 1. Plan, zooms 14 / 15 / 16 / 17 ---
    let state = await setZoom(14);
    const missing14 = NEW_STANDARD.filter((n) => !state.some((p) => p.name === n));
    if (missing14.length === 0) ok('z14 : les 5 nouveaux lieux standard sont présents');
    else fail(`z14 : nouveaux lieux standard absents : ${missing14.join(', ')}`);
    const denseAt14 = state.filter((p) => p.dense);
    if (denseAt14.length === 0) ok('z14 : aucun pictogramme dense (bars/restaurants cachés — tier resserré)');
    else fail(`z14 : ${denseAt14.length} pictogrammes denses affichés trop tôt : ${denseAt14.map((p) => p.name).join(', ')}`);
    checkCounts(state, 14, 48, 0, 0, []);
    await page.screenshot({ path: '/tmp/v243-plan-z14.png' });

    state = await setZoom(15);
    const missingDense = NEW_DENSE.filter((n) => !state.some((p) => p.name === n));
    if (missingDense.length === 0) ok('z15 : les 11 bars/restaurants sont présents (pictogrammes seuls)');
    else fail(`z15 : bars/restaurants absents : ${missingDense.join(', ')}`);
    const denseLabels15 = state.filter((p) => p.dense && p.labelVisible);
    if (denseLabels15.length === 0) ok('z15 : aucun libellé dense (libellés denses dès z16 seulement)');
    else fail(`z15 : libellés denses affichés trop tôt : ${denseLabels15.map((p) => p.name).join(', ')}`);
    checkCounts(state, 15, 59, 11, 47, MASKED_AT_15);
    await page.screenshot({ path: '/tmp/v243-plan-z15.png' });

    state = await setZoom(16);
    checkCounts(state, 16, 59, 11, 57, MASKED_AT_16);
    await page.screenshot({ path: '/tmp/v243-plan-z16.png' });

    state = await setZoom(17);
    checkCounts(state, 17, 59, 11, 54, MASKED_AT_17);
    await page.screenshot({ path: '/tmp/v243-plan-z17.png' });

    // --- 2. Satellite z17 : les 59 libellés ---
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();
    state = await poiStable();
    const satLabels = state.filter((p) => p.labelVisible).map((p) => p.name);
    const satMasked = state.filter((p) => p.labelOsm).map((p) => p.name);
    if (satLabels.length === 59 && satMasked.length === 0) ok('Satellite z17 : 59 libellés visibles, aucun masqué (tuiles Esri sans libellé)');
    else fail(`Satellite z17 : ${satLabels.length} libellés visibles (attendu 59), masqués : ${satMasked.join(', ') || 'aucun'}`);
    await page.screenshot({ path: '/tmp/v243-satellite-z17.png' });

    // --- 3. Bascule retour Plan : règle réappliquée immédiatement ---
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    state = await poiStable();
    const backMasked = state.filter((p) => p.labelOsm).map((p) => p.name);
    if (sameSet(backMasked, MASKED_AT_17)) ok('Retour Plan z17 : les 5 libellés OSM sont de nouveau masqués, sans attendre un zoom');
    else fail(`Retour Plan z17 : masqués = ${backMasked.join(', ') || 'aucun'} (attendu ${MASKED_AT_17.join(', ')})`);

    // --- 4a. Clic sur un nouveau lieu standard (Palais des Sports) ---
    await setZoom(16);
    const palais = page.locator('.map-poi-marker', { hasText: 'Palais des Sports' }).first();
    try {
      await palais.click({ timeout: 8000 });
      await page.waitForTimeout(800);
      const cardText = await page.locator('body').innerText();
      if (cardText.includes('Palais des Sports') && cardText.includes('Stade')) ok('clic Palais des Sports : mini-carte d\'info ouverte (nom + catégorie Stade)');
      else fail('clic Palais des Sports : mini-carte sans le nom ou sans la catégorie attendue');
      await page.screenshot({ path: '/tmp/v243-poi-palais.png' });
    } catch (e) { fail(`clic Palais des Sports impossible : ${e.message}`); }

    // --- 4b. Clic sur un restaurant dense (Roma, quartier Louis) ---
    // Déplacer la carte vers le nord-ouest (Louis) par glisser : le
    // centre d'ouverture est le Centre-ville, Louis est hors champ.
    // On glisse à z14 (1 px ≈ 9,5 m : on couvre vite les ~2,7 km),
    // puis on remonte à z16 et on ajuste jusqu'à ce que le marqueur
    // soit à l'écran.
    // On ferme d'abord la mini-carte du Palais (bouton « Fermer la
    // carte du lieu ») : sinon elle recouvre la feuille et bloque les
    // clics suivants. Puis deux grands glissers à z14 (1 px ≈ 9,5 m :
    // on couvre vite les ~2,7 km), remontée à z16 et ajustements
    // directionnels jusqu'à ce que le marqueur soit à l'écran.
    await page.getByRole('button', { name: 'Fermer la carte du lieu' }).click();
    await page.waitForTimeout(300);
    await setZoom(14);
    // Deux grands glissers à z14 (1 px ≈ 9,5 m) : ~2,6 km vers
    // l'ouest et ~3 km vers le nord — on arrive près de Louis.
    for (let i = 0; i < 2; i++) {
      await page.mouse.move(195, 400);
      await page.mouse.down();
      await page.mouse.move(330, 560, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
    async function bringIntoView(locator) {
      for (let i = 0; i < 10; i++) {
        const box = await locator.boundingBox().catch(() => null);
        if (box && box.x >= 0 && box.x <= 360 && box.y >= 60 && box.y <= 700) return true;
        if (!box) return false;
        // Glisser le contenu dans le sens opposé au déplacement de vue
        // voulu : marqueur à l'ouest → on tire le contenu vers l'est.
        let dx = 0;
        let dy = 0;
        if (box.x < 0) dx = 135;
        else if (box.x > 360) dx = -135;
        if (box.y < 60) dy = 140;
        else if (box.y > 700) dy = -140;
        if (dx === 0 && dy === 0) return true;
        await page.mouse.move(195, 400);
        await page.mouse.down();
        await page.mouse.move(195 + dx, 400 + dy, { steps: 12 });
        await page.mouse.up();
        await page.waitForTimeout(700);
      }
      return false;
    }
    const roma = page.locator('.map-poi-marker', { hasText: 'Roma Restaurant & Hotel' }).first();
    await setZoom(16);
    if (await bringIntoView(roma)) {
      try {
        await roma.click({ timeout: 8000 });
        await page.waitForTimeout(800);
        const bodyText = await page.locator('body').innerText();
        if (bodyText.includes('Roma Restaurant & Hotel') && bodyText.includes('Restaurant')) ok('clic Roma Restaurant & Hotel : mini-carte d\'info ouverte (nom + catégorie Restaurant)');
        else fail('clic Roma : mini-carte sans le nom ou sans la catégorie attendue');
        await page.screenshot({ path: '/tmp/v243-poi-roma.png' });
      } catch (e) { fail(`clic Roma Restaurant & Hotel impossible : ${e.message}`); }
    } else {
      fail('Roma Restaurant & Hotel : marqueur jamais amené à l\'écran (glissers insuffisants)');
      await page.screenshot({ path: '/tmp/v243-poi-roma-manque.png' });
    }
    // Fermer la mini-carte du lieu (Roma ou Palais) avant la suite :
    // sinon elle recouvre la feuille et bloque le clic sur #depart.
    await page.getByRole('button', { name: 'Fermer la carte du lieu' }).click().catch(() => undefined);
    await page.waitForTimeout(300);

    // --- 5. Règle 1 (spot-check) : squelette pendant le recalcul ---
    await page.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await page.waitForTimeout(700);
    const depart = page.locator('#depart');
    await depart.click();
    await page.locator('#depart-quartiers').waitFor({ timeout: 5000 });
    await depart.fill('nzeng');
    await page.waitForTimeout(200);
    await page.locator('#depart-quartiers [role="option"]', { hasText: 'Nzeng-Ayong' }).click();
    await page.waitForTimeout(200);
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
  console.log('Vérification v2.43 : OK.');
}

main().catch((err) => { console.error(`\nERREUR : ${err.message}`); process.exit(1); });
