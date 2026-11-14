#!/usr/bin/env node
/** Contrôle visuel ponctuel v2.31 (carte zonée quartier) — /tmp, non versionné.
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node scripts/verify-lot-v231-visual.mjs
 * Contrôle, dans un vrai Chromium :
 *  1. Chargement frais sans géolocalisation : zoom 14, cercle périmètre
 *     or pointillé visible, 69 libellés.
 *  2. Dézoom (bouton −) : zoom 12, 12 libellés ; un cran de plus ne
 *     descend pas sous 12 (minZoom).
 *  3. Bornes : glissers répétés vers l'est — le centre reste dans la zone.
 *  4. Géolocalisation dans la zone (Nzeng-Ayong) : départ calé sur
 *     Nzeng-Ayong, marqueur « Vous êtes ici », carte centrée dessus.
 *  5. « Me localiser » hors zone (Paris) : message « service à
 *     Libreville pour l'instant », carte restée sur Libreville.
 * Captures dans ~/workspace/stacks-drive/captures-carte-zonee-v2.31/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const SHOTS = path.join(process.env.HOME ?? '', 'workspace', 'stacks-drive', 'captures-carte-zonee-v2.31');
fs.mkdirSync(SHOTS, { recursive: true });

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
const ok = (m) => console.log(`  OK  ${m}`);
const fail = (m) => { failures.push(m); console.error(`  FAIL ${m}`); };
const check = (name, cond, detail = '') => (cond ? ok(name) : fail(`${name} — ${detail}`));

// Zoom + centre médian lus depuis les tuiles Esri chargées.
async function tileState(page) {
  return page.evaluate(() => {
    const srcs = [...document.querySelectorAll('.leaflet-tile')].map((i) => i.getAttribute('src') || '');
    const tiles = srcs
      .map((s) => s.match(/\/tile\/(\d+)\/(\d+)\/(\d+)/))
      .filter(Boolean)
      .map((m) => ({ z: +m[1], y: +m[2], x: +m[3] }));
    if (!tiles.length) return null;
    const z = tiles[0].z;
    const xs = tiles.map((t) => t.x).sort((a, b) => a - b);
    const ys = tiles.map((t) => t.y).sort((a, b) => a - b);
    const mx = xs[Math.floor(xs.length / 2)];
    const my = ys[Math.floor(ys.length / 2)];
    const n = 2 ** z;
    const lng = (mx / n) * 360 - 180;
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * my) / n))) * 180) / Math.PI;
    return { z, count: tiles.length, lat: +lat.toFixed(3), lng: +lng.toFixed(3) };
  });
}

async function dismissTutorial(page) {
  try {
    await page.getByRole('dialog', { name: 'Tutoriel passager' }).waitFor({ timeout: 8000 });
    await page.getByRole('button', { name: 'Passer le tutoriel' }).click();
    await page.getByRole('dialog', { name: 'Tutoriel passager' }).waitFor({ state: 'detached', timeout: 5000 });
  } catch { /* déjà vu ou absent */ }
}

