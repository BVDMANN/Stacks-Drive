#!/usr/bin/env node
/**
 * verify-tuto.mjs — Vérification fonctionnelle des tutoriels (v2.21).
 *
 * Usage (serveur de dev actif sur http://localhost:3100) :
 *   npm run tuto:verify
 *
 * Contrôle, dans un vrai Chromium :
 *  1. Tutoriel passager : s'ouvre seul au premier lancement, se ferme,
 *     pose le drapeau « vu », ne se rouvre pas au rechargement, se
 *     rouvre avec « Revoir le tutoriel », et ses 6 images chargent.
 *  2. Formation chauffeur (page d'aperçu dev) : s'ouvre sur demande
 *     et ses 6 images chargent.
 *  3. Captures : les 12 PNG existent dans `public/tuto/`.
 *
 * Ce que ce script NE peut pas vérifier en local (pas de Supabase) :
 *  - l'ouverture auto de la formation juste après la création d'un
 *    compte chauffeur (drapeau posé à l'inscription, lu au premier
 *    passage sur /tableau-de-bord) ;
 *  - le bouton « Revoir la formation » sur le vrai tableau de bord.
 *  Ces deux chemins sont relus dans le code et devront être confirmés
 *  sur un vrai compte après le push.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const BASE_URL = process.env.TUTO_BASE_URL ?? 'http://localhost:3100';

const EXPECTED = [
  'passager-01-carte.png',
  'passager-02-trajet.png',
  'passager-03-solo-groupe.png',
  'passager-04-propositions.png',
  'passager-05-pin.png',
  'passager-06-paiement.png',
  'chauffeur-01-mise-en-ligne.png',
  'chauffeur-02-demande.png',
  'chauffeur-03-places.png',
  'chauffeur-04-pin.png',
  'chauffeur-05-commission.png',
  'chauffeur-06-reglement.png',
];

function exePath() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const cache = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  for (const dir of fs.readdirSync(cache)) {
    if (!dir.startsWith('chromium-')) continue;
    const p = path.join(cache, dir, 'chrome-linux64/chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chromium introuvable (voir scripts/capture-tuto.mjs).');
}

async function waitForImage(page, label) {
  try {
    await page.waitForFunction(
      () => {
        const img = document.querySelector('[role="dialog"] img');
        return img && img.complete && img.naturalWidth > 0;
      },
      { timeout: 10000 },
    );
  } catch {
    throw new Error(`${label} : image non chargée : ${await page.evaluate(() => document.querySelector('[role="dialog"] img')?.getAttribute('src'))}`);
  }
}

async function stepThrough(page, label) {
  for (let i = 1; i <= 6; i++) {
    await waitForImage(page, `${label} étape ${i}`);
    const stepLabel = await page.getByText(new RegExp(`Étape ${i}/6`)).first().textContent();
    console.log(`  ✓ ${label} — ${stepLabel?.trim()}`);
    if (i < 6) await page.getByRole('button', { name: 'Suivant', exact: true }).click();
  }
}

async function main() {
  let failures = 0;
  const fail = (msg) => {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  };

  for (const f of EXPECTED) {
    const p = path.join(REPO_ROOT, 'public', 'tuto', f);
    if (!fs.existsSync(p)) fail(`capture manquante : public/tuto/${f}`);
  }
  console.log(`Captures : ${EXPECTED.length} fichiers attendus dans public/tuto/`);

  const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();

    // --- 1. Premier lancement : ouverture auto, navigation, fermeture ---
    console.log('Tutoriel passager (premier lancement)…');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    try {
      await page.getByRole('dialog', { name: 'Tutoriel passager' }).waitFor({ timeout: 8000 });
      console.log('  ✓ ouverture automatique au premier lancement');
    } catch {
      fail('la modale ne s’est pas ouverte seule au premier lancement');
    }
    await stepThrough(page, 'passager');
    await page.screenshot({ path: '/tmp/tuto-modal-passager-etape-6.png' });
    await page.getByRole('button', { name: 'Passer le tutoriel' }).click();
    await page.getByRole('dialog', { name: 'Tutoriel passager' }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => fail('la modale ne se ferme pas'));
    const seen = await page.evaluate(() => window.localStorage.getItem('stacks-drive-tuto-passager-vu'));
    if (seen === '1') console.log('  ✓ fermeture → drapeau « vu » posé');
    else fail('drapeau « vu » absent après fermeture');

    // --- 2. Rechargement : ne se rouvre pas ---
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const reopened = await page.getByRole('dialog', { name: 'Tutoriel passager' }).count();
    if (reopened === 0) console.log('  ✓ ne se rouvre pas au rechargement');
    else fail('la modale s’est rouverte après rechargement');

    // --- 3. Rejouable depuis l'accueil (feuille dépliée : le lien
    // « Revoir le tutoriel » est dans le pied de la feuille) ---
    await page.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await page.getByRole('button', { name: 'Revoir le tutoriel' }).first().click();
    try {
      await page.getByRole('dialog', { name: 'Tutoriel passager' }).waitFor({ timeout: 5000 });
      console.log('  ✓ rejouable avec « Revoir le tutoriel »');
    } catch {
      fail('« Revoir le tutoriel » ne rouvre pas la modale');
    }
    await page.screenshot({ path: '/tmp/tuto-modal-passager-etape-1.png' });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // --- 4. Formation chauffeur (aperçu dev) ---
    console.log('Formation chauffeur (aperçu dev)…');
    await page.goto(`${BASE_URL}/tuto-apercu?ecran=formation`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('button', { name: 'Ouvrir la formation chauffeur' }).click();
    try {
      await page.getByRole('dialog', { name: 'Formation chauffeur' }).waitFor({ timeout: 5000 });
      console.log('  ✓ ouverture sur demande');
    } catch {
      fail('la formation chauffeur ne s’ouvre pas');
    }
    await stepThrough(page, 'chauffeur');
    await page.keyboard.press('Escape');
  } finally {
    await browser.close();
  }

  if (failures > 0) {
    console.error(`\n${failures} échec(s) — voir ci-dessus.`);
    process.exit(1);
  }
  console.log('\nVérification tutoriels : OK.');
}

main().catch((err) => {
  console.error(`\nERREUR : ${err.message}`);
  process.exit(1);
});
