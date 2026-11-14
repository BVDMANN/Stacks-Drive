#!/usr/bin/env node
/**
 * capture-tuto.mjs — Captures des tutoriels Stacks Drive (v2.21,
 * choix des quartiers revu v2.22, carte d'accueil v2.36).
 *
 * Prend les captures des VRAIS écrans de l'app (jamais d'illustrations)
 * qui illustrent chaque étape des tutoriels passager et chauffeur, et
 * les écrit dans `public/tuto/` (assets du repo, servis par Next).
 *
 * Usage :
 *   npm run dev -- -p 3100   # serveur de dev actif (ne pas le tuer)
 *   npm run tuto:captures    # (re)fait les 12 captures
 *
 * Prérequis : `playwright-core` (devDependency) + un Chromium déjà
 * téléchargé (cache `~/.cache/ms-playwright/`, révision détectée
 * automatiquement). Aucun téléchargement de navigateur au lancement.
 * Surcharge possible : PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chrome
 * ou TUTO_BASE_URL=http://localhost:3100.
 *
 * Ce que le script capture :
 *  - passager-01/02/03/06 : le VRAI accueil (`/`) — carte, feuille de
 *    demande, estimation, Solo/Groupe, paiement. Le tutoriel est
 *    neutralisé pendant les captures (drapeaux « vu » posés en
 *    localStorage avant chargement).
 *  - passager-04/05, chauffeur-01/02/03/04 : les VRAIS composants
 *    de l'app rendus par la page d'aperçu DEV `/tuto-apercu`
 *    (404 en production), avec des données démo étiquetées.
 *  - chauffeur-05/06 : la VRAIE page `/devenir-chauffeur`
 *    (commission 5 % puis 8 %, plafond 10 % ; dépôt et plafond de
 *    dette). Le relevé hebdo lui-même n'est pas capturable sans
 *    Supabase (son composant n'affiche que son état vide en local).
 *
 * Cadrage : la modale du tutoriel affiche les captures plein écran en
 * `object-cover` (haut de l'image visible) et les captures d'un seul
 * composant en `object-contain` (entières) — voir `fit` dans
 * `components/tuto/steps.ts`. Le script cadre donc chaque capture
 * pour que son contenu utile soit en haut de l'image (feuille
 * remontée en haut, cartes Solo/Groupe cadrées seules).
 *
 * Le script masque aussi les outils de dev (bouton « N » de Next.js,
 * bandeau de la page d'aperçu) : ce sont des artefacts de
 * développement, pas l'interface de l'app.
 *
 * Limite connue (VM) : les tuiles Esri ne chargent pas derrière le
 * proxy — le fond de carte est gris sur les captures locales, mais
 * l'interface, les libellés et les marqueurs sont les vrais. Après le
 * push, refaire passager-01/02/03/06 sur un vrai téléphone si le fond
 * de carte doit être visible (voir `public/tuto/README.md`).
 *
 * Si un écran change : relancer ce script (il écrase les captures),
 * vérifier visuellement les PNG, puis pousser.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'public', 'tuto');
const BASE_URL = process.env.TUTO_BASE_URL ?? 'http://localhost:3100';

const WIDTH = 390;
const HEIGHT = 844;

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM_PATH) return process.env.PLAYWRIGHT_CHROMIUM_PATH;
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright');
  const candidates = [];
  try {
    for (const dir of fs.readdirSync(cache)) {
      if (!dir.startsWith('chromium-')) continue;
      for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const p = path.join(cache, dir, sub);
        if (fs.existsSync(p)) candidates.push(p);
      }
      const shell = path.join(cache, dir.replace('chromium-', 'chromium_headless_shell-'), 'chrome-headless-shell-linux64/chrome-headless-shell');
      if (fs.existsSync(shell)) candidates.push(shell);
    }
  } catch {
    // Cache absent : on laisse Playwright lever une erreur claire.
  }
  // Préférer le Chrome complet (meilleur rendu) au headless shell.
  candidates.sort((a, b) => (a.includes('headless-shell') ? 1 : 0) - (b.includes('headless-shell') ? 1 : 0));
  return candidates[0];
}

/** Anneau or autour d'un élément — annotation discrète, sans pastille
 *  (la pastille masquait le texte voisin). */
