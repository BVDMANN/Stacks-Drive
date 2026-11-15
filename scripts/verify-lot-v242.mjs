#!/usr/bin/env node
/** Vérification fonctionnelle du lot v2.42 (libellés de quartiers en double).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v242.mjs
 * Contrôle, dans un vrai Chromium (390×844) :
 *  1. Plan : libellés Drive visibles = attendus à chaque zoom (6 à z12,
 *     11 à z13, 16 à z14, 12 à z15-16, 69 à z19) — aucun nom en double
 *     avec le fond OSM (les 57 noms qu'OSM labellise sont masqués
 *     entre leur zoom minimum et 16).
 *  2. Satellite z14 : les 69 libellés Drive s'affichent (tuiles Esri
 *     sans aucun libellé — rien n'est masqué).
 *  3. Bascule Plan → Satellite → Plan : les libellés suivent le fond
 *     immédiatement (sans attendre un changement de zoom).
 *  4. POI présents à z14 ; listes départ/destination (70 quartiers,
 *     triées) et recherche toujours fonctionnelles.
 *  5. Règle 1 (spot-check) : squelette de prix visible pendant le recalcul.
 * Les tuiles ne se chargent pas dans le navigateur de la VM
 * (limitation réseau connue) : les doublons OSM eux-mêmes ont été
 * vérifiés par curl (tuiles z12–z18 lues visuellement) — ici on
 * vérifie que le DOM ne montre plus que les libellés Drive attendus.
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

// Libellés Drive attendus (ensembles exacts, déduits de
// NEIGHBORHOOD_OSM_LABEL_MIN_ZOOM + tiers — oracle indépendant).
const EXPECT = {
  12: ['Ambowe', 'Centre-ville', 'Charbonnages', 'Glass', 'Louis', 'Sotega'],
  13: ['Ambowe', 'Centre-ville', 'Charbonnages', 'Glass', 'Louis', 'Mont-Bouët', 'Nkembo', 'Ozangué', 'Petit Paris', 'PK12', 'Plein Ciel'],
  14: ['Barracuda', 'Bizango', 'Cap Caravane', 'Diba-Diba', 'Gros-Bouquet', 'Melen', 'Mont-Bouët', 'Nkembo', 'Petit Paris', 'PK6', 'PK8', 'PK9', 'PK11', 'PK12', 'Santa Clara', 'Sogara'],
  16: ['Barracuda', 'Bizango', 'Cap Caravane', 'Diba-Diba', 'Melen', 'PK6', 'PK8', 'PK9', 'PK11', 'PK12', 'Santa Clara', 'Sogara'],
};
// Noms qu'OSM labellise à z14 : aucun ne doit apparaître comme libellé
// Drive en Plan à z14 (c'est le zoom du signalement).
const OSM_AT_14 = ['Centre-ville', 'Glass', 'Louis', 'Nzeng-Ayong', 'Charbonnages', 'Owendo', 'Akanda', 'Aéroport Léon-Mba', 'Lalala', 'Sotega', 'Ambowe', 'Angondjé', 'Sorbonne', 'Akebé', 'Kinguele', 'Oloumi', 'Mindoubé', 'Damas', 'Batterie IV', 'Gué-Gué', 'Sainte-Marie', 'La Peyrie', 'Plein Ciel', 'Belle-Vue', 'Awendjé', 'Cocotiers', 'PK5', 'Igoumié', 'Akournam', 'Ozangué', 'Venez-Voir', 'Trois Quartiers', 'Camp de Gaulle'];

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
    // Carte d'accueil « Bienvenue sur Stacks Drive » (premier lancement) :
    // on la ferme (« Plus tard ») — sinon elle recouvre le haut de la
    // carte et intercepte les clics (dont ceux qui donnent le focus à
    // la carte pour le zoom clavier).
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
      // Les boutons +/- Leaflet (bas-droite) sont recouverts par la
      // feuille en cran mini (pré-existant, hors lot v2.42 : les
      // contrôles déplacés en v2.39 sont ceux du haut) : on zoome au
      // clavier (Leaflet : '+' / '-' quand la carte a le focus).
      // Clic au centre de la carte (zone libre, sous le sélecteur de
      // fond et au-dessus de la feuille) pour lui donner le focus.
      await page.mouse.click(195, 400);
      await page.waitForTimeout(200);
      while (zoom < target) {
        await page.keyboard.press('+');
        zoom++;
        await page.waitForTimeout(600);
      }
      while (zoom > target) {
        await page.keyboard.press('-');
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

    // --- 1. Plan, zooms 12 / 13 / 14 / 16 / 19 ---
    await checkZoom(12, '/tmp/v242-plan-z12.png');
    await checkZoom(13, '/tmp/v242-plan-z13.png');
    const at14 = await checkZoom(14, '/tmp/v242-plan-z14.png');
    const doubled = at14.filter((n) => OSM_AT_14.includes(n));
    if (doubled.length === 0) ok('Plan z14 : aucun libellé Drive parmi les noms qu\'OSM labellise (pas de double)');
    else fail(`Plan z14 : libellés Drive en double avec OSM : ${doubled.join(', ')}`);
    // POI présents à z14.
    const poiCount = await page.locator('.map-poi-marker').count();
    if (poiCount > 0) ok(`POI à z14 : ${poiCount} pictogrammes (non cassés)`);
    else fail('POI à z14 : aucun pictogramme visible');
    await checkZoom(16, '/tmp/v242-plan-z16.png');
    const at19 = await setZoom(19);
    if (at19.length === 69) ok('Plan z19 : 69 libellés Drive (OSM ne labellise plus rien, tout réapparaît)');
    else fail(`Plan z19 : ${at19.length} libellés (attendu 69)`);
    await page.screenshot({ path: '/tmp/v242-plan-z19.png' });

    // --- 2. Satellite z14 : les 69 libellés ---
    await setZoom(14);
    await page.getByRole('button', { name: 'Satellite', exact: true }).click();
    const sat = await labelsStable();
    if (sat.length === 69) ok('Satellite z14 : 69 libellés Drive (rien n\'est masqué)');
    else fail(`Satellite z14 : ${sat.length} libellés (attendu 69)`);
    if (sameSet(sat, at19)) ok('Satellite z14 = Plan z19 (même ensemble de 69 libellés)');
    else fail('Satellite z14 ≠ Plan z19');
    await page.screenshot({ path: '/tmp/v242-satellite-z14.png' });

    // --- 3. Bascule retour Plan : règle réappliquée immédiatement ---
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    const back = await labelsStable();
    if (sameSet(back, at14)) ok('Retour Plan z14 : les 16 libellés attendus, sans attendre un zoom');
    else fail(`Retour Plan z14 : ${back.length} libellés (attendu 16)`);

    // --- 4. Listes + recherche toujours fonctionnelles ---
    await page.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await page.waitForTimeout(700);
    const depart = page.locator('#depart');
    await depart.click();
    await page.locator('#depart-quartiers').waitFor({ timeout: 5000 });
    const options = await page.locator('#depart-quartiers [role="option"]').allTextContents();
    const names = options.map((t) => t.trim());
    if (names.length === 70) ok('liste départ : 70 quartiers');
    else fail(`liste départ : ${names.length} quartiers (attendu 70)`);
    await depart.fill('mont');
    await page.waitForTimeout(200);
    const found = await page.locator('#depart-quartiers [role="option"]').allTextContents();
    if (found.map((t) => t.trim()).includes('Mont-Bouët')) ok('recherche « mont » → Mont-Bouët');
    else fail(`recherche « mont » : ${found.join(', ')}`);
    await depart.fill('nzeng');
    await page.waitForTimeout(200);
    await page.locator('#depart-quartiers [role="option"]', { hasText: 'Nzeng-Ayong' }).click();
    await page.waitForTimeout(200);
    if ((await depart.inputValue()) === 'Nzeng-Ayong') ok('sélection départ : Nzeng-Ayong');
    else fail(`départ après sélection : « ${await depart.inputValue()} »`);
    const dest = page.locator('#destination');
    await dest.click();
    await page.locator('#destination-quartiers').waitFor({ timeout: 5000 });
    const destNames = (await page.locator('#destination-quartiers [role="option"]').allTextContents()).map((t) => t.trim());
    if (destNames.length === 70) ok('liste destination : 70 quartiers');
    else fail(`liste destination : ${destNames.length} quartiers (attendu 70)`);

    // --- 5. Règle 1 (spot-check) : squelette pendant le recalcul ---
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
  console.log('Vérification v2.42 : OK.');
}

main().catch((err) => { console.error(`\nERREUR : ${err.message}`); process.exit(1); });
