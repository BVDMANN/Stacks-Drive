import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3100';
const OUT = '/tmp/p0a-captures';
fs.mkdirSync(OUT, { recursive: true });

function exePath() {
  const cache = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith('chromium-')) continue;
    const p = path.join(cache, dir, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium introuvable');
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
const failedReqs = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('requestfailed', (r) => failedReqs.push(`${r.url()} :: ${r.failure()?.errorText ?? ''}`));
page.on('response', (r) => { if (r.status() >= 400) failedReqs.push(`${r.url()} :: HTTP ${r.status()}`); });

// 1. Accueil
let res = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
check('accueil HTTP 200', res?.status() === 200, String(res?.status()));
await page.waitForTimeout(1500);
check('accueil contient Stacks Drive', (await page.content()).includes('Stacks Drive'));
await page.screenshot({ path: OUT + '/01-accueil.png' });

// 2. Aperçu tuto : ProposalCard avec récapitulatif avant acceptation (v2.23)
res = await page.goto(BASE + '/tuto-apercu', { waitUntil: 'networkidle' });
check('tuto-apercu HTTP 200', res?.status() === 200, String(res?.status()));
const tutoText = await page.evaluate(() => document.body.innerText);
check('recapitulatif avant acceptation visible', tutoText.includes('Récapitulatif avant acceptation'));
check('recap mentionne prix fige', tutoText.includes('prix figé une fois accepté'));
await page.screenshot({ path: OUT + '/02-tuto-apercu.png' });

// 2b. Écran PIN de l'aperçu tuto (?ecran=pin) : le code est visible en grand
res = await page.goto(BASE + '/tuto-apercu?ecran=pin', { waitUntil: 'networkidle' });
const pinText = await page.evaluate(() => document.body.innerText);
check('PIN visible sur ecran pin (4827)', pinText.includes('4827'));
await page.screenshot({ path: OUT + '/03-tuto-pin.png' });

// 3. /compte sans session -> redirection connexion
res = await page.goto(BASE + '/compte', { waitUntil: 'networkidle' });
check('/compte redirige vers /connexion', page.url().includes('/connexion'), page.url());

// 4. /mes-courses sans session -> redirection connexion
res = await page.goto(BASE + '/mes-courses', { waitUntil: 'networkidle' });
check('/mes-courses redirige vers /connexion', page.url().includes('/connexion'), page.url());

// 5. API sans Supabase : doivent échouer proprement en 503 (pas de crash, pas de 500 fuite)
async function apiCheck(name, url, options) {
  const r = await fetch(url, options);
  const body = await r.json().catch(() => null);
  check(name, r.status === 503, `${r.status} — ${body?.error ?? ''}`);
}
await apiCheck('GET /api/trusted-contacts -> 503 sans Supabase', BASE + '/api/trusted-contacts');
await apiCheck('POST /api/trusted-contacts -> 503 sans Supabase', BASE + '/api/trusted-contacts', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Maman', phone: '077000000' }),
});
await apiCheck('POST /api/rides/x/sos -> 503 sans Supabase', BASE + '/api/rides/00000000-0000-0000-0000-000000000000/sos', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat: 0.4, lng: 9.45 }),
});
await apiCheck('PATCH /api/rides/x cancel -> 503 sans Supabase', BASE + '/api/rides/00000000-0000-0000-0000-000000000000', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'cancel', reasonCode: 'changement_programme' }),
});

// 6. Aucune erreur JS sur les pages visitées (hors ressources externes
// connues : tuiles Esri injoignables depuis la VM + favicon absent —
// pré-existant, sans rapport avec ce lot ; listées pour transparence).
const knownExternal = (m) => m.includes('ERR_TUNNEL_CONNECTION_FAILED') || m.includes('404 (Not Found)');
check('aucune erreur JS page (hors ressources externes connues)', errors.every(knownExternal), errors.filter((m) => !knownExternal(m)).slice(0, 3).join(' | ') || failedReqs.slice(0, 5).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controles OK`);
if (failed.length > 0) process.exit(1);