async function annotate(page, locator) {
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return;
  await page.evaluate((box) => {
    document.querySelectorAll('[data-tuto-annotation]').forEach((el) => el.remove());
    const ring = document.createElement('div');
    ring.dataset.tutoAnnotation = '1';
    Object.assign(ring.style, {
      position: 'fixed',
      left: `${box.x - 6}px`,
      top: `${box.y - 6}px`,
      width: `${box.width + 12}px`,
      height: `${box.height + 12}px`,
      border: '3px solid #FFC700',
      borderRadius: '16px',
      zIndex: '9999',
      pointerEvents: 'none',
      boxShadow: '0 0 0 4px rgba(255,199,0,0.25)',
    });
    document.body.append(ring);
  }, box);
}

/** Masquer les artefacts de dev (bouton « N » de Next.js, bandeau de
 *  la page d'aperçu) — ils ne font pas partie de l'interface. */
async function hideDevTools(page) {
  await page
    .addStyleTag({ content: 'nextjs-portal{display:none !important}' })
    .catch(() => undefined);
  await page.evaluate(() => {
    document.querySelectorAll('[data-tuto-banner]').forEach((el) => {
      el.style.display = 'none';
    });
  });
}

/** Choisir un quartier dans la combobox avec recherche (v2.22) : le
 *  `<select>` natif n'existe plus sur l'accueil — on tape le nom
 *  puis on touche l'option filtrée. (`selectOption` ne marche que
 *  sur un `<select>` : c'est ce qui cassait les captures depuis
 *  v2.22.) */
async function pickNeighborhood(page, label, name) {
  const input = page.getByLabel(label, { exact: true });
  await input.click();
  await input.fill(name);
  await page.getByRole('option', { name, exact: true }).click();
  await page.waitForTimeout(300);
}

