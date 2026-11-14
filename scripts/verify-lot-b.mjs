import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3100';
const OUT = '/home/hatch/workspace/stacks-drive/captures-lot-b-v2.24';
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
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  // Les tuiles de carte externes (Esri) ne chargent pas dans ce bac
  // a sable (proxy) : ce sont des echecs de ressources, preexistants
  // et hors lot — on ne compte que les vraies erreurs JS.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
});

// 1. Accueil
let res = await page.goto(BASE + '/', { waitUntil: 'networkidle' });
check('accueil HTTP 200', res?.status() === 200, String(res?.status()));
await page.waitForTimeout(1200);
check('accueil contient Stacks Drive', (await page.content()).includes('Stacks Drive'));
await page.screenshot({ path: OUT + '/01-accueil.png' });

// 2. /aide : liste des questions
res = await page.goto(BASE + '/aide', { waitUntil: 'networkidle' });
check('/aide HTTP 200', res?.status() === 200, String(res?.status()));
let text = await page.evaluate(() => document.body.innerText);
check('FAQ liste les questions courantes', text.includes("Combien coûte une course ?") && text.includes("C'est quoi le code PIN ?") && text.includes('Solo et Groupe'));
check('FAQ sans "bientôt / à venir"', !/bientôt|à venir/i.test(text));
await page.screenshot({ path: OUT + '/02-aide.png' });

// 3. Recherche FAQ : question courante -> reponse directe
await page.fill('#faq-search', 'comment payer ma course ?');
await page.waitForTimeout(400);
text = await page.evaluate(() => document.body.innerText);
check('FAQ recherche "payer" -> reponse paiement', text.includes('Tu paies directement ton chauffeur'));
await page.screenshot({ path: OUT + '/03-aide-recherche-paiement.png' });

// 4. Recherche FAQ : cas ambigu -> redirection litige/admin, pas de reponse inventee
await page.fill('#faq-search', 'je veux parler au directeur du service');
await page.waitForTimeout(400);
text = await page.evaluate(() => document.body.innerText);
check('FAQ cas ambigu -> panneau litige/admin', text.includes('Pas de réponse automatique pour cette question') && text.includes('Ouvrir un litige depuis ma course'));
check('FAQ cas ambigu -> lien mes-courses present', (await page.$('a[href="/mes-courses"]')) !== null);
await page.screenshot({ path: OUT + '/04-aide-cas-ambigu.png' });

// 5. Accordeon : clic ouvre la reponse
await page.fill('#faq-search', '');
await page.waitForTimeout(300);
await page.click('text=Quelle est la différence entre Solo et Groupe ?');
await page.waitForTimeout(300);
text = await page.evaluate(() => document.body.innerText);
check('FAQ accordeon ouvre la reponse Solo/Groupe', text.includes('le véhicule entier est pour toi'));
await page.screenshot({ path: OUT + '/05-aide-accordeon.png' });

// 6. FAQ question PIN (recherche accentuee)
await page.fill('#faq-search', 'code pin');
await page.waitForTimeout(400);
text = await page.evaluate(() => document.body.innerText);
check('FAQ recherche "code pin" -> reponse PIN', text.includes('code à 4 chiffres'));
await page.screenshot({ path: OUT + '/06-aide-recherche-pin.png' });

// 7. Footer : lien Aide
res = await page.goto(BASE + '/a-propos', { waitUntil: 'networkidle' });
check('footer lien /aide present', (await page.$('a[href="/aide"]')) !== null);

// 8. API welcome sans session -> 503 propre (Supabase non configure en dev), pas de crash
res = await page.evaluate(async () => {
  const r = await fetch('/api/welcome', { method: 'POST' });
  return { status: r.status, body: await r.text() };
});
check('/api/welcome sans session -> pas de crash', res.status === 503 || res.status === 401, `HTTP ${res.status}`);

// 9. Cron sans secret -> 503, pas d'envoi
res = await page.evaluate(async () => {
  const r = await fetch('/api/cron/weekly-report');
  return r.status;
});
check('/api/cron/weekly-report sans secret -> 503', res === 503, `HTTP ${res}`);

// 10. Pas d'erreur JS sur les pages visitees
check('aucune erreur JS page', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} controles OK`);
process.exit(failed.length ? 1 : 0);
