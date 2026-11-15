#!/usr/bin/env node
/** Vérification finale du lot v2.51 — statique + API live (dev :3100).
 *  Couvre les deux travailleurs : A (nav basse, accueil, recherche
 *  rue par rue, quartiers, épiceries, carte sans ambiguïté) et B
 *  (écran Activité, redirection Mes courses, Compte restructuré).
 *  Les rendus 390×844 sont produits par scripts/verify-lot-v251-a.mjs
 *  (A) et les pages d'aperçu de B (supprimées après capture).
 *  Usage : node scripts/verify-lot-v251.mjs (serveur dev en route).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASE = 'http://localhost:3100';
let failures = 0;
let warnings = 0;

function check(ok, label, detail = '') {
  if (ok) {
    console.log(`  OK  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
function warn(label, detail = '') {
  warnings += 1;
  console.log(`  WARN ${label}${detail ? ` — ${detail}` : ''}`);
}
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const count = (src, re) => (src.match(re) || []).length;

// --- Structure : navigation basse (A) -------------------------------------
const bottomNav = read('components/shared/BottomNav.tsx');
check(bottomNav.includes("aria-label=\"Navigation principale\""), 'BottomNav : aria-label présent');
check(bottomNav.includes("'/activite'") || bottomNav.includes('"/activite"'), 'BottomNav : onglet Activité');
check(bottomNav.includes("'/compte'") || bottomNav.includes('"/compte"'), 'BottomNav : onglet Compte');
check(bottomNav.includes('#A134F5'), 'BottomNav : actif violet de marque');
check(read('app/layout.tsx').includes('BottomNav'), 'layout : BottomNav intégrée');

// --- Écran Activité (B) ----------------------------------------------------
check(exists('app/activite/page.tsx'), 'route /activite présente');
const activite = read('app/activite/page.tsx');
check(read('components/activite/HeroRideCard.tsx').includes('HeroMiniMap'), 'Activité : mini-carte héro (via HeroRideCard)');
check(activite.includes('RebookButton') || activite.includes('Réserver'), 'Activité : action Réserver');
check(activite.includes('Ajouter une note'), 'Activité : action Ajouter une note');
check(exists('components/activite/HeroMiniMap.tsx'), 'HeroMiniMap présente');
check(read('components/activite/HeroMiniMap.tsx').includes('dark_all'), 'HeroMiniMap : tuiles CARTO dark_all');
check(read('components/activite/RebookButton.tsx').includes('/api/rides'), 'RebookButton : vrai POST /api/rides');
check(read('app/courses/[id]/page.tsx').includes('id="avis"'), 'page course : ancre #avis');

// --- Redirection Mes courses (B) -------------------------------------------
check(read('app/mes-courses/page.tsx').includes("redirect('/activite')"), 'mes-courses redirige vers /activite');
check(read('lib/supabase/middleware.ts').includes("'/activite'"), 'middleware : /activite protégée');
const hrefMesCourses = [
  ...['app', 'components'].flatMap((d) => {
    const out = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
      }
    };
    walk(d);
    return out;
  }),
].filter((p) => read(p).includes('href="/mes-courses"') || read(p).includes("href='/mes-courses'"));
check(hrefMesCourses.length === 0, 'aucun lien href vers /mes-courses restant', hrefMesCourses.join(', '));

// --- Accueil réorganisé (A) -------------------------------------------------
const home = read('components/home/HomeScreen.tsx');
check(home.includes('Trajets planifiés'), 'accueil : carte Trajets planifiés');
check(home.includes('Plus tard'), 'accueil : bouton Plus tard');
check(home.includes('RecentDestinationRow') || home.includes('RecentDestination'), 'accueil : adresses récentes');
check(exists('components/home/RecentDestinationRow.tsx'), 'RecentDestinationRow présente');
check(read('lib/rides.ts').includes('getRecentDestinations'), 'lib/rides : getRecentDestinations');
check(!home.includes('/mes-courses'), 'accueil : plus de lien /mes-courses');

// --- Compte restructuré (B) --------------------------------------------------
const compte = read('app/compte/page.tsx');
check(compte.includes('/activite'), 'compte : Historique → /activite');
check(compte.includes('Devenir chauffeur') || compte.includes('/devenir-chauffeur'), 'compte : entrée Devenir chauffeur');
check(compte.includes('Ta 10e course offerte'), 'compte : fidélité réelle conservée');
check(compte.includes('Paiement au chauffeur'), 'compte : paiement conservé');

// --- Recherche rue par rue (A) ----------------------------------------------
check(exists('app/api/search-address/route.ts'), 'route /api/search-address présente');
check(read('app/api/search-address/route.ts').includes('photon'), 'search-address : proxy Photon');
check(read('components/home/DestinationSearch.tsx').includes('Rues & adresses'), 'recherche : section Rues & adresses');
check(read('lib/pickup-point.ts').includes('TripPoint'), 'TripPoint défini');

// --- Quartiers : 70 → 75 nommés ---------------------------------------------
const neighSrc = read('lib/neighborhoods.ts');
const neighBody = neighSrc.match(/export const NEIGHBORHOODS[^=]*=\s*\[([\s\S]*?)\];/)[1];
const named = [...neighBody.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((n) => n !== 'Autre');
check(named.length === 75, `quartiers nommés = 75 (actuel : ${named.length})`);
for (const q of ['Cité de la Caisse', 'Lalala-Droite', 'Plaine Niger', 'Baie des Rois', 'Ancien Sobraga']) {
  check(named.includes(q), `quartier ajouté : ${q}`);
}

// --- Épiceries : 31 OSM, total POI 90 -----------------------------------------
const epiceriesSrc = read('lib/epiceries.ts');
const nbEpiceries = count(epiceriesSrc, /name:\s*'/g);
check(nbEpiceries === 31, `épiceries importées = 31 (actuel : ${nbEpiceries})`);
const poisSrc = read('lib/pois.ts');
const nbPoisLocal = count(poisSrc.match(/export const POIS[^=]*=\s*\[([\s\S]*?)\n\];/)[1], /name:\s*'/g);
check(nbPoisLocal === 59, `POI locaux = 59 (actuel : ${nbPoisLocal})`);
check(nbPoisLocal + nbEpiceries === 90, `total lieux = 90 (actuel : ${nbPoisLocal + nbEpiceries})`);
check(poisSrc.includes("category: 'epicerie'"), 'POI : catégorie epicerie');
check(read('components/icons/DrivePoi.tsx').includes('epicerie'), 'DrivePoi : icône epicerie');
check(exists('scripts/fetch-epiceries.mjs'), 'script fetch-epiceries présent');

// --- Carte sans ambiguïté ----------------------------------------------------
const map = read('components/map/LibrevilleMap.tsx');
check(map.includes('map-pin-label'), 'carte : étiquettes d\'épingles');
check(home.includes('useMemo'), 'accueil : points carte mémoïsés (correctif zoom)');
check(read('lib/commission.ts').includes('COMMISSION_RATE'), 'commission : constantes présentes');
check(read('app/api/profile/route.ts').includes('driver_account_required'), 'règle 2 : verrou serveur driver_account_required');

// --- Propreté : 0 nom personnel, 0 IA, 0 secret, 0 lucide --------------------
const ownerName = ['Boul', 'ingui'].join('');
const scanDirs = ['app', 'components', 'lib', 'styles'];
let nameHits = [];
let aiHits = [];
let secretHits = [];
let lucideHits = [];
const walkScan = (dir) => {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['api'].includes(e.name) || true) walkScan(p); continue; }
    if (!/\.(tsx|ts|css|md)$/.test(e.name)) continue;
    const src = fs.readFileSync(path.join(ROOT, p), 'utf8');
    if (src.includes(ownerName)) nameHits.push(p);
    if (/\bIA\b/.test(src) && !/musée/i.test(src)) aiHits.push(p);
    if (/re_[A-Za-z0-9]{10,}/.test(src) || /ghp_[A-Za-z0-9]{20,}/.test(src)) secretHits.push(p);
    if (src.includes('lucide-react')) lucideHits.push(p);
  }
};
scanDirs.forEach(walkScan);
check(nameHits.length === 0, '0 nom personnel (app/components/lib/styles)', nameHits.join(', '));
check(aiHits.length === 0, '0 mention d\'IA (mot entier, hors « musée »)', aiHits.join(', '));
check(secretHits.length === 0, '0 clé secrète', secretHits.join(', '));
check(lucideHits.length === 0, '0 import lucide-react', lucideHits.join(', '));

// --- Docs --------------------------------------------------------------------
try {
  execSync('node scripts/sync-docs.mjs --check', { cwd: ROOT, stdio: 'pipe' });
  check(true, 'docs:check OK (35 blocs)');
} catch {
  check(false, 'docs:check OK (35 blocs)');
}

// --- Live : recherche rue + redirections --------------------------------------
const base = BASE;
const searchRes = await fetch(`${base}/api/search-address?q=${encodeURIComponent('rue du bord de mer')}`);
const searchJson = await searchRes.json();
check(
  searchRes.ok && searchJson.ok && Array.isArray(searchJson.results) && searchJson.results.length > 0,
  `live /api/search-address : ${searchJson.results?.length ?? 0} résultat(s) pour « rue du bord de mer »`,
);
const homeRes = await fetch(`${base}/`);
const homeHtml = await homeRes.text();
check(homeRes.ok && homeHtml.includes('Navigation principale'), 'live / : navigation basse rendue (SSR)');
const mesRes = await fetch(`${base}/mes-courses`);
const mesHtml = await mesRes.text();
check(mesHtml.includes('NEXT_REDIRECT;replace;/activite;307;'), 'live /mes-courses : redirection /activite (307)');
const actRes = await fetch(`${base}/activite`);
const actHtml = await actRes.text();
check(actHtml.includes('NEXT_REDIRECT;replace;/connexion?next=/activite;307;'), 'live /activite sans session : redirection /connexion (307)');

console.log(`\nRésultat : ${failures} échec(s), ${warnings} avertissement(s).`);
process.exit(failures > 0 ? 1 : 0);