async function shot(page, name, target = 'viewport') {
  const file = path.join(OUT_DIR, name);
  if (target === 'viewport') {
    await page.screenshot({ path: file });
  } else {
    await target.screenshot({ path: file });
  }
  const size = fs.statSync(file).size;
  console.log(`  ✓ ${name} (${Math.round(size / 1024)} Ko)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const executablePath = findChromium();
  if (!executablePath) {
    throw new Error(
      'Chromium introuvable dans ~/.cache/ms-playwright — lancez `npx playwright install chromium` une fois, ou définissez PLAYWRIGHT_CHROMIUM_PATH.',
    );
  }
  console.log(`Chromium : ${executablePath}`);
  console.log(`Base     : ${BASE_URL}`);
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    // Neutraliser les tutoriels pendant les captures (sinon la carte
    // d'accueil couvrirait le haut de la carte au premier lancement).
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem('stacks-drive-tuto-passager-vu', '1');
        window.localStorage.setItem('stacks-drive-tuto-chauffeur-vu', '1');
      } catch {
        // Stockage indisponible : on ferme la modale si elle apparaît.
      }
    });
    const page = await ctx.newPage();

    // ---------- Accueil : les vrais écrans passager ----------
    // La modale affiche ces captures en `object-cover` (haut visible) :
    // le contenu utile est donc cadré en haut de la feuille.
    console.log('Accueil (passager)…');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText('Où allez-vous ?').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(4000);
    await hideDevTools(page);
    // Feuille dépliée : la carte ET la feuille sont visibles en haut.
    await page.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await page.waitForTimeout(800);
    await shot(page, 'passager-01-carte.png');

    // Choisir un trajet réel (combobox avec recherche, v2.22).
    await pickNeighborhood(page, 'Départ', 'Aéroport Léon-Mba');
    await pickNeighborhood(page, 'Destination', 'Centre-ville');
    await page.waitForTimeout(1000); // estimation (300 ms) + prix animé
    // Haut de la feuille : départ / destination (+ cartes Solo/Groupe
    // avec leurs estimations juste en dessous).
    await page.locator('.sheet-glass').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    await annotate(page, page.getByLabel('Destination'));
    await shot(page, 'passager-02-trajet.png');

    // Solo / Groupe : la section complète (libellé + les deux cartes,
    // badge « LE MOINS CHER » compris), cadrée seule (affichée en
    // entier dans la modale, `fit: contain`).
    const typeSection = page.locator('div:has(> .grid-cols-2)').first();
    await typeSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await shot(page, 'passager-03-solo-groupe.png', typeSection);

    // Paiement : remonté en haut de la feuille.
    await page
      .getByLabel('Moyen de paiement')
      .evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(600);
    await annotate(page, page.getByLabel('Moyen de paiement'));
    await shot(page, 'passager-06-paiement.png');

    // ---------- Page d'aperçu dev : les vrais composants ----------
    console.log('Aperçu dev (composants réels, données démo)…');
    async function preview(ecran, file, locator, ready, waitMs = 2500) {
      await page.goto(`${BASE_URL}/tuto-apercu?ecran=${ecran}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });
      // Les pop-ups (demande, places) sont des overlays fixes : leur
      // conteneur `[data-tuto-ecran]` a une hauteur nulle — on attend
      // la boîte de dialogue elle-même, pas le conteneur.
      await (ready ?? page.locator('[data-tuto-ecran]').first()).waitFor({ timeout: 20000 });
      await page.waitForTimeout(waitMs);
      await hideDevTools(page);
      await shot(page, file, locator(page));
    }
    // Les pop-ups sont cadrées sur leur carte intérieure (pas sur
    // l'overlay plein écran, qui laisserait un grand vide au-dessus).
    const dialogCard = (name) =>
      page.getByRole('dialog', { name }).locator(':scope > div');
    await preview('propositions', 'passager-04-propositions.png', (p) =>
      p.locator('[data-tuto-ecran="propositions"]'),
    );
    await preview('pin', 'passager-05-pin.png', (p) => p.locator('[data-tuto-ecran="pin"]'));
    await preview('mise-en-ligne', 'chauffeur-01-mise-en-ligne.png', (p) =>
      p.locator('[data-tuto-ecran="mise-en-ligne"]'),
    );
    await preview(
      'demande',
      'chauffeur-02-demande.png',
      () => dialogCard('Nouvelle demande de course'),
      page.getByRole('dialog', { name: 'Nouvelle demande de course' }),
    );
    await preview(
      'places',
      'chauffeur-03-places.png',
      () => dialogCard('Places libres dans ton véhicule'),
      page.getByRole('dialog', { name: 'Places libres dans ton véhicule' }),
    );
    await preview('pin-saisie', 'chauffeur-04-pin.png', (p) =>
      p.locator('[data-tuto-ecran="pin-saisie"]'),
    );

    // ---------- Devenir chauffeur : la vraie page commission / dépôt ----------
    console.log('Devenir chauffeur (commission, dépôt)…');
    await page.goto(`${BASE_URL}/devenir-chauffeur`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await hideDevTools(page);
    await page.getByText('Tu gardes 92 à 95 % de chaque course').scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await shot(page, 'chauffeur-05-commission.png');
    // Défilement forcé et instantané : le titre est déjà partiellement
    // visible en bas d'écran, `scrollIntoViewIfNeeded` ne bougerait
    // pas — et le CSS `scroll-behavior: smooth` annulerait un
    // `scrollBy` enchaîné. On redescend de 90 px pour que l'en-tête
    // fixe ne masque pas le titre.
    await page
      .getByText('Un dépôt, et c’est tout')
      .evaluate((el) => {
        el.scrollIntoView({ block: 'start', behavior: 'instant' });
        window.scrollBy({ top: -90, behavior: 'instant' });
      });
    await page.waitForTimeout(800);
    await shot(page, 'chauffeur-06-reglement.png');

    console.log(`\n12 captures dans ${path.relative(process.cwd(), OUT_DIR)}/`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(`\nERREUR : ${err.message}`);
  process.exit(1);
});
