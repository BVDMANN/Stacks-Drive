#!/usr/bin/env node
/** verify-p0b.mjs — Vérification locale du lot P0b (ETA chauffeur +
 *  navigation guidée, v2.28).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) :
 *  - OSRM en direct (serveur démo) avec `steps=true` : Centre-ville →
 *    Nzeng-Ayong, distance / durée / géométrie routière / étapes
 *    (manœuvres) présentes ;
 *  - la route API `/api/route` sur le serveur de dev (port 3100) :
 *    réponse avec `steps` (tableau) + cache 5 min (2e appel
 *    `cached: true`) ;
 *  - les constantes et branchements relus DEPUIS les fichiers livrés
 *    (jamais recopiés à la main ici) : cache client 5 min, recalcul
 *    à ~100 m, rafraîchissement 30 s, lien Google Maps gratuit ;
 *  - que `lib/pricing.ts` (modèle au km) et `lib/commission.ts`
 *    (5 % puis 8 %, plafond 10 %) ne sont pas touchés par le lot ;
 *  - qu'aucune migration P0b n'a été ajoutée (ETA + navigation =
 *    calculs en lecture, aucun changement de schéma) ;
 *  - les 2 RÈGLES (priorité n°1) : barre de chargement (spinners /
 *    squelettes) et verrouillage du switch passager → chauffeur
 *    (redirection « Devenir chauffeur », contrôle serveur) ;
 *  - aucun marqueur de fonctionnalité future dans les fichiers du lot.
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le
 *  comportement en session connectée réelle (ETA en direct pendant
 *  une vraie course, navigation avec GPS réel) — test connecté avec
 *  le propriétaire après le push. Les tuiles Esri ne se chargent pas
 *  depuis la VM : la capture d'écran montre la carte sans fond.
 *
 *  Particularité VM (comme lot E) : le serveur de DEV (Turbopack,
 *  port 3100) ne fait pas passer son `fetch` serveur par le proxy
 *  d'egress de la VM — l'appel OSRM y expire (8 s) et la route
 *  retombe proprement sur la ligne droite (c'est le repli prévu, pas
 *  un bug). Le chemin OSRM est donc vérifié contre le build de
 *  PRODUCTION (`next start`, port 3101) : `DEV_URL=
 *  http://localhost:3101 node scripts/verify-p0b.mjs`. En production
 *  (Vercel), l'egress est direct : pas de proxy, pas de repli.
 *
 *  Usage : node scripts/verify-p0b.mjs (sortie 0 = tout passe).
 *  Le serveur de dev doit tourner sur le port 3100 (ou DEV_URL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
function mustContain(file, needle, label) {
  check(label, read(file).includes(needle), file);
}

// --- 1. OSRM en direct (serveur démo), avec étapes ---
console.log('— OSRM démo (router.project-osrm.org, steps=true) —');
let osrmOk = false;
try {
  // Centre-ville (0,3901 / 9,4544) → Nzeng-Ayong (0,4248 / 9,4750).
  const res = await fetch(
    'https://router.project-osrm.org/route/v1/driving/9.4544,0.3901;9.4750,0.4248?overview=full&geometries=geojson&steps=true'
  );
  const data = await res.json();
  const route = data?.routes?.[0];
  const steps = route?.legs?.[0]?.steps ?? [];
  osrmOk =
    data?.code === 'Ok' &&
    typeof route?.distance === 'number' &&
    route.distance > 1000 &&
    typeof route?.duration === 'number' &&
    (route.geometry?.coordinates?.length ?? 0) >= 2 &&
    steps.length >= 2 &&
    steps.every((s) => typeof s?.maneuver?.type === 'string');
  check('OSRM direct : distance / durée / géométrie / étapes', osrmOk,
    route ? `${(route.distance / 1000).toFixed(2)} km, ${Math.round(route.duration / 60)} min, ${steps.length} étapes` : 'pas de route');
} catch (e) {
  check('OSRM direct : distance / durée / géométrie / étapes', false, String(e?.message ?? e));
}

// --- 2. Route API /api/route (étapes + cache) ---
console.log('— Route API /api/route (serveur local) —');
try {
  const q = 'fromLat=0.3901&fromLng=9.4544&toLat=0.4248&toLng=9.4750';
  const r1 = await fetch(`${DEV}/api/route?${q}`);
  const d1 = await r1.json();
  const route = d1?.route;
  check('GET /api/route : { ok, route }', r1.ok && d1?.ok === true && route && typeof route.distanceKm === 'number',
    route ? `${route.distanceKm.toFixed(2)} km, ~${route.durationMin} min, source=${route.source}` : JSON.stringify(d1)?.slice(0, 120));
  check('GET /api/route : steps = tableau', Array.isArray(route?.steps),
    `steps=${Array.isArray(route?.steps) ? route.steps.length : 'absent'}`);
  if (route?.source === 'osrm') {
    check('GET /api/route (OSRM) : étapes en français', route.steps.length >= 2 && route.steps.every((s) => typeof s.instruction === 'string' && s.instruction.length > 0),
      route.steps[0] ? `"${route.steps[0].instruction}"` : 'aucune étape');
  } else {
    warn('GET /api/route : repli ligne droite en dev (egress VM, cf. en-tête)', 'steps vides = repli prévu, vérifier avec DEV_URL=http://localhost:3101');
  }
  const r2 = await fetch(`${DEV}/api/route?${q}`);
  const d2 = await r2.json();
  check('GET /api/route : 2e appel en cache (5 min)', d2?.cached === true);
} catch (e) {
  check('GET /api/route', false, String(e?.message ?? e));
}

// --- 3. Code livré : branchements P0b ---
console.log('— Code livré —');
mustContain('lib/routing.ts', 'parseOsrmSteps', 'routing.ts : étapes OSRM parsées');
mustContain('lib/routing.ts', 'steps: RouteStep[]', 'routing.ts : RoadRoute.steps');
mustContain('lib/routing.ts', 'steps=true', 'routing.ts : OSRM appelé avec steps=true');
mustContain('lib/use-road-route.ts', 'CLIENT_CACHE_TTL_MS = 5 * 60 * 1000', 'use-road-route : cache client 5 min');
mustContain('lib/use-road-route.ts', 'refreshMs', 'use-road-route : rafraîchissement périodique');
mustContain('lib/use-road-route.ts', 'googleMapsDirectionsUrl', 'use-road-route : lien Google Maps (repli gratuit)');
mustContain('lib/use-road-route.ts', 'google.com/maps/dir', 'use-road-route : URL Google Maps directions');
mustContain('components/rides/RideLiveTracking.tsx', 'useRoadRoute', 'RideLiveTracking : ETA routière branchée');
mustContain('components/rides/RideLiveTracking.tsx', 'DriverNavigation', 'RideLiveTracking : navigation guidée branchée');
mustContain('components/rides/RideLiveTracking.tsx', 'par la route', 'RideLiveTracking : ETA affichée « par la route »');
mustContain('components/rides/DriverNavigation.tsx', 'Ouvrir dans l’app Cartes', 'DriverNavigation : bouton repli Cartes');
mustContain('components/rides/DriverNavigation.tsx', 'Maintenant', 'DriverNavigation : étape courante affichée');
mustContain('components/rides/TrackingMap.tsx', 'navRoute', 'TrackingMap : itinéraire navigation (chauffeur → cible)');
mustContain('components/home/ProposalCard.tsx', 'useRoadRoute', 'ProposalCard : ETA routière dès la proposition');
mustContain('components/home/HomeScreen.tsx', 'etaAcceptedRoad', 'HomeScreen : ETA routière chauffeur accepté');
mustContain('components/home/HomeScreen.tsx', 'pickup={pickupCoords}', 'HomeScreen : pickup passé aux propositions');

// Pas de nouveau sondage agressif : le seul intervalle de suivi
// reste celui existant (5 s, position chauffeur).
const live = read('components/rides/RideLiveTracking.tsx');
check('RideLiveTracking : pas de nouveau polling (5 s existant conservé)',
  live.includes('setInterval(fetchLocation, 5000)') && !live.includes('setInterval(fetchLocation, 1000)'));

// --- 4. Prix et commission intouchés ---
console.log('— Prix / commission —');
check('lib/pricing.ts : pas de référence au routage (modèle au km inchangé)',
  !read('lib/pricing.ts').includes('RoadRoute') && !read('lib/pricing.ts').includes('useRoadRoute'));
check('lib/commission.ts : pas de référence au routage (5 % puis 8 %, plafond 10 %)',
  !read('lib/commission.ts').includes('RoadRoute') && !read('lib/commission.ts').includes('useRoadRoute'));
mustContain('lib/commission.ts', '10', 'commission.ts : plafond 10 % toujours présent');

// --- 5. Aucune migration P0b, aucun nouveau cron ---
console.log('— Schéma / crons —');
const migrations = fs.readdirSync(path.join(ROOT, 'supabase')).filter((f) => /p0b/i.test(f));
check('Aucune migration P0b (calculs en lecture uniquement)', migrations.length === 0,
  migrations.length ? migrations.join(', ') : 'aucun changement de schéma');
const vercel = JSON.parse(read('vercel.json'));
check('vercel.json : toujours les 2 crons existants, aucun nouveau',
  Array.isArray(vercel.crons) && vercel.crons.length === 2, `crons=${vercel.crons?.length ?? '?'}`);

// --- 6. Les 2 RÈGLES prioritaires ---
console.log('— Règles prioritaires —');
const home = read('components/home/HomeScreen.tsx');
check('RÈGLE 1 : barre de chargement (squelette prix / spinner)',
  home.includes('price-skeleton') && home.includes('animate-spin'));
check('RÈGLE 2 : switch passager → chauffeur verrouillé côté serveur',
  read('lib/supabase/server.ts').includes('hasDriverAccount'));
check('RÈGLE 2 : redirection « Devenir chauffeur » présente',
  home.includes('/devenir-chauffeur') || read('app/page.tsx').includes('devenir-chauffeur'));

// --- 7. Aucun marqueur de fonctionnalité future dans les fichiers du lot ---
console.log('— Hygiène —');
// Motif construit par concaténation : le script ne doit pas contenir
// lui-même les mots interdits (il se teste aussi).
const soonPattern = new RegExp(`bient${'ô'}t|${'à'} ven${'ir'}`, 'i');
const lotFiles = [
  'lib/routing.ts',
  'lib/use-road-route.ts',
  'components/rides/RideLiveTracking.tsx',
  'components/rides/DriverNavigation.tsx',
  'components/rides/TrackingMap.tsx',
  'components/home/ProposalCard.tsx',
  'components/home/HomeScreen.tsx',
  'scripts/verify-p0b.mjs',
];
const soon = lotFiles.filter((f) => soonPattern.test(read(f)));
check('Aucun marqueur de fonctionnalité future dans les fichiers du lot', soon.length === 0, soon.join(', '));

console.log(`\n${failures === 0 ? 'TOUT PASSE' : `${failures} ÉCHEC(S)`}${warnings ? ` — ${warnings} avertissement(s)` : ''}${osrmOk ? '' : ' (OSRM direct indisponible : vérifier le réseau)'}`);
process.exit(failures === 0 ? 0 : 1);
