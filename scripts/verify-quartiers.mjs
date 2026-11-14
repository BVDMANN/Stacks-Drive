#!/usr/bin/env node
/** Vérification fonctionnelle du lot v2.22 (listes quartiers + pick-up).
 * Usage : serveur de dev actif sur http://localhost:3100, puis
 *   node /tmp/verify-lot-v222.mjs
 * Contrôle, dans un vrai Chromium :
 *  1. Listes départ/destination triées par ordre alphabétique (70 quartiers).
 *  2. Recherche par nom : accents/casse/séparateurs ignorés, résultats
 *     instantanés, message quand rien ne correspond, sélection au clic.
 *  3. Points de prise en charge : 10 lieux, estimation indicative
 *     Groupe/Solo vers la zone de référence, étiquette « Estimation —
 *     indicative », clic = départ.
 *  4. Estimation de course : ancre Nzeng-Ayong → Centre-ville (1 500 / 950).
 *  5. Règle 1 (spot-check) : squelette de prix visible pendant le recalcul.
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

function isSortedFr(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i - 1].localeCompare(arr[i], 'fr', { sensitivity: 'base' }) > 0) return arr[i - 1] + ' > ' + arr[i];
  }
  return null;
}

async function main() {
  const browser = await chromium.launch({ executablePath: exePath(), args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => fail(`erreur JS sur la page : ${e.message}`));

    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Tutoriel passager (premier lancement) : on le passe.
    try {
      await page.getByRole('dialog', { name: 'Tutoriel passager' }).waitFor({ timeout: 8000 });
      await page.getByRole('button', { name: 'Passer le tutoriel' }).click();
      await page.getByRole('dialog', { name: 'Tutoriel passager' }).waitFor({ state: 'detached', timeout: 5000 });
      ok('tutoriel passager passé');
    } catch { warn('modale tutoriel non vue (déjà vue ?) — on continue'); }

    // Feuille dépliée.
    await page.getByRole('button', { name: 'Agrandir la feuille' }).click();
    await page.waitForTimeout(700);

    // --- 1. Ordre alphabétique (départ) ---
    const depart = page.locator('#depart');
    await depart.click();
    await page.locator('#depart-quartiers').waitFor({ timeout: 5000 });
    const options = await page.locator('#depart-quartiers [role="option"]').allTextContents();
    const names = options.map((t) => t.trim());
    if (names.length === 70) ok(`liste départ : 70 quartiers`);
    else fail(`liste départ : ${names.length} quartiers (attendu 70)`);
    const badOrder = isSortedFr(names);
    if (!badOrder) ok(`liste départ triée par ordre alphabétique (1er : ${names[0]} — dernier : ${names[names.length - 1]})`);
    else fail(`liste départ NON triée : ${badOrder}`);
    await page.screenshot({ path: '/tmp/v222-combobox-ouverte.png' });

    // --- 2. Recherche par nom ---
    async function search(input, q, expectPresent, expectAbsent) {
      await input.click();
      await input.fill(q);
      await page.waitForTimeout(200);
      const items = await page.locator('#depart-quartiers [role="option"]').allTextContents();
      const got = items.map((t) => t.trim());
      for (const e of expectPresent) if (!got.includes(e)) fail(`recherche « ${q} » : « ${e} » absent (vu : ${got.join(', ') || 'rien'})`);
      for (const e of expectAbsent) if (got.includes(e)) fail(`recherche « ${q} » : « ${e} » ne devrait pas apparaître`);
      if (expectPresent.every((e) => got.includes(e))) ok(`recherche « ${q} » → ${got.length} résultat(s) dont ${expectPresent.join(', ')}`);
      return got;
    }
    await search(depart, 'mont', ['Mont-Bouët'], ['Nzeng-Ayong']);
    await search(depart, 'aeroport', ['Aéroport Léon-Mba'], ['Mont-Bouët']);
    await search(depart, 'nzeng ayong', ['Nzeng-Ayong'], ['Mont-Bouët']);
    await search(depart, 'AKÉBÉ', ['Akébé'], []);
    // Aucun résultat.
    await depart.click();
    await depart.fill('zzz');
    await page.waitForTimeout(200);
    const noResult = await page.getByText('Aucun quartier trouvé pour').count();
    if (noResult > 0) ok('recherche « zzz » → « Aucun quartier trouvé »');
    else fail('recherche « zzz » : message « Aucun quartier trouvé » absent');
    // Sélection au clic : Nzeng-Ayong.
    await depart.click();
    await depart.fill('nzeng');
    await page.waitForTimeout(200);
    await page.locator('#depart-quartiers [role="option"]', { hasText: 'Nzeng-Ayong' }).click();
    await page.waitForTimeout(200);
    if ((await depart.inputValue()) === 'Nzeng-Ayong') ok('sélection départ : Nzeng-Ayong');
    else fail(`départ après sélection : « ${await depart.inputValue()} » (attendu Nzeng-Ayong)`);
    await page.screenshot({ path: '/tmp/v222-recherche.png' });

    // --- Destination : ordre + recherche + estimation (ancre) ---
    const dest = page.locator('#destination');
    await dest.click();
    await page.locator('#destination-quartiers').waitFor({ timeout: 5000 });
    const destNames = (await page.locator('#destination-quartiers [role="option"]').allTextContents()).map((t) => t.trim());
    const badDest = isSortedFr(destNames);
    if (!badDest && destNames.length === 70) ok('liste destination triée (70 quartiers)');
    else fail(`liste destination : ${destNames.length} quartiers, tri : ${badDest ?? 'ok'}`);
    await dest.fill('centre');
    await page.waitForTimeout(200);
    await page.locator('#destination-quartiers [role="option"]', { hasText: 'Centre-ville' }).click();
    await page.waitForTimeout(800);
    // Panneau d'estimation (lecture directe, pas le texte de toute la
    // page : la ligne pick-up « Marché de Nzeng-Ayong » porte les
    // mêmes chiffres 1 500 / 950, elle ne doit pas faire office de preuve).
    const panel = page.locator('div:has(> p:text-is("Estimation — indicative"))').first();
    const panelGroupe = await panel.innerText();
    if (/950/.test(panelGroupe) && /4,8 km/.test(panelGroupe)) ok('estimation Nzeng-Ayong → Centre-ville : 950 Groupe, 4,8 km (ancre, panneau direct)');
    else fail(`panneau estimation Groupe : « ${panelGroupe.replace(/\n/g, ' | ')} »`);
    await page.getByRole('button', { name: /^Solo/ }).click();
    await page.waitForTimeout(700);
    const panelSolo = await panel.innerText();
    if (/1\s*500/.test(panelSolo)) ok('estimation Nzeng-Ayong → Centre-ville : 1 500 Solo (ancre, panneau direct)');
    else fail(`panneau estimation Solo : « ${panelSolo.replace(/\n/g, ' | ')} »`);
    await page.getByRole('button', { name: /Groupe/ }).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: '/tmp/v222-estimation.png' });

    // --- 3. Points de prise en charge ---
    const pickupSection = page.getByText('Points de prise en charge', { exact: false }).first();
    await pickupSection.scrollIntoViewIfNeeded();
    const pickupHeader = await page.getByText(/Points de prise en charge — estimation indicative vers/).first().textContent();
    if (/vers Centre-ville/.test(pickupHeader ?? '')) ok('points pick-up : zone de référence = Centre-ville (destination choisie)');
    else fail(`points pick-up : en-tête inattendu « ${pickupHeader} »`);
    const rows = page.locator('li button[aria-label^="Partir de"]');
    const rowCount = await rows.count();
    if (rowCount === 10) ok('points pick-up : 10 lieux');
    else fail(`points pick-up : ${rowCount} lieux (attendu 10)`);
    const rowLabels = await rows.allTextContents();
    const expected = ['Aéroport international Léon-Mba', 'Marché Mont-Bouët', 'Marché de Nzeng-Ayong', 'Stade de l’Amitié', 'Stade Omar Bongo', 'Gare d’Owendo', 'Gare Routière', 'Université Omar Bongo', 'CHU de Libreville', 'Radisson Blu Okoumé Palace'];
    for (const e of expected) if (!rowLabels.some((t) => t.includes(e))) fail(`point pick-up manquant : ${e}`);
    if (expected.every((e) => rowLabels.some((t) => t.includes(e)))) ok('points pick-up : les 10 lieux attendus sont là');
    const indicative = await page.getByText('Estimation — indicative', { exact: true }).count();
    if (indicative >= 10) ok(`chaque point pick-up porte « Estimation — indicative » (${indicative} occurrences)`);
    else fail(`« Estimation — indicative » : ${indicative} occurrences (attendu ≥ 10)`);
    if (/prix fixe|tarif fixe/i.test((await page.locator('body').innerText()).match(/Points de prise en charge[\s\S]*?Type de course/)?.[0] ?? '')) {
      // « Ce n'est pas un prix fixe » est la formulation autorisée — on vérifie qu'aucun prix fixe n'est AFFIRMÉ.
      warn('la section pick-up mentionne « prix fixe » (formulation de négation attendue — vérifier à la main)');
    }
    await page.screenshot({ path: '/tmp/v222-pickup.png' });

    // Clic sur l'aéroport = départ.
    await rows.filter({ hasText: 'Aéroport international Léon-Mba' }).click();
    await page.waitForTimeout(400);
    if ((await depart.inputValue()) === 'Aéroport Léon-Mba') ok('clic pick-up Aéroport → départ = Aéroport Léon-Mba');
    else fail(`clic pick-up Aéroport : départ = « ${await depart.inputValue()} »`);
    // L'estimation de référence suit la destination (Centre-ville) : l'aéroport a le supplément.
    const afterPick = await page.getByText(/Points de prise en charge — estimation indicative vers/).first().textContent();
    if (/vers Centre-ville/.test(afterPick ?? '')) ok('points pick-up : référence toujours Centre-ville après choix du départ');
    else fail(`points pick-up après clic : « ${afterPick} »`);

    // Changer la destination → la référence des pick-up suit.
    await dest.click();
    await dest.fill('nzeng');
    await page.waitForTimeout(200);
    await page.locator('#destination-quartiers [role="option"]', { hasText: 'Nzeng-Ayong' }).click();
    await page.waitForTimeout(600);
    const refAfter = await page.getByText(/Points de prise en charge — estimation indicative vers/).first().textContent();
    if (/vers Nzeng-Ayong/.test(refAfter ?? '')) ok('points pick-up : référence mise à jour vers Nzeng-Ayong quand la destination change');
    else fail(`points pick-up : référence non mise à jour (« ${refAfter} »)`);

    // --- 5. Règle 1 (spot-check) : squelette pendant le recalcul ---
    let skeletonSeen = false;
    await dest.click();
    await dest.fill('glass');
    const poll = page.waitForSelector('[aria-label="Calcul du prix…"]', { timeout: 1500 }).then(() => true).catch(() => false);
    await page.locator('#destination-quartiers [role="option"]', { hasText: 'Glass' }).click().catch(() => undefined);
    skeletonSeen = await poll;
    if (skeletonSeen) ok('règle 1 (spot-check) : squelette « Calcul du prix… » visible pendant le recalcul');
    else warn('règle 1 (spot-check) : squelette non capturé en 1,5 s (300 ms théoriques — vérifier dans le code, pas un échec)');
  } finally {
    await browser.close();
  }

  console.log(`\n${failures.length} échec(s), ${warnings.length} avertissement(s).`);
  if (failures.length > 0) { console.error('ÉCHECS :\n- ' + failures.join('\n- ')); process.exit(1); }
  console.log('Vérification v2.22 : OK.');
}

main().catch((err) => { console.error(`\nERREUR : ${err.message}`); process.exit(1); });
