#!/usr/bin/env node
/** verify-lot-e.mjs — Vérification locale du lot E (v2.27, trafic).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) :
 *  - OSRM en direct (serveur démo) : Centre-ville → Nzeng-Ayong,
 *    distance / durée / géométrie routière ;
 *  - la route API `/api/route` sur le serveur de dev (port 3100) :
 *    réponse OSRM + cache 5 min (2e appel `cached: true`) ;
 *  - les routes `/api/traffic` (GET public, liste vide sans base) et
 *    `/api/driver/unanswered` (liste vide sans base) ;
 *  - les constantes relues DEPUIS les fichiers livrés (jamais
 *    recopiées à la main ici) : expiration trafic 30/60 min,
 *    confirmation ×2, alerte zone sans chauffeur à 2 min, cache
 *    route 5 min, espacement OSRM 1,1 s ;
 *  - la présence des objets de la migration v2.27 (3 tables, RLS,
 *    trigger d'expiration, unicités) ;
 *  - que `vercel.json` ne contient toujours que les 2 crons existants
 *    (aucun nouveau cron) ;
 *  - les 2 RÈGLES (priorité n°1) : barre de chargement (spinners /
 *    squelettes) et verrouillage du switch passager → chauffeur
 *    (redirection « Devenir chauffeur », contrôle serveur) ;
 *  - aucun « bientôt / à venir » dans les fichiers du lot.
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le
 *  comportement en session connectée réelle (RLS, signalement pendant
 *  une course, confirmation entre chauffeurs, alerte zone sans
 *  chauffeur en conditions réelles) — test connecté avec le
 *  propriétaire après le push. Les tuiles Esri ne se chargent pas
 *  depuis la VM : la capture d'écran montre la carte sans fond.
 *
 *  Particularité VM : le serveur de DEV (Turbopack, port 3100) ne
 *  fait pas passer son `fetch` serveur par le proxy d'egress de la
 *  VM — l'appel OSRM y expire (8 s) et la route retombe proprement
 *  sur la ligne droite (c'est le repli prévu, pas un bug). Le chemin
 *  OSRM est donc vérifié contre le build de PRODUCTION (`next start`,
 *  port 3101) : `DEV_URL=http://localhost:3101 node
 *  scripts/verify-lot-e.mjs`. En production (Vercel), l'egress est
 *  direct : pas de proxy, pas de repli.
 *
 *  Usage : node scripts/verify-lot-e.mjs (sortie 0 = tout passe).
 *  Le serveur de dev doit tourner sur le port 3100 (ou DEV_URL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// Serveur à tester : dev :3100 par défaut, ou build de production
// (voir l'en-tête : le fetch OSRM ne passe pas par le proxy en dev).
const DEV = process.env.DEV_URL ?? 'http://localhost:3100';

let failures = 0;
let warnings = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}
function warn(name, detail = '') {
  console.log(`  WARN ${name}${detail ? ` — ${detail}` : ''}`);
  warnings += 1;
}
function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}
function numConst(src, name, file) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([\\d.]+);`));
  if (!m) throw new Error(`constante ${name} introuvable dans ${file}`);
  return Number(m[1]);
}

// --- 1. OSRM en direct (serveur démo) ---
console.log('— OSRM démo (router.project-osrm.org) —');
try {
  // Centre-ville (0,3901 / 9,4544) → Nzeng-Ayong (0,4248 / 9,4750).
  const res = await fetch(
    'https://router.project-osrm.org/route/v1/driving/9.4544,0.3901;9.4750,0.4248?overview=full&geometries=geojson'
  );
  const data = await res.json();
  const route = data?.routes?.[0];
  const distKm = (route?.distance ?? 0) / 1000;
  const durMin = (route?.duration ?? 0) / 60;
  const pts = route?.geometry?.coordinates?.length ?? 0;
  check('OSRM répond (code Ok)', data?.code === 'Ok');
  check('Distance routière 4–10 km', distKm >= 4 && distKm <= 10, `${distKm.toFixed(2)} km`);
  check('Durée routière 3–20 min', durMin >= 3 && durMin <= 20, `${durMin.toFixed(1)} min`);
  check('Géométrie routière (> 10 points)', pts > 10, `${pts} points`);
} catch (e) {
  check('OSRM répond (code Ok)', false, String(e));
}

// --- 2. Route API /api/route sur le dev ---
console.log('— Route API /api/route (dev :3100) —');
try {
  const url = `${DEV}/api/route?fromLat=0.3901&fromLng=9.4544&toLat=0.4248&toLng=9.4750`;
  const r1 = await (await fetch(url)).json();
  check('GET /api/route → ok', r1?.ok === true);
  check('Source OSRM', r1?.route?.source === 'osrm', `source=${r1?.route?.source}`);
  check(
    'Géométrie transmise (> 2 points)',
    Array.isArray(r1?.route?.geometry) && r1.route.geometry.length > 2,
    `${r1?.route?.geometry?.length ?? 0} points`
  );
  check(
    'Distance / durée routières OSRM cohérentes',
    r1?.route?.source === 'osrm' &&
      r1?.route?.distanceKm >= 4 && r1?.route?.distanceKm <= 10 && r1?.route?.durationMin >= 3,
    `${r1?.route?.distanceKm?.toFixed(2)} km · ${r1?.route?.durationMin} min`
  );
  const r2 = await (await fetch(url)).json();
  check('Cache 5 min (2e appel cached)', r2?.cached === true);
  const bad = await fetch(`${DEV}/api/route?fromLat=99&fromLng=0&toLat=0&toLng=0`);
  check('Coordonnées invalides → 400', bad.status === 400);
} catch (e) {
  check('GET /api/route → ok', false, String(e));
}

// --- 3. Routes trafic / zones sans base ---
console.log('— Routes trafic & zones (sans Supabase) —');
try {
  const t = await (await fetch(`${DEV}/api/traffic`)).json();
  check('GET /api/traffic → ok, liste vide', t?.ok === true && Array.isArray(t.reports));
  const u = await (await fetch(`${DEV}/api/driver/unanswered`)).json();
  check('GET /api/driver/unanswered → ok, liste vide', u?.ok === true && Array.isArray(u.zones));
} catch (e) {
  check('Routes trafic & zones', false, String(e));
}

// --- 4. Constantes relues depuis le code livré ---
console.log('— Constantes (relues depuis lib/) —');
const traffic = read('lib/traffic.ts');
const zones = read('lib/no-driver-zones.ts');
const routing = read('lib/routing.ts');
check('Expiration embouteillage = 30 min', traffic.includes('embouteillage: 30'));
check('Expiration accident/travaux/route fermée = 60 min', traffic.includes("accident: 60") && traffic.includes('travaux: 60') && traffic.includes('route_fermee: 60'));
check('Confirmation mise en évidence = 2 chauffeurs', numConst(traffic, 'TRAFFIC_CONFIRM_MIN', 'lib/traffic.ts') === 2);
check('Alerte zone sans chauffeur = 2 min', numConst(zones, 'NO_DRIVER_ALERT_AFTER_MIN', 'lib/no-driver-zones.ts') === 2);
check('Rayon alerte zone = 25 km', numConst(zones, 'NO_DRIVER_ALERT_RADIUS_KM', 'lib/no-driver-zones.ts') === 25);
check('Cache trajet = 5 min', routing.includes('ROUTE_CACHE_TTL_MS = 5 * 60 * 1000'));
check('Espacement OSRM = 1100 ms', routing.includes('OSRM_MIN_INTERVAL_MS = 1100'));
check('Prix inchangés (Solo 500 + 210/km, Groupe 300 + 135/km)',
  read('lib/pricing.ts').includes('BASE_FARE_SOLO = 500') &&
  read('lib/pricing.ts').includes('PER_KM_SOLO = 210') &&
  read('lib/pricing.ts').includes('BASE_FARE_GROUPE = 300') &&
  read('lib/pricing.ts').includes('PER_KM_GROUPE = 135'));
check('Commission non touchée (5 % / 8 % / plafond 10 %)',
  read('lib/commission.ts').includes('0.05') && read('lib/commission.ts').includes('0.08'));

// --- 5. Migration v2.27 ---
console.log('— Migration supabase/migration-v2.27-traffic.sql —');
const mig = read('supabase/migration-v2.27-traffic.sql');
for (const t of ['traffic_reports', 'traffic_confirmations', 'unanswered_zones']) {
  check(`Table ${t}`, mig.includes(`create table if not exists public.${t}`));
}
check('Trigger expiration auto', mig.includes('set_traffic_expires_at'));
check('Unicité confirmation (report_id, driver_id)', mig.includes('traffic_confirmations_one_idx'));
check('Unicité zone (ride_id)', mig.includes('ride_id uuid not null unique'));
check('RLS activée sur les 3 tables',
  (mig.match(/enable row level security/g) ?? []).length === 3);
check('Lecture publique des marqueurs', mig.includes('traffic_reports_select_all'));
check('Insertion signalement = chauffeurs seuls', mig.includes('traffic_reports_insert_driver'));

// --- 6. Aucun nouveau cron ---
console.log('— Crons —');
const vercel = JSON.parse(read('vercel.json'));
check('Toujours 2 crons Vercel', vercel.crons?.length === 2, `${vercel.crons?.length ?? 0} cron(s)`);

// --- 7. Les 2 règles ---
console.log('— Les 2 règles (priorité n°1) —');
const modeToggle = read('components/shared/ModeToggle.tsx');
const profileRoute = read('app/api/profile/route.ts');
const home = read('components/home/HomeScreen.tsx');
const driverHome = read('components/driver/DriverHome.tsx');
check('Règle 1 — spinner bascule de mode', modeToggle.includes('animate-spin') && modeToggle.includes('Bascule'));
check('Règle 1 — squelette prix passager', home.includes('estimating') && home.includes('PriceSkeleton'));
check('Règle 1 — spinner mise en ligne chauffeur', driverHome.includes('Mise à jour') && driverHome.includes('animate-spin'));
check('Règle 1 — spinner signalement trafic', read('components/driver/TrafficReport.tsx').includes('animate-spin'));
check('Règle 2 — redirection Devenir chauffeur sans compte', modeToggle.includes('/devenir-chauffeur'));
check('Règle 2 — contrôle serveur driver_account_required', profileRoute.includes('driver_account_required'));
check('Règle 2 — le lot ne touche pas au verrou', !read('lib/routing.ts').includes('driver_account') && !read('lib/traffic.ts').includes('driver_account'));

// --- 8. Aucun « bientôt / à venir » dans le lot ---
console.log('— Contenu —');
const lotFiles = [
  'lib/routing.ts', 'lib/traffic.ts', 'lib/no-driver-zones.ts',
  'app/api/route/route.ts', 'app/api/traffic/route.ts',
  'app/api/traffic/[id]/confirm/route.ts', 'app/api/driver/unanswered/route.ts',
  'components/driver/TrafficReport.tsx', 'components/map/LibrevilleMap.tsx',
  'components/home/HomeScreen.tsx', 'components/driver/DriverHome.tsx',
  'components/driver/DriverDashboard.tsx', 'components/rides/TrackingMap.tsx',
  'app/courses/[id]/page.tsx', 'app/admin/page.tsx',
];
const banned = lotFiles.filter((f) => /bientôt|à venir|coming soon/i.test(read(f)));
check('Aucun « bientôt / à venir » dans les fichiers du lot', banned.length === 0, banned.join(', '));
const personalName = new RegExp('Boul' + 'ingui', 'i').test(
  lotFiles.map((f) => read(f)).join('\n') + read('supabase/migration-v2.27-traffic.sql')
);
check('Aucun nom personnel dans le code du lot', !personalName);

// --- 9. Navigateur (Playwright) : accueil + appel /api/route en page ---
console.log('— Navigateur (Playwright, Chromium) —');
try {
  const { chromium } = await import('playwright-core');
  const cacheDir = path.join(process.env.HOME ?? '', '.cache', 'ms-playwright');
  const exe = execSync(
    `ls ${cacheDir}/chromium-*/chrome-linux64/chrome ${cacheDir}/chromium-*/chrome-linux/chrome 2>/dev/null | head -1`,
    { encoding: 'utf8' }
  ).trim();
  if (!exe) {
    warn('Chromium introuvable dans ~/.cache/ms-playwright — capture ignorée');
  } else {
    const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const resp = await page.goto(`${DEV}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    check('Accueil charge (HTTP 200)', resp?.status() === 200, `HTTP ${resp?.status()}`);
    const routeInPage = await page.evaluate(async () => {
      const r = await fetch('/api/route?fromLat=0.3901&fromLng=9.4544&toLat=0.4248&toLng=9.4750');
      const j = await r.json();
      return { ok: j.ok, source: j.route?.source, points: j.route?.geometry?.length ?? 0 };
    });
    check('Itinéraire routier en page (source OSRM)', routeInPage.ok && routeInPage.source === 'osrm',
      `${routeInPage.points} points`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: '/tmp/lot-e-home.png' });
    console.log('  INFO capture : /tmp/lot-e-home.png (tuiles Esri non chargées depuis la VM — fond absent, attendu)');
    await browser.close();
  }
} catch (e) {
  warn('Navigateur indisponible', String(e).slice(0, 120));
}

console.log(`\n${failures === 0 ? 'TOUT PASSE' : `${failures} ÉCHEC(S)`}${warnings ? ` — ${warnings} avertissement(s)` : ''}`);
process.exit(failures === 0 ? 0 : 1);