async function main() {
  const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
  try {
    // --- 1+2+3. Sans géolocalisation : zoom 14, cercle, dézoom, bornes.
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }});
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fail(`erreur JS : ${e.message}`));
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await dismissTutorial(page);
    await page.locator('.leaflet-container').waitFor({ timeout: 15000 });
    await page.waitForTimeout(3500); // tuiles + repli géo silencieux
    let st = await tileState(page);
    check('chargement frais : zoom 14 (quartier, pas toute la ville)', st?.z === 14, `zoom=${st?.z}`);
    check('chargement frais : centré sur Libreville', st !== null && Math.abs(st.lat - 0.39) < 0.08 && Math.abs(st.lng - 9.454) < 0.08, JSON.stringify(st));
    const circle = await page.locator('.leaflet-overlay-pane path[stroke="#FFD60A"]').count();
    check('cercle périmètre 5 km visible (or pointillé)', circle >= 1, `paths or=${circle}`);
    const labels14 = await page.locator('.map-neighborhood-label').count();
    check('zoom 14 : 69 libellés visibles', labels14 === 69, `${labels14} libellés`);
    await page.screenshot({ path: path.join(SHOTS, '01-ouverture-zoom14.png') });

    await page.locator('.leaflet-control-zoom-out').click();
    await page.waitForTimeout(900);
    await page.locator('.leaflet-control-zoom-out').click();
    await page.waitForTimeout(1200);
    st = await tileState(page);
    check('dézoom : vue ville zoom 12', st?.z === 12, `zoom=${st?.z}`);
    const labels12 = await page.locator('.map-neighborhood-label').count();
    check('zoom 12 : 12 libellés (vue ville propre)', labels12 === 12, `${labels12} libellés`);
    await page.screenshot({ path: path.join(SHOTS, '02-vue-ville-zoom12.png') });

    // minZoom : le bouton − est désactivé à 12, le zoom ne bouge pas.
    const zoomOutDisabled = await page.locator('.leaflet-control-zoom-out').isDisabled();
    check('minZoom : bouton − désactivé au zoom 12', zoomOutDisabled === true, 'bouton toujours actif');
    await page.locator('.leaflet-control-zoom-out').click({ force: true }).catch(() => undefined);
    await page.waitForTimeout(900);
    st = await tileState(page);
    check('minZoom : impossible de descendre sous 12', st?.z === 12, `zoom=${st?.z}`);

    // Bornes : 4 grands glissers vers l'est (la carte devrait rebondir).
    const box = await page.locator('.leaflet-container').boundingBox();
    for (let i = 0; i < 4; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 700, box.y + box.height / 2, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
    st = await tileState(page);
    check('bornes : impossible de défiler hors zone (est)', st !== null && st.lng < 10.0 && st.lng > 9.0 && st.lat > 0.0 && st.lat < 0.9, JSON.stringify(st));
    await page.screenshot({ path: path.join(SHOTS, '03-bornes-apres-glissers.png') });
    await ctx.close();

    // --- 4. Géolocalisation dans la zone (Nzeng-Ayong).
    const ctxIn = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      geolocation: { latitude: 0.43, longitude: 9.47 },
      permissions: ['geolocation'],
    });
    const pageIn = await ctxIn.newPage();
    pageIn.on('pageerror', (e) => fail(`erreur JS (géo in-zone) : ${e.message}`));
    await pageIn.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await dismissTutorial(pageIn);
    await pageIn.locator('.leaflet-container').waitFor({ timeout: 15000 });
    await pageIn.waitForTimeout(4000);
    const here = await pageIn.locator('.map-user-marker').count();
    check('géo in-zone : marqueur « Vous êtes ici »', here >= 1, `marqueurs=${here}`);
    st = await tileState(pageIn);
    check('géo in-zone : carte centrée sur Nzeng-Ayong', st !== null && Math.abs(st.lat - 0.43) < 0.06 && Math.abs(st.lng - 9.47) < 0.06, JSON.stringify(st));
    // La feuille démarre au cran mini (le formulaire n'est pas dans
    // le DOM) : on l'ouvre avant de lire le champ départ.
    await pageIn.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await pageIn.waitForTimeout(700);
    const departValue = await pageIn.locator('#depart').inputValue().catch(() => '');
    check('géo in-zone : départ calé sur Nzeng-Ayong', departValue.includes('Nzeng-Ayong'), departValue);
    // Le cercle suit le départ manuel : on choisit Glass (~6 km au
    // sud-ouest) — le centre du cercle doit bouger d'autant vers le
    // bas / la gauche (la carte, elle, ne bouge pas : pas de recentrage
    // sur un choix manuel dans la liste).
    const circleBox = () => pageIn.evaluate(() => {
      const p = document.querySelector('.leaflet-overlay-pane path[stroke="#FFD60A"]');
      if (!p) return null;
      const b = p.getBBox();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    });
    const before = await circleBox();
    await pageIn.locator('#depart').click();
    await pageIn.locator('#depart').fill('Glass');
    await pageIn.waitForTimeout(400);
    await pageIn.getByRole('option', { name: 'Glass', exact: true }).click();
    await pageIn.waitForTimeout(900);
    const departValue2 = await pageIn.locator('#depart').inputValue().catch(() => '');
    check('départ manuel : champ passé à Glass', departValue2.includes('Glass'), departValue2);
    const after = await circleBox();
    check(
      'cercle périmètre : il suit le départ manuel (Nzeng-Ayong → Glass)',
      before !== null && after !== null && after.y - before.y > 200 && before.x - after.x > 50,
      `avant ${JSON.stringify(before)} après ${JSON.stringify(after)}`
    );
    await pageIn.screenshot({ path: path.join(SHOTS, '04b-cercle-suit-glass.png') });
    await pageIn.screenshot({ path: path.join(SHOTS, '04-geo-nzeng-ayong.png') });
    await ctxIn.close();

    // --- 5. « Me localiser » hors zone (Paris).
    const ctxOut = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      geolocation: { latitude: 48.85, longitude: 2.35 },
      permissions: ['geolocation'],
    });
    const pageOut = await ctxOut.newPage();
    pageOut.on('pageerror', (e) => fail(`erreur JS (géo hors zone) : ${e.message}`));
    await pageOut.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await dismissTutorial(pageOut);
    await pageOut.locator('.leaflet-container').waitFor({ timeout: 15000 });
    await pageOut.waitForTimeout(3000);
    await pageOut.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await pageOut.waitForTimeout(700);
    await pageOut.getByRole('button', { name: 'Me localiser' }).click();
    await pageOut.waitForTimeout(2500);
    const bodyText = await pageOut.locator('body').innerText();
    check('hors zone : message « service à Libreville pour l’instant »', bodyText.includes("le service est à Libreville pour l'instant"), 'message absent');
    st = await tileState(pageOut);
    check('hors zone : carte restée sur Libreville', st !== null && Math.abs(st.lat - 0.39) < 0.1 && Math.abs(st.lng - 9.454) < 0.1, JSON.stringify(st));
    await pageOut.screenshot({ path: path.join(SHOTS, '05-me-localiser-hors-zone.png') });
    await ctxOut.close();
  } finally {
    await browser.close();
  }
  console.log(failures.length === 0 ? '\nv2.31 visuel : tout passe.' : `\nv2.31 visuel : ${failures.length} échec(s).`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
