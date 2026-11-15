/* Vérification visuelle v2.47–v2.49 — rendus mobiles 390×844 (serveur dev port 3100).
   Ne pousse rien, ne modifie rien : lecture seule + captures dans /tmp. */
import { chromium } from 'playwright-core';

const BASE = 'http://localhost:3100';
const OUT = '/tmp/v247-249';

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const checks = [];
  const check = (label, ok) => {
    checks.push([label, !!ok]);
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}`);
  };

  // --- Accueil (passager non connecté : carte + feuille idle) ---
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(5000);
  // Fermer la carte d'accueil du tutoriel (non bloquante, v2.21) pour
  // dégager la barre flottante « Vers où ? ».
  const plusTard = page.getByText('Plus tard', { exact: true });
  if (await plusTard.count()) await plusTard.click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}-home-top.png` });
  // Déplier la feuille (cran mini 15 -> 58) via le bouton chevron
  // « Déplier la feuille » — la barre « Vers où ? » n'apparaît que
  // feuille dépliée (!isMini).
  const expand = page.getByLabel('Déplier la feuille');
  if (await expand.count()) {
    await expand.first().click();
  } else {
    await page.getByLabel('Agrandir la feuille').first().click().catch(() => {});
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}-home-sheet-up.png` });

  const bodyText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('barre "Vers où ?" visible', bodyText.includes('Vers où ?'));
  check('carte Groupe visible', bodyText.includes('Groupe'));
  check('carte Solo visible', bodyText.includes('Solo'));
  check('carte Confort visible', bodyText.includes('Confort'));
  check('badge LE MOINS CHER', bodyText.includes('LE MOINS CHER'));
  check('carte "Ta sécurité" visible', bodyText.includes('Ta sécurité'));
  check('SOS 112 visible', bodyText.includes('SOS'));
  check('estimation indicative mentionnée', /estimation/i.test(bodyText));
  // Épingle centrale : la surcouche .map-center-pin n'existe qu'en mode ajustement ;
  // on vérifie au moins que la carte Leaflet est montée et que le marqueur départ existe.
  check('carte Leaflet montée', (await page.locator('.leaflet-container').count()) > 0);
  check('pas de libellé Yango copié ("Où allons-nous")', !bodyText.includes('Où allons-nous'));
  check('pas de carte promo', !/1RE FOIS|YANGO EST ARRIVÉ/i.test(bodyText));

  // Ouvrir la recherche de destination (barre "Vers où ?") et taper "pharmacie".
  const versOu = page.getByLabel('Vers où ? Rechercher une destination').first();
  if (await versOu.count()) {
    await versOu.click().catch(() => {});
    await page.waitForTimeout(1200);
    const search = page.locator('input[placeholder*="lieu"], input[placeholder*="quartier"], input[type="search"]').first();
    if (await search.count()) {
      await search.fill('pharmacie');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}-search-pharmacie.png` });
      const searchText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
      check('recherche "pharmacie" -> résultats', /Pharmacie/i.test(searchText));
    } else {
      check('champ de recherche destination présent', false);
    }
  } else {
    check('barre "Vers où ?" cliquable', false);
  }

  // --- /compte sans session : redirection connexion attendue ---
  const resp = await page.goto(BASE + '/compte', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  check('/compte sans session -> redirection connexion', page.url().includes('/connexion'));
  await page.screenshot({ path: `${OUT}-compte-redirect.png` });

  // --- /aide (page publique, structure de sécurité) ---
  await page.goto(BASE + '/aide', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  check('page /aide joignable', (await page.locator('body').innerText()).length > 200);

  const failed = checks.filter(([, ok]) => !ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} vérifications OK`);
  await browser.close();
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('ERREUR', e.message);
  process.exit(2);
});
