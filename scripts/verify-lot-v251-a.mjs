#!/usr/bin/env node
/** Rendus v2.51 (travailleur A) — 390×844, serveur dev :3100.
 *  01 accueil mini + nav basse · 02 cartes Trajets / Planifiés +
 *  bouton Plus tard · 03 recherche d'une petite rue (résultats) ·
 *  04 rue sélectionnée, estimation + itinéraire (feuille scrollée
 *  sur l'estimation) · 04b même trajet, feuille repliée (route +
 *  épingles étiquetées visibles) · 05 épiceries z16 (Centre-ville,
 *  sans chevauchement illisible) · 06 libellés z12 ·
 *  07 « Plus tard » (planification activée).
 *  La carte de bienvenue du tutoriel est fermée au début (elle
 *  masquait le haut de la carte). Les tuiles ne se chargent pas
 *  dans le navigateur de la VM (limitation réseau connue) : on
 *  vérifie le DOM + les surcouches (marqueurs, libellés, feuille,
 *  nav), pas les tuiles.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = 'http://localhost:3100';
const OUT = '/home/hatch/workspace/your_files/rendus-v251';
fs.mkdirSync(OUT, { recursive: true });

function exePath() {
  const cache = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith('chromium-')) continue;
    const p = path.join(cache, dir, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium introuvable.');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('ERR_TUNNEL')) console.log('  [console.error]', m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => console.log('  [pageerror]', String(e).slice(0, 300)));
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.leaflet-container', { timeout: 20000 });
  await page.waitForSelector('nav[aria-label="Navigation principale"]', { timeout: 10000 });
  await sleep(2500);

  // Fermer la carte de bienvenue du tutoriel (première visite).
  await page.locator('[aria-label="Bienvenue sur Stacks Drive"] button[aria-label="Fermer"]').click().catch(() => {});
  await sleep(600);

  // 01 — accueil, feuille mini + navigation basse visible.
  await page.screenshot({ path: path.join(OUT, '01-accueil-mini-nav.png') });
  console.log('01 ok');

  // 02 — feuille dépliée : les 2 cartes + barre « Plus tard ».
  await page.getByLabel('Agrandir la feuille').click();
  await sleep(900);
  await page.screenshot({ path: path.join(OUT, '02-accueil-cartes-plus-tard.png') });
  console.log('02 ok — cartes:', await page.getByText('Trajets planifiés').count());

  // Départ = Centre-ville (combobox).
  await page.getByPlaceholder('Ton point de départ…').click();
  await page.getByPlaceholder('Ton point de départ…').fill('Centre-ville');
  await sleep(400);
  await page.locator('li[role="option"] button', { hasText: 'Centre-ville' }).first().click();
  await sleep(600);

  // 03 — recherche d'une petite rue précise (attendre un résultat).
  const dest = page.getByPlaceholder('Tape un lieu ou un quartier…');
  await dest.click();
  await dest.fill('rue du bord de mer');
  await page.locator('p:text-is("Rues & adresses")').locator('xpath=../ul/li[1]/button').waitFor({ timeout: 20000 });
  await sleep(600);
  // Les résultats sont en bas de la feuille, derrière la barre de
  // navigation : on centre le premier résultat dans la feuille
  // (le padding bas laisse les résultats remonter au-dessus de la barre).
  await page.locator('p:text-is("Rues & adresses")').locator('xpath=../ul/li[1]/button').evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, '03-recherche-rue.png') });
  console.log('03 ok');

  // 04 — sélection de la première rue : estimation dans la feuille.
  await page.locator('p:text-is("Rues & adresses")').locator('xpath=../ul/li[1]/button').click();
  await page.waitForSelector('text=Par la route', { timeout: 20000 });
  await sleep(1200);
  await page.locator('text=Par la route').scrollIntoViewIfNeeded();
  await sleep(600);
  await page.screenshot({ path: path.join(OUT, '04-rue-estimation.png') });
  console.log('04 ok');

  // 04b — feuille repliée : route + épingles étiquetées visibles.
  await page.getByLabel('Replier la feuille').click().catch(() => {});
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '04b-route-epingles.png') });
  console.log('04b ok — libellés épingles:', await page.locator('.map-pin-label').count());

  // 07 — « Plus tard » : planification activée + focus date/heure.
  await page.getByLabel('Agrandir la feuille').click();
  await sleep(900);
  await page.getByRole('button', { name: /Plus tard/ }).first().click();
  await sleep(1200);
  await page.screenshot({ path: path.join(OUT, '07-plus-tard-planification.png') });
  console.log('07 ok — planification cochée:', await page.locator('#scheduled-at').count());

  // Replier la feuille (mini) pour libérer la carte.
  await page.getByLabel('Replier la feuille').click().catch(() => {});
  await sleep(900);

  // 05 — zoom 16 sur un cluster d'épiceries : on cherche « cecado »
  // dans la recherche (les épiceries y sont trouvables) et on
  // sélectionne la première — la carte vole dessus, puis un cran
  // de molette pour passer de z15 (cadrage trajet) à z16 (libellés).
  await page.getByLabel('Agrandir la feuille').click();
  await sleep(900);
  const dest2 = page.getByPlaceholder('Tape un lieu ou un quartier…');
  await dest2.click();
  await dest2.fill('cecado');
  const cecado = page.locator('ul li button', { hasText: 'Cecado' }).first();
  await cecado.waitFor({ timeout: 20000 });
  await sleep(600);
  await cecado.click();
  await sleep(2500);
  // Replier la feuille pour libérer la carte, puis un cran de zoom
  // en plus (le cadrage départ+destination laisse la vue à z15 :
  // pictogrammes denses oui, libellés denses non — il faut z16).
  // Bouton + Leaflet (zoom vers le centre, le cluster reste cadré —
  // la molette, elle, zoome vers le curseur et sortirait du cluster).
  // La molette fonctionne maintenant avec un trajet défini (correctif
  // v2.51 : points carte mémoïsés, plus de `fitBounds` à chaque rendu).
  await page.getByLabel('Replier la feuille').click().catch(() => {});
  await sleep(1200);
  await page.locator('.leaflet-control-zoom-in').click();
  await sleep(1500);
  const counts05 = await page.evaluate(() => {
    const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const labels = [...document.querySelectorAll('.map-poi-marker.dense .map-poi-label')].filter(vis);
    return {
      epiceries: document.querySelectorAll('.map-poi-marker.cat-epicerie').length,
      epicerieLabels: labels.filter((l) => l.closest('.cat-epicerie')).length,
      denseLabels: labels.length,
    };
  });
  console.log('05 — épiceries:', counts05.epiceries, '· libellés épicerie visibles:', counts05.epicerieLabels, '· libellés denses visibles:', counts05.denseLabels);
  await page.screenshot({ path: path.join(OUT, '05-epiceries-z16.png') });
  console.log('05 ok');

  // 05b — un cran de dézoom (z15) : le cluster d'épiceries du
  // Centre-ville / Mont-Bouët tient dans le cadre (plusieurs
  // pictogrammes épicerie visibles, sans chevauchement illisible).
  await page.mouse.wheel(0, 600);
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '05b-epiceries-z15-cluster.png') });
  console.log('05b ok');

  // 06 — zoom 12 (vue ville) : libellés sans chevauchement.
  // Page fraîche, SANS trajet (les épingles/tooltips du trajet
  // masqueraient des libellés de quartiers à ce zoom).
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.leaflet-container', { timeout: 20000 });
  await sleep(2500);
  await page.locator('[aria-label="Bienvenue sur Stacks Drive"] button[aria-label="Fermer"]').click().catch(() => {});
  await sleep(600);
  const mapBox3 = await page.locator('.leaflet-container').boundingBox();
  await page.mouse.move((mapBox3?.x ?? 0) + (mapBox3?.width ?? 390) / 2, (mapBox3?.y ?? 0) + 400);
  for (let i = 0; i < 2; i++) {
    await page.mouse.wheel(0, 600);
    await sleep(900);
  }
  await sleep(1500);
  await page.screenshot({ path: path.join(OUT, '06-libelles-z12.png') });
  console.log('06 ok');

  await browser.close();
  console.log('Rendus dans', OUT);
}

main().catch((e) => {
  console.error('ÉCHEC rendus:', e);
  process.exit(1);
});
