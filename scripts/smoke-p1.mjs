#!/usr/bin/env node
/** Smoke Playwright du lot P1 (v2.30) — pages publiques / sans session.
 *  Vérifie le rendu réel dans Chromium (serveur de dev port 3100) :
 *  accueil (feuille de demande + case « Planifier pour plus tard »),
 *  /mes-courses (redirection connexion, pas de fuite), /compte
 *  (redirection), /tableau-de-bord (redirection), /aide (FAQ),
 *  /tuto-apercu (rendu). Les parcours connectés (planifier, favoris,
 *  heatmap, selfie, gains, impression) exigent un compte : test
 *  connecté avec le propriétaire après le push.
 *  Usage : node scripts/smoke-p1.mjs (sortie 0 = tout passe).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV = process.env.DEV_URL ?? 'http://localhost:3100';

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const cache = path.join(process.env.HOME ?? '', '.cache/ms-playwright');
  if (!fs.existsSync(cache)) return null;
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith('chromium-')) continue;
    const exe = path.join(cache, dir, 'chrome-linux/chrome');
    if (fs.existsSync(exe)) return exe;
    const shell = path.join(
      cache,
      dir.replace('chromium-', 'chromium_headless_shell-'),
      'chrome-headless-shell-linux64/chrome-headless-shell'
    );
    if (fs.existsSync(shell)) return shell;
  }
  return null;
}

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const exePath = findChromium();
if (!exePath) {
  console.log('Chromium introuvable — smoke navigateur impossible.');
  process.exit(2);
}
const browser = await chromium.launch({ executablePath: exePath, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// Le tutoriel passager (v2.21) s'ouvre au premier lancement et recouvre
// la feuille : le marquer comme vu pour tester le formulaire lui-même.
await page.addInitScript(() => {
  try {
    window.localStorage.setItem('stacks-drive-tuto-passager-vu', '1');
  } catch {
    /* stockage indisponible */
  }
});
page.on('pageerror', (e) => console.log('  pageerror:', String(e).slice(0, 200)));

async function goto(pathname) {
  const res = await page.goto(`${DEV}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  return res?.status() ?? null;
}

// 1. Accueil : feuille de demande + planification.
let status = await goto('/');
check('accueil HTTP 200', status === 200, `obtenu ${status}`);
// La feuille démarre en mini sur mobile : l'agrandir pour voir le formulaire.
const expand = page.locator('button[aria-label="Agrandir la feuille"], button[aria-label="Déplier la feuille"]').first();
if (await expand.count()) {
  await expand.click().catch(() => undefined);
  await page.waitForTimeout(800);
}
const homeText = (await page.textContent('body')) ?? '';
check('accueil : « Où allez-vous ? »', homeText.includes('Où allez-vous ?'));
check(
  'accueil : case « Planifier pour plus tard » visible',
  homeText.includes('Planifier pour plus tard')
);
check('accueil : pas de marqueur « bientôt / à venir »', !/bientôt|à venir/i.test(homeText));

// 2. Pages protégées : redirection vers la connexion, pas de fuite.
for (const p of ['/mes-courses', '/compte', '/tableau-de-bord']) {
  status = await goto(p);
  const url = page.url();
  check(
    `${p} sans session → connexion`,
    url.includes('/connexion'),
    `url finale ${url} (HTTP ${status})`
  );
}

// 3. Aide / FAQ.
status = await goto('/aide');
check('FAQ /aide 200', status === 200, `obtenu ${status}`);

// 4. Aperçu tutos (rendu des composants, dont la formation chauffeur).
status = await goto('/tuto-apercu');
check('/tuto-apercu 200', status === 200, `obtenu ${status}`);

// 5. Une course inconnue → page « Course introuvable », pas de crash.
status = await goto('/courses/00000000-0000-0000-0000-000000000000');
const courseText = (await page.textContent('body')) ?? '';
check(
  'course inconnue → connexion ou « introuvable », pas de 500',
  page.url().includes('/connexion') || courseText.includes('introuvable'),
  `url ${page.url()}`
);

await browser.close();
console.log(failures === 0 ? '\nSmoke P1 : tout passe.' : `\nSmoke P1 : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
