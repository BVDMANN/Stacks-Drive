#!/usr/bin/env node
/** verify-lot-v234.mjs — Vérification locale du lot « Au-delà » (v2.34).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) :
 *  - fonctions pures relues DEPUIS les fichiers livrés : arrondi à
 *    50 FCFA, RideCheck (long arrêt, déviation, course longue,
 *    confirmation double), Confort (clim + 4,5★), retour (sur le
 *    chemin / hors chemin), file aéroport (présence), favori
 *    (exclusivité 30 s), parrainage doublé (2 000 / 1 000 pts),
 *    audio chiffré AES-GCM (chiffrement + déchiffrement aller-retour
 *    en Node) ;
 *  - branchements : dispatch (`getIncomingRequests` : favori,
 *    Confort, retour, file aéroport), acceptation (arrondi serveur),
 *    proposition Confort (garde-fou), création de demande (Confort
 *    + favori), routes API nouvelles ;
 *  - que `lib/commission.ts` (5 % puis 8 %, plafond 10 %) n'est pas
 *    touchée par le lot, qu'aucun nouveau cron Vercel n'est ajouté
 *    (`vercel.json` inchangé), qu'aucune mécanique interne ni
 *    « bientôt » / « à venir » ne figure dans les fichiers du lot,
 *    qu'aucune trace de travail automatisé (mention d'IA, auteur,
 *    emoji robot) ne figure dans les fichiers du lot ;
 *  - les 2 RÈGLES (priorité n°1) : barre de chargement partout où
 *    il y a un temps d'attente, et switch passager → chauffeur
 *    impossible sans compte chauffeur (redirection
 *    « Devenir chauffeur », contrôle serveur) ;
 *  - HTTP local (serveur de dev port 3100) : accueil 200, routes
 *    nouvelles sans session → 401 ou 503 (jamais 500).
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le flux
 *  complet en session connectée avec Supabase (matching favori /
 *  Confort / file aéroport en conditions réelles, RideCheck en
 *  course réelle, envoi audio à l'ouverture d'un litige) — à
 *  vérifier en session connectée avec le propriétaire après le push
 *  et après la migration v2.34. L'arrondi à 50 FCFA reste **à
 *  confirmer par le propriétaire avant le push**.
 *
 *  Usage : node scripts/verify-lot-v234.mjs (sortie 0 = tout passe).
 *  Le serveur de dev doit tourner sur le port 3100 (ou DEV_URL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

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

const lotFiles = [
  'lib/price-rounding.ts',
  'lib/ridecheck.ts',
  'lib/ridecheck-server.ts',
  'lib/trip-audio.ts',
  'lib/favorites.ts',
  'lib/return-trips.ts',
  'lib/comfort.ts',
  'lib/airport-queue.ts',
  'lib/driver-lifecycle.ts',
  'lib/rides.ts',
  'lib/admin-alerts.ts',
  'lib/audit.ts',
  'lib/data-cleanup.ts',
  'app/api/rides/route.ts',
  'app/api/rides/[id]/ridecheck/route.ts',
  'app/api/rides/[id]/audio/route.ts',
  'app/api/favorites/route.ts',
  'app/api/driver/return-trip/route.ts',
  'app/api/driver/airport-queue/route.ts',
  'app/api/proposals/route.ts',
  'app/api/proposals/[id]/route.ts',
  'app/api/profile/route.ts',
  'app/api/disputes/route.ts',
  'components/home/HomeScreen.tsx',
  'components/home/ProposalCard.tsx',
  'components/rides/RideCheckPanel.tsx',
  'components/rides/FavoriteButton.tsx',
  'components/driver/DriverBeyondPanel.tsx',
  'components/driver/DriverDashboard.tsx',
  'components/rides/DisputeForm.tsx',
  'app/courses/[id]/page.tsx',
  'app/mes-courses/page.tsx',
  'app/confidentialite/page.tsx',
  'supabase/migration-v2.34-au-dela.sql',
  'CHANGELOG.md',
  'README.md',
];
const lotSrc = lotFiles.map((f) => {
  try {
    return read(f);
  } catch {
    return '';
  }
}).join('\n');

// --- 1. Arrondi à 50 FCFA ----------------------------------------------
const rounding = await import('../lib/price-rounding.ts');
check('arrondi 1525 → 1550', rounding.roundAcceptedPrice(1525) === 1550);
check('arrondi 1520 → 1500', rounding.roundAcceptedPrice(1520) === 1500);
check('arrondi 400 → 400 (déjà rond)', rounding.roundAcceptedPrice(400) === 400);
check('arrondi 50000 → 50000', rounding.roundAcceptedPrice(50000) === 50000);
check('pas 50 FCFA', rounding.ACCEPTED_PRICE_STEP_FCFA === 50);

// --- 2. RideCheck (fonctions pures) ------------------------------------
const rc = await import('../lib/ridecheck.ts');
const pickup = { lat: 0.3901, lng: 9.4544 }; // Centre-ville
const dest = { lat: 0.43, lng: 9.47 }; // Nzeng-Ayong
const ctx = {
  pickup,
  destination: dest,
  routeGeometry: [pickup, { lat: 0.41, lng: 9.462 }, dest],
  estimatedDurationMin: 10,
  estimatedDistanceKm: 6.5,
  startedAtMs: 0,
  distanceTravelledKm: 0,
};
const stopSignals = rc.evaluateRideCheck(
  { lat: 0.405, lng: 9.46, atMs: 6 * 60 * 1000 },
  { lat: 0.405, lng: 9.46, atMs: 0 },
  ctx
);
check(
  'RideCheck : long arrêt 6 min immobile hors extrémités signalé',
  stopSignals.some((s) => s.signal === 'long_stop')
);
const devSignals = rc.evaluateRideCheck(
  { lat: 0.45, lng: 9.5, atMs: 5 * 60 * 1000 },
  { lat: 0.45, lng: 9.5, atMs: 4 * 60 * 1000 },
  ctx
);
check(
  'RideCheck : position à ~1 km de l’itinéraire = déviation',
  devSignals.some((s) => s.signal === 'deviation')
);
const onRoute = rc.evaluateRideCheck(
  { lat: 0.41, lng: 9.462, atMs: 5 * 60 * 1000 },
  { lat: 0.405, lng: 9.46, atMs: 4 * 60 * 1000 },
  ctx
);
check('RideCheck : sur l’itinéraire = aucun signal', onRoute.length === 0);
const longCtx = { ...ctx, distanceTravelledKm: 12 };
const longSignals = rc.evaluateRideCheck(
  { lat: 0.425, lng: 9.468, atMs: 40 * 60 * 1000 },
  { lat: 0.42, lng: 9.465, atMs: 39 * 60 * 1000 },
  longCtx
);
check(
  'RideCheck : 40 min / 12 km pour 10 min / 6,5 km estimés = course longue',
  longSignals.some((s) => s.signal === 'long_ride')
);
check('RideCheck : 1 évaluation ne confirme jamais', rc.isSignalConfirmed(1) === false);
check('RideCheck : 2 évaluations confirment', rc.isSignalConfirmed(2) === true);
check('RideCheck : seuils prudents (5 min / 500 m / ×2 / ×1,5)', rc.RIDECHECK_STOP_MINUTES === 5 && rc.RIDECHECK_DEVIATION_KM === 0.5 && rc.RIDECHECK_LONG_DURATION_FACTOR === 2 && rc.RIDECHECK_LONG_DISTANCE_FACTOR === 1.5);

// --- 3. Confort ----------------------------------------------------------
const comfort = await import('../lib/comfort.ts');
check('Confort : clim + 4,5★ = éligible', comfort.isComfortEligible({ hasAirConditioning: true, averageRating: 4.5 }) === true);
check('Confort : clim + 4,4★ = non éligible', comfort.isComfortEligible({ hasAirConditioning: true, averageRating: 4.4 }) === false);
check('Confort : sans clim = non éligible', comfort.isComfortEligible({ hasAirConditioning: false, averageRating: 5 }) === false);
check('Confort : sans note = non éligible', comfort.isComfortEligible({ hasAirConditioning: true, averageRating: null }) === false);
check('Confort : seuil 4,5★', comfort.COMFORT_MIN_RATING === 4.5);

// --- 4. Retour -----------------------------------------------------------
const ret = await import('../lib/return-trips.ts');
// Chauffeur au Centre-ville, retour Nzeng-Ayong, demande vers Nzeng-Ayong : sur le chemin.
check(
  'Retour : destination proche du retour = sur le chemin',
  ret.isOnWayToReturn({
    driverLat: 0.3901,
    driverLng: 9.4544,
    returnDestination: 'Nzeng-Ayong',
    ridePickup: 'Centre-ville',
    rideDestination: 'Nzeng-Ayong',
  }) === true
);
// Demande vers l'aéroport (direction opposée) : hors chemin.
check(
  'Retour : destination opposée = hors chemin',
  ret.isOnWayToReturn({
    driverLat: 0.3901,
    driverLng: 9.4544,
    returnDestination: 'Nzeng-Ayong',
    ridePickup: 'Centre-ville',
    rideDestination: 'Aéroport Léon-Mba',
  }) === false
);

// --- 5. File aéroport + favori ------------------------------------------
const queue = await import('../lib/airport-queue.ts');
check(
  'File aéroport : quartier Aéroport = présent',
  queue.isAtAirport({ lat: null, lng: null, currentArea: 'Aéroport Léon-Mba' }) === true
);
check(
  'File aéroport : Paris = absent',
  queue.isAtAirport({ lat: 48.85, lng: 2.35, currentArea: null }) === false
);
check('File aéroport : exclusivité 60 s', queue.AIRPORT_QUEUE_EXCLUSIVITY_SEC === 60);
const fav = await import('../lib/favorites.ts');
check('Favori : exclusivité 30 s', fav.FAVORITE_EXCLUSIVITY_SEC === 30);
check(
  'Favori : exclusivité active dans le futur',
  fav.isFavoriteExclusive(new Date(Date.now() + 15000).toISOString()) === true
);
check(
  'Favori : exclusivité expirée dans le passé',
  fav.isFavoriteExclusive(new Date(Date.now() - 1000).toISOString()) === false
);

// --- 6. Parrainage doublé -------------------------------------------------
const lifecycle = await import('../lib/driver-lifecycle.ts');
check('Parrainage doublé : parrain 2 000 pts', lifecycle.REFERRAL_BONUS_REFERRER_POINTS === 2000);
check('Parrainage doublé : filleul 1 000 pts', lifecycle.REFERRAL_BONUS_REFEREE_POINTS === 1000);
check(
  'Parrainage doublé : SQL 2000 / 1000',
  read('supabase/migration-v2.34-au-dela.sql').includes('null, 2000,') &&
    read('supabase/migration-v2.34-au-dela.sql').includes('null, 1000,')
);

// --- 7. Audio chiffré (aller-retour AES-GCM en Node) ---------------------
const audio = await import('../lib/trip-audio.ts');
check('Audio : rétention 7 jours', audio.TRIP_AUDIO_RETENTION_DAYS === 7);
{
  const key = await audio.generateTripAudioKey();
  const plain = new TextEncoder().encode('test audio trajet').buffer;
  const cipherB64 = await audio.encryptAudioChunk(key, plain);
  const buf = audio.b64ToBuffer(cipherB64);
  const iv = new Uint8Array(buf.slice(0, 12));
  const data = buf.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  check(
    'Audio : AES-GCM chiffre puis déchiffre (clé par course)',
    new TextDecoder().decode(decrypted) === 'test audio trajet'
  );
}
check(
  'Audio : envoi uniquement avec litige (route)',
  has('app/api/rides/[id]/audio/route.ts', "in('status', ['ouvert', 'en_cours'])")
);

// --- 8. Branchements ------------------------------------------------------
check(
  'Dispatch : favori filtré dans getIncomingRequests',
  has('lib/rides.ts', 'isFavoriteExclusive(row.preferred_until')
);
check(
  'Dispatch : Confort filtré dans getIncomingRequests',
  has('lib/rides.ts', 'isComfortEligible')
);
check(
  'Dispatch : retour filtré dans getIncomingRequests',
  has('lib/rides.ts', 'isOnWayToReturn')
);
check(
  'Dispatch : file aéroport filtrée dans getIncomingRequests',
  has('lib/rides.ts', 'AIRPORT_QUEUE_EXCLUSIVITY_SEC')
);
check(
  'Acceptation : arrondi serveur avant découpe',
  has('app/api/proposals/[id]/route.ts', 'roundAcceptedPrice(price)')
);
check(
  'Proposition : garde-fou Confort côté serveur',
  has('app/api/proposals/route.ts', 'isComfortEligible')
);
check(
  'Création demande : Confort + favori acceptés',
  has('app/api/rides/route.ts', 'comfort: v.comfort') &&
    has('app/api/rides/route.ts', 'preferred_driver_id: preferredDriverId')
);
check(
  'RideCheck : check-in passager Oui / Problème',
  has('components/rides/RideCheckPanel.tsx', 'Tout va bien ?') &&
    has('components/rides/RideCheckPanel.tsx', 'Problème')
);
check(
  'RideCheck : alerte admin sur problème / sans réponse',
  has('lib/ridecheck-server.ts', "kind: 'ridecheck_problem'") &&
    has('lib/ridecheck-server.ts', "kind: 'ridecheck_no_response'")
);
check(
  'Audio : indicateur visible pendant la course',
  has('components/rides/RideCheckPanel.tsx', 'Audio du trajet') &&
    has('components/rides/RideCheckPanel.tsx', 'jamais écouté sans litige')
);
check(
  'Confort : option dans la feuille de demande',
  has('components/home/HomeScreen.tsx', 'Confort') &&
    has('components/home/HomeScreen.tsx', '4,5★')
);
check(
  'Favori : bouton depuis l’historique',
  has('components/rides/FavoriteButton.tsx', 'Reprendre avec ce chauffeur') &&
    has('app/mes-courses/page.tsx', 'FavoriteButton')
);
check(
  'Chauffeur : clim + retour + file aéroport dans le tableau de bord',
  has('components/driver/DriverDashboard.tsx', 'DriverBeyondPanel')
);
check(
  'Arrondi : montant arrondi affiché avant acceptation',
  has('components/home/ProposalCard.tsx', 'Prix figé après arrondi')
);
check(
  'Migration v2.34 : tables + colonnes + RLS, non exécutée',
  has('supabase/migration-v2.34-au-dela.sql', 'create table if not exists public.ridecheck_events') &&
    has('supabase/migration-v2.34-au-dela.sql', 'create table if not exists public.trip_audio') &&
    has('supabase/migration-v2.34-au-dela.sql', 'create table if not exists public.favorite_drivers') &&
    has('supabase/migration-v2.34-au-dela.sql', 'create table if not exists public.airport_queue') &&
    has('supabase/migration-v2.34-au-dela.sql', 'has_air_conditioning') &&
    has('supabase/migration-v2.34-au-dela.sql', 'return_destination')
);

// --- 9. Gardes-fous --------------------------------------------------------
const commission = read('lib/commission.ts');
check(
  'lib/commission.ts non touchée (5 % / 8 % / plafond 10 %)',
  commission.includes('COMMISSION_RATE') && !commission.includes('price-rounding')
);
check(
  'aucun nouveau cron Vercel (le lot n’ajoute rien à vercel.json)',
  !/ridecheck|airport|v234|au-dela/i.test(read('vercel.json'))
);
check(
  'aucune mécanique interne ni « bientôt » / « à venir » dans les fichiers du lot',
  !/bientôt|à venir|coming soon/i.test(lotSrc)
);
check(
  'aucune trace de travail automatisé (IA / auteur / emoji robot) dans les fichiers du lot',
  !/intelligence artificielle|\bIA\b.*génér|auteur.*Ruby|🤖|généré par/i.test(lotSrc) &&
    !lotSrc.includes('🤖')
);
check(
  'aucun secret dans les fichiers du lot (pas de clé, pas de mot de passe en dur)',
  !/RESEND_API_KEY\s*=|NEXT_PUBLIC_SUPABASE.*['"][A-Za-z0-9]{20,}|password\s*=\s*['"][^'"]+['"]/i.test(lotSrc)
);
check(
  'RÈGLE 1 : barre de chargement (prix, mise en ligne, switch)',
  has('components/home/HomeScreen.tsx', 'Loader2') &&
    has('components/home/HomeScreen.tsx', 'PriceSkeleton')
);
check(
  'RÈGLE 2 : switch passager → chauffeur impossible sans compte chauffeur',
  has('app/api/profile/route.ts', 'driver_account_required') &&
    has('components/home/HomeScreen.tsx', 'Devenir chauffeur')
);

// --- 10. HTTP local ---------------------------------------------------------
async function httpCheck(name, url, opts) {
  try {
    const res = await fetch(`${DEV}${url}`, opts);
    check(name, res.status !== 500, `HTTP ${res.status}`);
  } catch (e) {
    check(name, false, `injoignable (${e.message})`);
  }
}
await httpCheck('HTTP : accueil 200', '/');
await httpCheck('HTTP : RideCheck sans session → 401/503, jamais 500', '/api/rides/00000000-0000-0000-0000-000000000000/ridecheck');
await httpCheck(
  'HTTP : favoris sans session → 401/503, jamais 500',
  '/api/favorites'
);
await httpCheck(
  'HTTP : file aéroport sans session → 401/503, jamais 500',
  '/api/driver/airport-queue'
);
await httpCheck(
  'HTTP : audio sans session → 401/503, jamais 500',
  '/api/rides/00000000-0000-0000-0000-000000000000/audio'
);

console.log(failures === 0 ? '\nTous les contrôles passent.' : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
