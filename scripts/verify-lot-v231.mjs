#!/usr/bin/env node
/** verify-lot-v231.mjs — Vérification locale de la « Carte zonée quartier » (v2.31).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) :
 *  - la logique pure importée de `lib/geo.ts` : `MAP_INITIAL_ZOOM` =
 *    14, `MAP_MIN_ZOOM` = 12, `SERVICE_BOUNDS` couvre les 70
 *    quartiers de `lib/neighborhoods.ts` (et rien d'autre : Paris,
 *    Ntoum-est, sud lointain dehors), `isInServiceArea` (dedans /
 *    dehors, y compris un point à 20 km de Libreville — l'ancien
 *    seuil « 60 km du quartier le plus proche » l'aurait placé) ;
 *  - les branchements relus DEPUIS les fichiers livrés : ouverture
 *    au zoom quartier sur l'ancre (GPS → brouillon → Centre-ville),
 *    cercle périmètre 5 km sur `DRIVERS_AROUND_RADIUS_KM` (pas un
 *    second chiffre), distinct du radar pulsé, qui suit le départ
 *    manuel ; « Me localiser » = test d'appartenance à la zone +
 *    message « service à Libreville pour l'instant », carte non
 *    déplacée hors zone ; `maxBounds` + `maxBoundsViscosity` fermes ;
 *    listes départ / destination = quartiers de Libreville
 *    uniquement (`SELECTABLE_NEIGHBORHOODS`, « Autre » exclu) ;
 *  - que `lib/commission.ts` (5 % puis 8 %, plafond 10 %) et
 *    `lib/pricing.ts` ne sont pas touchés par le lot, qu'aucun
 *    nouveau cron Vercel n'est ajouté (`vercel.json` inchangé),
 *    qu'aucune migration n'est attendue (le lot est 100 % client) ;
 *  - les 2 RÈGLES (priorité n°1) : barre de chargement partout où
 *    il y a un temps d'attente, et switch passager → chauffeur
 *    impossible sans compte chauffeur (redirection
 *    « Devenir chauffeur », contrôle serveur) ;
 *  - aucun marqueur de fonctionnalité future (« bientôt »,
 *    « à venir ») dans les fichiers du lot ;
 *  - HTTP local (serveur de dev port 3100) : accueil 200, routes
 *    protégées sans session (401/503, jamais 500 ni fuite de données).
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le rendu
 *  visuel en vrai navigateur (zoom 14 au chargement frais, cercle
 *  5 km ancré et qui suit le départ, dézoom propre jusqu'au zoom 12,
 *  impossibilité de défiler hors zone, « Me localiser » hors zone
 *  depuis un vrai GPS) — à vérifier en Playwright / sur le téléphone
 *  du propriétaire après le push (captures dans
 *  ~/workspace/stacks-drive/captures-carte-zonee-v2.31/).
 *
 *  Usage : node scripts/verify-lot-v231.mjs (sortie 0 = tout passe).
 *  Le serveur de dev doit tourner sur le port 3100 (ou DEV_URL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

// Résolution `.ts` pour les imports relatifs des modules lib
// (Node ESM exige une extension, le code Next.js n'en met pas).
register('./ts-resolve-hooks.mjs', import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEV = process.env.DEV_URL ?? 'http://localhost:3100';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p, s) => read(p).includes(s);

// --- 1. Logique pure : zooms, zone de service, appartenance ---------
const geo = await import('../lib/geo.ts');
const { MAP_INITIAL_ZOOM, MAP_CITY_ZOOM, MAP_MIN_ZOOM, SERVICE_BOUNDS, isInServiceArea } = geo;
const { NEIGHBORHOOD_COORDS } = await import('../lib/neighborhoods.ts');

check('zoom d’ouverture = zoom quartier (14)', MAP_INITIAL_ZOOM === 14);
check('zoom ville = 12', MAP_CITY_ZOOM === 12);
check('zoom min = 12 (vue ville accessible, rien en dessous)', MAP_MIN_ZOOM === 12);
check('zoom min = zoom ville', MAP_MIN_ZOOM === MAP_CITY_ZOOM);

// La zone couvre tous les quartiers (avec marge) — et rien d'autre.
const quartiers = Object.entries(NEIGHBORHOOD_COORDS).filter(([n]) => n !== 'Autre');
const allInside = quartiers.every(([, c]) => isInServiceArea(c.lat, c.lng));
check('SERVICE_BOUNDS couvre les 70 quartiers', quartiers.length === 70 && allInside, `${quartiers.length} quartiers`);
check(
  'marge ~9 km autour des quartiers (ni trop serrée ni pays entier)',
  SERVICE_BOUNDS.south < 0.304 - 0.05 &&
    SERVICE_BOUNDS.north > 0.611 + 0.05 &&
    SERVICE_BOUNDS.west < 9.322 - 0.05 &&
    SERVICE_BOUNDS.east > 9.674 + 0.05 &&
    SERVICE_BOUNDS.north - SERVICE_BOUNDS.south < 0.6 &&
    SERVICE_BOUNDS.east - SERVICE_BOUNDS.west < 0.7,
  `S ${SERVICE_BOUNDS.south} N ${SERVICE_BOUNDS.north} O ${SERVICE_BOUNDS.west} E ${SERVICE_BOUNDS.east}`
);
check('Centre-ville dans la zone', isInServiceArea(0.3901, 9.4544) === true);
check('Nzeng-Ayong dans la zone', isInServiceArea(0.43, 9.47) === true);
check('Cap Esterias dans la zone', isInServiceArea(0.611, 9.322) === true);
check('Nkoltang dans la zone', isInServiceArea(0.364, 9.674) === true);
check('Paris hors zone (test depuis la France)', isInServiceArea(48.85, 2.35) === false);
check(
  'point à ~21 km au sud de Libreville hors zone (ancien seuil 60 km l’aurait placé)',
  isInServiceArea(0.2, 9.45) === false
);
check('point à ~25 km à l’est de Nkoltang hors zone', isInServiceArea(0.39, 9.9) === false);
check('Ntoum (est, ~9,78) hors zone', isInServiceArea(0.39, 9.78) === false);
check('sud lointain (0,10) hors zone', isInServiceArea(0.1, 9.45) === false);

// --- 2. Carte : ouverture, bornes, cercle périmètre ------------------
const map = read('components/map/LibrevilleMap.tsx');
check('carte : zoom d’ouverture = MAP_INITIAL_ZOOM (pas de littéral 12)', has('components/map/LibrevilleMap.tsx', 'zoom: MAP_INITIAL_ZOOM') && !/zoom: 12,/.test(map));
check('carte : minZoom = MAP_MIN_ZOOM', has('components/map/LibrevilleMap.tsx', 'minZoom: MAP_MIN_ZOOM'));
check('carte : maxBounds sur SERVICE_BOUNDS', has('components/map/LibrevilleMap.tsx', 'SERVICE_BOUNDS') && has('components/map/LibrevilleMap.tsx', 'maxBounds:'));
check('carte : bornes fermes (maxBoundsViscosity 1.0)', has('components/map/LibrevilleMap.tsx', 'maxBoundsViscosity: 1.0'));
check(
  'carte : cercle périmètre sur DRIVERS_AROUND_RADIUS_KM (pas un second chiffre)',
  has('components/map/LibrevilleMap.tsx', 'radius: DRIVERS_AROUND_RADIUS_KM * 1000')
);
check(
  'carte : cercle périmètre distinct du radar (or pointillé, pas cyan pulsé)',
  has('components/map/LibrevilleMap.tsx', "color: '#FFD60A'") &&
    has('components/map/LibrevilleMap.tsx', "dashArray: '6 6'") &&
    has('components/map/LibrevilleMap.tsx', 'perimeterCenter')
);
check('carte : tiers de libellés inchangés (11 / 13 / 14)', /z >= 11\) labelMajor/.test(map) && /z >= 13\) labelMid/.test(map) && /z >= 14\) labelMinor/.test(map));

// --- 3. Accueil : ancrage, Me localiser, suivi du départ ------------
const home = read('components/home/HomeScreen.tsx');
check(
  'accueil : géolocalisation silencieuse au chargement (5 s, sans message d’erreur)',
  has('components/home/HomeScreen.tsx', 'getUserPosition(5000)')
);
check(
  'accueil : ancrage GPS → brouillon → Centre-ville (priorités documentées)',
  has('components/home/HomeScreen.tsx', 'isInServiceArea(pos.lat, pos.lng)') &&
    has('components/home/HomeScreen.tsx', 'NEIGHBORHOOD_COORDS[d.pickup')
);
check('accueil : départ calé sur le quartier le plus proche du GPS', has('components/home/HomeScreen.tsx', 'setPickup(nearest.neighborhood)'));
check(
  'accueil : « Me localiser » = test d’appartenance à la zone (plus de seuil 60 km)',
  has('components/home/HomeScreen.tsx', 'if (!isInServiceArea(pos.lat, pos.lng))') &&
    !has('components/home/HomeScreen.tsx', 'distanceKm > 60')
);
check(
  'accueil : « Me localiser » hors zone = message « service à Libreville pour l’instant »',
  has('components/home/HomeScreen.tsx', "le service est à Libreville pour l'instant")
);
check(
  'accueil : « Me localiser » et « Recentrer » au zoom quartier (14, pas 15 / 12)',
  has('components/home/HomeScreen.tsx', 'zoom: MAP_INITIAL_ZOOM') && !/zoom: 15,/.test(home) && !/zoom: 12,/.test(home)
);
check(
  'accueil : cercle périmètre branché (prop, null en mode chauffeur)',
  has('components/home/HomeScreen.tsx', 'perimeterCenter={isChauffeurMode ? null : perimeterCenter}')
);
check(
  'accueil : le cercle suit le départ manuel (favoris + trajets fréquents passent par handlePickupChange)',
  has('components/home/HomeScreen.tsx', 'handlePickupChange(f.neighborhood') &&
    has('components/home/HomeScreen.tsx', 'handlePickupChange(f.pickup)')
);

// --- 4. Listes départ / destination : Libreville uniquement ----------
const select = read('components/shared/NeighborhoodSelect.tsx');
check(
  'listes : SELECTABLE_NEIGHBORHOODS (70 quartiers, « Autre » exclu)',
  has('components/shared/NeighborhoodSelect.tsx', 'SELECTABLE_NEIGHBORHOODS') &&
    !select.replaceAll('SELECTABLE_NEIGHBORHOODS', '').includes('NEIGHBORHOODS')
);
check(
  'listes : « Autre » exclu de SELECTABLE_NEIGHBORHOODS',
  has('lib/neighborhoods.ts', "filter((n) => n !== 'Autre')")
);

// --- 5. Prix / commission / cron / migration -------------------------
const commission = read('lib/commission.ts');
check(
  'commission intouchée (5 % puis 8 %, plafond 10 %)',
  commission.includes('0.05') && commission.includes('0.08') && commission.includes('0.1')
);
check(
  'aucun nouveau cron Vercel',
  (JSON.parse(read('vercel.json')).crons ?? []).length === 2
);
check(
  'aucune migration v2.31 (lot 100 % client)',
  !fs.existsSync(path.join(ROOT, 'supabase/migration-v2.31.sql'))
);

// --- 6. Les 2 règles ---------------------------------------------------
check(
  'règle 1 : barre de chargement (squelettes / Envoi… / Mise à jour…)',
  has('components/home/HomeScreen.tsx', 'Envoi…') &&
    (has('components/driver/DriverHome.tsx', 'Mise à jour') ||
      has('components/driver/DriverDashboard.tsx', 'Mise à jour'))
);
check(
  'règle 2 : switch chauffeur verrouillé côté serveur',
  has('app/api/profile/route.ts', 'driver_account_required') &&
    has('app/tableau-de-bord/page.tsx', 'Devenir chauffeur')
);

// --- 7. Pas de « bientôt / à venir » ------------------------------------
const lotFiles = [
  'lib/geo.ts',
  'lib/neighborhoods.ts',
  'components/map/LibrevilleMap.tsx',
  'components/home/HomeScreen.tsx',
];
const futureMarkers = lotFiles.filter((f) => /bientôt|à venir/i.test(read(f)));
check('aucun « bientôt / à venir » dans les fichiers du lot', futureMarkers.length === 0, futureMarkers.join(', '));

// --- 8. HTTP local -------------------------------------------------------
async function http(pathname) {
  try {
    const res = await fetch(`${DEV}${pathname}`, { redirect: 'manual' });
    return res.status;
  } catch {
    return null;
  }
}
const homeStatus = await http('/');
check('HTTP : accueil 200', homeStatus === 200, `obtenu ${homeStatus}`);
const mesCourses = await http('/mes-courses');
check('HTTP : /mes-courses redirige sans session (pas de fuite)', mesCourses === 307 || mesCourses === 303 || mesCourses === 302, `obtenu ${mesCourses}`);

console.log(failures === 0 ? '\nv2.31 : tout passe.' : `\nv2.31 : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
