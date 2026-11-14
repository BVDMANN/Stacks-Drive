#!/usr/bin/env node
/** Contrôle visuel ponctuel v2.32 (écran hors zone) — /tmp, non versionné.
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node /tmp/verify-lot-v232-visual.mjs
 * Contrôle, dans un vrai Chromium :
 *  1. Position simulée Paris (hors zone) : écran affiché en FR,
 *     fond animé (anneaux radar), basculeur EN → textes EN.
 *  2. Formulaire « Me prévenir » sans Supabase : erreur explicite,
 *     pas de plantage (route en 503 en dev).
 *  3. « Explorer Libreville » ferme l'écran ; rechargement dans la
 *     même session : l'écran ne réapparaît pas.
 *  4. Position simulée Nzeng-Ayong (dans la zone) : aucun écran.
 *  5. Géolocalisation refusée (sans GPS) : aucun écran.
 * Captures dans ~/workspace/stacks-drive/captures-hors-zone-v2.32/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const SHOTS = path.join(process.env.HOME ?? '', 'workspace', 'stacks-drive', 'captures-hors-zone-v2.32');
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

const browser = await chromium.launch({ executablePath: exePath() });

// --- 1-3. Paris, hors zone ----------------------------------------------
const ctxParis = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'fr-FR',
  geolocation: { latitude: 48.8566, longitude: 2.3522 },
  permissions: ['geolocation'],
});
const page = await ctxParis.newPage();
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
const overlay = page.getByTestId('out-of-zone-screen');
try {
  await overlay.waitFor({ state: 'visible', timeout: 15000 });
  check('Paris : écran hors zone affiché', true);
} catch {
  check('Paris : écran hors zone affiché', false, 'écran jamais apparu (timeout 15 s)');
  await page.screenshot({ path: path.join(SHOTS, '01-paris-absent.png') });
}
const frTitle = 'Nous ne sommes pas encore là-bas, mais ne vous inquiétez pas, ça arrive.';
check('Paris : titre FR exact', (await page.locator('h1').first().textContent())?.includes(frTitle) ?? false);
check('Paris : sous-titre FR', await page.getByText('Pour l’instant, Stacks Drive est à Libreville.').count() === 1);
check('Paris : fond animé (anneaux radar)', await page.locator('.radar-ring').count() >= 1);
await page.screenshot({ path: path.join(SHOTS, '01-paris-fr.png') });

// Basculeur EN
await page.getByRole('button', { name: 'English' }).click();
check('Paris : titre EN exact après bascule',
  (await page.locator('h1').first().textContent())?.includes('We’re not there yet, but don’t worry, we’re coming.') ?? false);
check('Paris : bouton EN « Explore Libreville »',
  await page.getByTestId('out-of-zone-explore').textContent().then((t) => t?.includes('Explore Libreville') ?? false));
await page.screenshot({ path: path.join(SHOTS, '02-paris-en.png') });

// Formulaire « Me prévenir » (dev sans Supabase → erreur explicite, pas de plantage).
// La région d'alerte ciblée est celle du formulaire (la pile de toasts
// contient aussi une région live vide, avant l'écran dans le DOM).
await page.getByRole('button', { name: 'Français' }).click();
await page.locator('#out-of-zone-email').fill('test-paris@example.com');
await page.locator('input[type="checkbox"]').check();
await page.getByTestId('out-of-zone-notify').click();
const formAlert = page.locator('[data-testid="out-of-zone-screen"] [role="alert"]');
try {
  await formAlert.waitFor({ state: 'visible', timeout: 15000 });
  check('Paris : formulaire sans Supabase → message d’erreur explicite, écran toujours là',
    (await overlay.isVisible()) && (await formAlert.textContent())?.includes('indisponible') === true);
} catch {
  check('Paris : formulaire sans Supabase → message d’erreur explicite', false, 'aucune alerte affichée');
}
await page.screenshot({ path: path.join(SHOTS, '03-paris-notify-erreur.png') });

// Fermeture + non-réapparition dans la session
await page.getByTestId('out-of-zone-explore').click();
await page.waitForTimeout(500);
check('Paris : « Explorer Libreville » ferme l’écran', !(await overlay.isVisible().catch(() => false)));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
check('Paris : après rechargement (même session), l’écran ne réapparaît pas',
  (await overlay.count()) === 0);
await page.screenshot({ path: path.join(SHOTS, '04-paris-apres-fermeture.png') });
await ctxParis.close();

// --- 4. Dans la zone : aucun écran ---------------------------------------
const ctxLbv = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'fr-FR',
  geolocation: { latitude: 0.43, longitude: 9.47 },
  permissions: ['geolocation'],
});
const pageLbv = await ctxLbv.newPage();
await pageLbv.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await pageLbv.waitForTimeout(8000);
check('Nzeng-Ayong (dans la zone) : aucun écran hors zone',
  (await pageLbv.getByTestId('out-of-zone-screen').count()) === 0);
await pageLbv.screenshot({ path: path.join(SHOTS, '05-libreville-ok.png') });
await ctxLbv.close();

// --- 5. Sans GPS (permission refusée) : aucun écran -----------------------
const ctxNoGps = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'fr-FR',
});
const pageNoGps = await ctxNoGps.newPage();
await pageNoGps.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
await pageNoGps.waitForTimeout(8000);
check('Sans GPS (permission refusée) : aucun écran hors zone',
  (await pageNoGps.getByTestId('out-of-zone-screen').count()) === 0);
await pageNoGps.screenshot({ path: path.join(SHOTS, '06-sans-gps-ok.png') });
await ctxNoGps.close();

await browser.close();
console.log(failures.length === 0 ? '\nTous les contrôles visuels v2.32 passent.' : `\n${failures.length} contrôle(s) visuel(s) en échec.`);
process.exit(failures.length === 0 ? 0 : 1);
