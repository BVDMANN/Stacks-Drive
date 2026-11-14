#!/usr/bin/env node
/**
 * sync-docs.mjs — Synchronisation automatique des documentations Stacks Drive.
 *
 * Demande de Randy (14/11/2026) : « Toutes les documentations se mettent à
 * jour en temps réel après chaque modif — doc financier etc., tout. Ça doit
 * être automatisé. »
 *
 * Principe : la source de vérité est DANS LE CODE (lib/*.ts). Ce script lit
 * les constantes du code, recalcule tous les chiffres qui en découlent, et
 * réécrit les blocs marqués `<!-- DOC-SYNC: <id> --> ... <!-- /DOC-SYNC -->`
 * dans les documentations. Rien n'est recopié à la main, rien n'est deviné.
 *
 * Zéro dépendance (Node >= 18, modules natifs uniquement).
 *
 * Usage :
 *   node scripts/sync-docs.mjs            # met à jour les docs (écrit)
 *   node scripts/sync-docs.mjs --check    # vérifie sans écrire (sortie 1 si en retard)
 *   npm run docs:sync                     # idem (écrit)
 *   npm run docs:check                    # idem (vérifie)
 *
 * Le contrôle est branché au build via `prebuild` (package.json) : un build
 * local échoue si une doc est en retard — donc aucun push avec des docs
 * périmées. Le même contrôle tourne sur Vercel au déploiement (les docs
 * internes ~/workspace/stacks-drive ne sont pas dans le repo : elles sont
 * ignorées là-bas avec un avertissement, pas une erreur).
 *
 * Règles :
 * - Ne jamais écrire de secret dans les docs (le script ne lit aucune
 *   variable d'environnement, aucun .env, aucune clé).
 * - Aucun contenu de plan dans le repo : les docs internes (doc financier,
 *   plan de suivi) restent dans ~/workspace/stacks-drive/, hors repo.
 * - Les chiffres du doc financier restent des HYPOTHÈSES de prix de marché,
 *   étiquetées comme telles : la plateforme ne définit aucun tarif, le prix
 *   final est convenu entre le passager et le chauffeur.
 * - Si une source ne peut pas être lue ou parsée, le script échoue
 *   bruyamment (sortie 1) au lieu de passer en silence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const INTERNAL_DIR = path.resolve(REPO_ROOT, '..', 'stacks-drive');

const CHECK_MODE = process.argv.includes('--check');
const TODAY = new Date().toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' });

function fail(msg) {
  throw new Error(`DOC-SYNC: ${msg}`);
}

// ---------------------------------------------------------------------------
// Lecture stricte des sources (échec bruyant si introuvable / illisible)
// ---------------------------------------------------------------------------
function readOrThrow(file, label) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    fail(`impossible de lire ${label} (${file}) : ${e.message}`);
  }
}

function numConst(src, name, file) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([\\d.]+);`));
  if (!m) fail(`constante ${name} introuvable dans ${file}`);
  const v = Number(m[1]);
  if (!Number.isFinite(v)) fail(`constante ${name} invalide dans ${file}`);
  return v;
}

/** Corps d'un tableau `export const NOM = [...]` (commentaires // retirés). */
function arrayBody(src, name, file) {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) fail(`tableau ${name} introuvable dans ${file}`);
  return m[1].replace(/\/\/.*$/gm, '');
}

function quotedStrings(body) {
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Corps d'un objet `export const NOM = {...}` (commentaires // retirés). */
function objectBody(src, name, file) {
  const m = src.match(new RegExp(`export const ${name}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`));
  if (!m) fail(`objet ${name} introuvable dans ${file}`);
  return m[1].replace(/\/\/.*$/gm, '');
}

// ---------------------------------------------------------------------------
// Hypothèses (étiquetées comme telles dans les docs — à valider par le réel)
// ---------------------------------------------------------------------------
const HYP = {
  /** 6 trajets représentatifs pour les moyennes (choix éditorial, pas du code). */
  REFERENCE_TRIPS: [
    ['Aéroport Léon-Mba', 'Centre-ville'],
    ['Glass', 'Nzeng-Ayong'],
    ['Charbonnages', 'Owendo'],
    ['Centre-ville', 'Nzeng-Ayong'],
    ['Akanda', 'Aéroport Léon-Mba'],
    ['Nzeng-Ayong', 'Owendo'],
  ],
  /** Trajets supplémentaires du doc financier (§3.2). */
  EXTRA_TRIPS: [
    { from: 'Centre-ville', to: 'PK12', unpaved: false },
    { from: 'Centre-ville', to: 'Nkoltang', unpaved: true },
  ],
  /** Sous-ensemble affiché dans le tableau Groupe / Moto (§3.3). */
  GROUPE_MOTO_TRIPS: [
    ['Centre-ville', 'Nzeng-Ayong'],
    ['Glass', 'Nzeng-Ayong'],
    ['Charbonnages', 'Owendo'],
    ['Nzeng-Ayong', 'Owendo'],
  ],
  /** Mix des courses : 50 % Solo, 30 % Groupe (2 passagers en moyenne), 20 % Moto. */
  MIX_SOLO: 0.5,
  MIX_GROUPE: 0.3,
  MIX_GROUPE_PASSENGERS: 2,
  MIX_MOTO: 0.2,
  /** Scénarios de volume : courses par jour. */
  SCENARIO_RIDES_PER_DAY: [10, 25, 50, 100],
  DAYS_PER_MONTH: 30,
  /** Chauffeur actif : 6 courses/jour, 26 jours/mois. */
  DRIVER_RIDES_PER_DAY: 6,
  DRIVER_DAYS_PER_MONTH: 26,
  /** Coûts des offres payantes (Vercel Pro + Supabase Pro, ~45 $/mois à 600 FCFA/USD). */
  MONTHLY_COSTS_FCFA: 27000,
  /** Concurrence (recherche web, 14/11/2026) : Gozem ~20 %, Yango Éco dès 600 FCFA. */
  GOZEM_RATE: 0.2,
  COMPETITOR_RATE_HIGH: 0.3,
  /** Exemple de la force n°1 de l'état des lieux : course moyenne 1 140 FCFA. */
  EXAMPLE_AVG_FARE: 1140,
  EXAMPLE_RIDES_PER_DAY: 10,
  /** Fourchette Gozem affichée pour l'aéroport (recherche, pas du code). */
  GOZEM_AIRPORT_RANGE: '3 200–4 000',
};

// ---------------------------------------------------------------------------
// Source de vérité : le code — lue en une fois (readFileSync) puis validée.
// Toute la lecture est regroupée dans loadContext() : si une entrée manque
// (fichier lu pendant qu'un autre agent le réécrit), loadWithRetry()
// réessaie une fois après un court délai avant d'échouer.
// ---------------------------------------------------------------------------
function loadContext() {
const pricingSrc = readOrThrow(path.join(REPO_ROOT, 'lib/pricing.ts'), 'lib/pricing.ts');
const commissionSrc = readOrThrow(path.join(REPO_ROOT, 'lib/commission.ts'), 'lib/commission.ts');
const fareGuardSrc = readOrThrow(path.join(REPO_ROOT, 'lib/fare-guard.ts'), 'lib/fare-guard.ts');
const neighborhoodsSrc = readOrThrow(
  path.join(REPO_ROOT, 'lib/neighborhoods.ts'),
  'lib/neighborhoods.ts'
);
const poisSrc = readOrThrow(path.join(REPO_ROOT, 'lib/pois.ts'), 'lib/pois.ts');
const gamificationSrc = readOrThrow(
  path.join(REPO_ROOT, 'lib/gamification.ts'),
  'lib/gamification.ts'
);

const P = {
  baseSolo: numConst(pricingSrc, 'BASE_FARE_SOLO', 'lib/pricing.ts'),
  perKmSolo: numConst(pricingSrc, 'PER_KM_SOLO', 'lib/pricing.ts'),
  airSolo: numConst(pricingSrc, 'AIRPORT_SUPPLEMENT_SOLO', 'lib/pricing.ts'),
  minSolo: numConst(pricingSrc, 'MIN_FARE_SOLO', 'lib/pricing.ts'),
  baseGroupe: numConst(pricingSrc, 'BASE_FARE_GROUPE', 'lib/pricing.ts'),
  perKmGroupe: numConst(pricingSrc, 'PER_KM_GROUPE', 'lib/pricing.ts'),
  airGroupe: numConst(pricingSrc, 'AIRPORT_SUPPLEMENT_GROUPE', 'lib/pricing.ts'),
  minGroupe: numConst(pricingSrc, 'MIN_FARE_GROUPE', 'lib/pricing.ts'),
  unpaved: numConst(pricingSrc, 'UNPAVED_ROAD_SUPPLEMENT', 'lib/pricing.ts'),
};

const motoFactorMatch = pricingSrc.match(/round50\(price \* ([\d.]+)\)/);
if (!motoFactorMatch) fail('facteur Moto (price * 0.6) introuvable dans lib/pricing.ts');
const MOTO_FACTOR = Number(motoFactorMatch[1]);

const C = {
  rateLaunch: numConst(commissionSrc, 'COMMISSION_RATE', 'lib/commission.ts'),
  ratePermanent: numConst(commissionSrc, 'COMMISSION_RATE_PERMANENT', 'lib/commission.ts'),
  rateCap: numConst(commissionSrc, 'COMMISSION_CAP', 'lib/commission.ts'),
  launchMonths: numConst(commissionSrc, 'COMMISSION_LAUNCH_MONTHS', 'lib/commission.ts'),
};

const FARE_MIN = numConst(fareGuardSrc, 'FARE_MIN_FCFA', 'lib/fare-guard.ts');
const FARE_MAX = numConst(fareGuardSrc, 'FARE_MAX_FCFA', 'lib/fare-guard.ts');

const DEPOSIT = numConst(gamificationSrc, 'DEPOSIT_FCFA', 'lib/gamification.ts');
const DEBT_CAP = numConst(gamificationSrc, 'DEBT_CAP_FCFA', 'lib/gamification.ts');

// Quartiers : liste nommée (hors 'Autre'), accès difficile, libellés, points de dépôt.
const NEIGHBORHOODS = quotedStrings(arrayBody(neighborhoodsSrc, 'NEIGHBORHOODS', 'lib/neighborhoods.ts'));
const NAMED = NEIGHBORHOODS.filter((n) => n !== 'Autre');
if (NAMED.length === 0) fail('aucun quartier nommé dans lib/neighborhoods.ts');

const COORDS = {};
for (const m of objectBody(neighborhoodsSrc, 'NEIGHBORHOOD_COORDS', 'lib/neighborhoods.ts').matchAll(
  /(?:'([^']+)'|([A-Za-zÀ-ÿ][\wÀ-ÿ-]*))\s*:\s*\{\s*lat:\s*([\d.]+),\s*lng:\s*([\d.]+)\s*\}/g
)) {
  COORDS[m[1] || m[2]] = { lat: Number(m[3]), lng: Number(m[4]) };
}
for (const n of NAMED) {
  if (!COORDS[n]) fail(`coordonnées manquantes pour le quartier « ${n} »`);
}

const roadAccessBody = objectBody(neighborhoodsSrc, 'ROAD_ACCESS', 'lib/neighborhoods.ts');
const NB_DIFFICULT = (roadAccessBody.match(/:\s*'difficile'/g) || []).length;
if (NB_DIFFICULT === 0) fail('aucun quartier difficile trouvé dans ROAD_ACCESS');
const BITUME_PKS = [...roadAccessBody.matchAll(/'?(PK\d+)'?\s*:\s*'bitume'/g)].map((m) =>
  Number(m[1].slice(2))
);
const MAX_BITUME_PK = Math.max(...BITUME_PKS);

const dropOffBody = objectBody(neighborhoodsSrc, 'DROP_OFF_POINT', 'lib/neighborhoods.ts');
const DROP_OFFS = [...new Set([...dropOffBody.matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]))];

const tierBody = objectBody(neighborhoodsSrc, 'NEIGHBORHOOD_LABEL_TIER', 'lib/neighborhoods.ts');
const TIERS = {};
for (const m of tierBody.matchAll(/(?:'([^']+)'|([A-Za-zÀ-ÿ][\wÀ-ÿ-]*))\s*:\s*([123])/g))
  TIERS[m[1] || m[2]] = Number(m[3]);
const TIER1 = NAMED.filter((n) => TIERS[n] === 1).length;
const TIER2_VISIBLE = NAMED.filter((n) => TIERS[n] === 1 || TIERS[n] === 2).length;

const POIS_BODY = arrayBody(poisSrc, 'POIS', 'lib/pois.ts');
const NB_POIS = (POIS_BODY.match(/name:\s*'/g) || []).length;
if (NB_POIS === 0) fail('aucun lieu trouvé dans lib/pois.ts');

// ---------------------------------------------------------------------------
// Calculs — miroir exact de lib/pricing.ts (estimateFare) et lib/commission.ts
// ---------------------------------------------------------------------------
function round50(n) {
  return Math.max(0, Math.round(n / 50) * 50);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

const AIRPORT = 'Aéroport Léon-Mba';

function estimateFare(pickup, destination, rideType, vehiclePref = 'tous', unpaved = false) {
  const a = COORDS[pickup];
  const b = COORDS[destination];
  if (!a || !b) fail(`quartier inconnu : ${pickup} / ${destination}`);
  const distanceKm = haversineKm(a.lat, a.lng, b.lat, b.lng);
  const durationMin = Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
  const isAirport = pickup === AIRPORT || destination === AIRPORT;
  const pref = rideType === 'groupe' && vehiclePref === 'moto' ? 'voiture' : vehiclePref;
  let price;
  if (rideType === 'solo') {
    price = round50(
      P.baseSolo + P.perKmSolo * distanceKm + (isAirport ? P.airSolo : 0)
    );
    if (pref === 'moto') price = round50(price * MOTO_FACTOR);
    price = Math.max(price, P.minSolo);
  } else {
    price = round50(
      P.baseGroupe + P.perKmGroupe * distanceKm + (isAirport ? P.airGroupe : 0)
    );
    price = Math.max(price, P.minGroupe);
  }
  if (unpaved) price += P.unpaved;
  return { price, distanceKm, durationMin };
}

/** Découpe exacte de lib/commission.ts (splitFare) : la commission est
 *  arrondie au FCFA, le chauffeur garde le reste. */
function splitFare(total, rate) {
  const fee = Math.round(total * rate);
  return { fee, driver: total - fee };
}

// Formatage français (espaces simples, comme dans les docs existantes).
const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fcfa = (n) => `${fmt(n)} FCFA`;
const pct = (r) => `${Math.round(r * 100)} %`;
const approx1000 = (n) => `~${fmt(Math.round(n / 1000) * 1000)}`;

// --- Trajets de référence (hypothèses de prix de marché, estimation v2.11) ---
const TRIPS = HYP.REFERENCE_TRIPS.map(([from, to]) => ({
  from,
  to,
  label: `${from} ↔ ${to}`,
  solo: estimateFare(from, to, 'solo').price,
  groupe: estimateFare(from, to, 'groupe').price,
  moto: estimateFare(from, to, 'solo', 'moto').price,
}));
const trip = (from, to) => TRIPS.find((t) => t.from === from && t.to === to);
const AIRPORT_TRIP = trip('Aéroport Léon-Mba', 'Centre-ville');
const ANCHOR_TRIP = trip('Centre-ville', 'Nzeng-Ayong');
if (!AIRPORT_TRIP || !ANCHOR_TRIP) fail('trajets de référence introuvables');

const EXTRA = HYP.EXTRA_TRIPS.map((t) => ({
  ...t,
  label: `${t.from} → ${t.to}${t.unpaved ? ` (+${fmt(P.unpaved)} piste)` : ''}`,
  solo: estimateFare(t.from, t.to, 'solo', 'tous', t.unpaved).price,
}));

const avg = (xs) => Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);
const SOLO_AVG = avg(TRIPS.map((t) => t.solo));
const GROUPE_AVG = avg(TRIPS.map((t) => t.groupe));
const MOTO_AVG = avg(TRIPS.map((t) => t.moto));
const AVG_FARE = Math.round(
  HYP.MIX_SOLO * SOLO_AVG +
    HYP.MIX_GROUPE * GROUPE_AVG * HYP.MIX_GROUPE_PASSENGERS +
    HYP.MIX_MOTO * MOTO_AVG
);

const SCENARIOS = HYP.SCENARIO_RIDES_PER_DAY.map((perDay) => {
  const perMonth = perDay * HYP.DAYS_PER_MONTH;
  const ca = perMonth * AVG_FARE;
  return {
    perDay,
    perMonth,
    ca,
    platLaunch: Math.round(ca * C.rateLaunch),
    platPermanent: Math.round(ca * C.ratePermanent),
  };
});

const DRIVER_AVG_LAUNCH = Math.round(AVG_FARE * (1 - C.rateLaunch));
const DRIVER_AVG_PERMANENT = Math.round(AVG_FARE * (1 - C.ratePermanent));
const DRIVER_MONTH_RIDES = HYP.DRIVER_RIDES_PER_DAY * HYP.DRIVER_DAYS_PER_MONTH;
const driverMonthly = (perDay, rate) =>
  approx1000(perDay * HYP.DRIVER_DAYS_PER_MONTH * Math.round(AVG_FARE * (1 - rate)));

const COMMISSION_PER_DAY = AVG_FARE * C.rateLaunch * HYP.DRIVER_RIDES_PER_DAY;
const DEPOSIT_DAYS = Math.round(DEPOSIT / COMMISSION_PER_DAY);

const BE_LAUNCH_CA = Math.round(HYP.MONTHLY_COSTS_FCFA / C.rateLaunch);
const BE_LAUNCH_RIDES = Math.round(BE_LAUNCH_CA / AVG_FARE);
const BE_LAUNCH_PER_DAY = Math.round(BE_LAUNCH_RIDES / HYP.DAYS_PER_MONTH);
const BE_PERM_CA = Math.round(HYP.MONTHLY_COSTS_FCFA / C.ratePermanent);
const BE_PERM_RIDES = Math.round(BE_PERM_CA / AVG_FARE);
const BE_PERM_PER_DAY = Math.round(BE_PERM_RIDES / HYP.DAYS_PER_MONTH);

const SWITCH_IMPACT = splitFare(AIRPORT_TRIP.solo, C.ratePermanent).fee - splitFare(AIRPORT_TRIP.solo, C.rateLaunch).fee;
const GOZEM_DRIVER = Math.round(AIRPORT_TRIP.solo * (1 - HYP.GOZEM_RATE));
const GAP_LAUNCH = splitFare(AIRPORT_TRIP.solo, C.rateLaunch).driver - GOZEM_DRIVER;
const GAP_PERMANENT = splitFare(AIRPORT_TRIP.solo, C.ratePermanent).driver - GOZEM_DRIVER;
const KEEP_LAUNCH = Math.round((1 - C.rateLaunch) * 100);
const KEEP_PERMANENT = Math.round((1 - C.ratePermanent) * 100);
const FORCE1_GAIN = Math.round(
  (HYP.EXAMPLE_AVG_FARE * HYP.EXAMPLE_RIDES_PER_DAY * HYP.DRIVER_DAYS_PER_MONTH *
    (1 - C.ratePermanent - (1 - HYP.COMPETITOR_RATE_HIGH))) / 100
) * 100;

// Contexte passé à tous les générateurs de blocs.
  return {
  P, C, MOTO_FACTOR, FARE_MIN, FARE_MAX, DEPOSIT, DEBT_CAP,
  NB_QUARTIERS: NAMED.length,
  NB_DIFFICULT,
  NB_POIS,
  TIER1,
  TIER2_VISIBLE,
  TIER_TOTAL: NAMED.length,
  DROP_OFFS,
  MAX_BITUME_PK,
  TRIPS, EXTRA, AIRPORT_TRIP, ANCHOR_TRIP,
  SOLO_AVG, GROUPE_AVG, MOTO_AVG, AVG_FARE,
  SCENARIOS, DRIVER_AVG_LAUNCH, DRIVER_AVG_PERMANENT, DRIVER_MONTH_RIDES,
  driverMonthly, COMMISSION_PER_DAY, DEPOSIT_DAYS,
  BE_LAUNCH_CA, BE_LAUNCH_RIDES, BE_LAUNCH_PER_DAY,
  BE_PERM_CA, BE_PERM_RIDES, BE_PERM_PER_DAY,
  SWITCH_IMPACT, GOZEM_DRIVER, GAP_LAUNCH, GAP_PERMANENT,
  KEEP_LAUNCH, KEEP_PERMANENT, FORCE1_GAIN,
  MONTHLY_COSTS: HYP.MONTHLY_COSTS_FCFA,
  fmt, fcfa, pct, approx1000, splitFare,
  };
}

/** Charge la source de vérité, avec une seconde tentative en cas de lecture
 *  incomplète. Un autre agent peut modifier le repo en parallèle : une
 *  lecture qui tombe pendant une réécriture peut voir un fichier tronqué
 *  (ex. « coordonnées manquantes pour le quartier "Glass" ») alors que le
 *  code est sain. On réessaie une fois après 500 ms ; si la seconde
 *  tentative échoue aussi, l'erreur est relancée telle quelle — avec le
 *  nom de l'entrée manquante, pour qu'on sache exactement quoi corriger. */
async function loadWithRetry() {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return loadContext();
    } catch (e) {
      lastError = e;
      if (attempt === 1) {
        console.error(
          `[docs:sync] Lecture des sources incomplète (tentative 1/2) : ${e.message} — nouvelle tentative dans 500 ms (lecture concurrente possible).`
        );
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }
  throw lastError;
}

const CTX = await loadWithRetry();

// ---------------------------------------------------------------------------
// Générateurs de blocs — chaque bloc est régénéré depuis le code à chaque run
// ---------------------------------------------------------------------------
const G = {
  // -- Doc financier (interne) ---------------------------------------------
  'fin-rules': (x) => `| Règle | Valeur |
|---|---|
| Estimation Solo | ${x.fmt(x.P.baseSolo)} FCFA prise en charge + **${x.fmt(x.P.perKmSolo)} FCFA/km** (indicative) |
| Estimation Groupe (par passager) | ${x.fmt(x.P.baseGroupe)} FCFA prise en charge + **${x.fmt(x.P.perKmGroupe)} FCFA/km** (indicative) |
| Moto (Solo uniquement) | Solo × ${String(x.MOTO_FACTOR).replace('.', ',')} |
| Minimum Solo / Groupe (estimation) | ${x.fmt(x.P.minSolo)} / ${x.fmt(x.P.minGroupe)} FCFA |
| Supplément aéroport (estimation) | +${x.fmt(x.P.airSolo)} FCFA (Solo), +${x.fmt(x.P.airGroupe)} FCFA (Groupe) |
| Supplément route non bitumée | +${x.fmt(x.P.unpaved)} FCFA forfait, jamais remisé |
| Prix à la minute | Aucun — la durée est affichée, jamais facturée |
| Prix final | **Convenu entre le passager et le chauffeur, figé à l'acceptation, jamais de surge** |
| Distance | Vol d'oiseau (haversine) entre quartiers |
| Commission | ${x.pct(x.C.rateLaunch)} (${x.C.launchMonths} mois) puis ${x.pct(x.C.ratePermanent)}, plafond ${x.pct(x.C.rateCap)} |`,

  'fin-trips': (x) => `| Trajet | Solo | Groupe / passager | Moto |
|---|---|---|---|
${x.TRIPS.map((t) => `| ${t.label} | ${x.fmt(t.solo)} | ${x.fmt(t.groupe)} | ${x.fmt(t.moto)} |`).join('\n')}

**Zone couverte :** ${x.NB_QUARTIERS} quartiers, ${x.NB_POIS} lieux sur la carte, ${x.NB_DIFFICULT} quartiers à accès difficile (point de dépôt + supplément ${x.fmt(x.P.unpaved)} FCFA). Tous les PK jusqu'à PK${x.MAX_BITUME_PK} sont bitumés (normaux) ; le point de dépôt sur l'axe N1 est PK${x.MAX_BITUME_PK}.`,

  'fin-split-airport': (x) => {
    const t = x.AIRPORT_TRIP;
    const s5 = x.splitFare(t.solo, x.C.rateLaunch);
    const s8 = x.splitFare(t.solo, x.C.ratePermanent);
    return `| | Prix payé | Plateforme à ${x.pct(x.C.rateLaunch)} | Chauffeur à ${x.pct(x.C.rateLaunch)} | Plateforme à ${x.pct(x.C.ratePermanent)} | Chauffeur à ${x.pct(x.C.ratePermanent)} |
|---|---|---|---|---|---|
| Solo | ${x.fmt(t.solo)} | ${x.fmt(s5.fee)} | **${x.fmt(s5.driver)}** | ${x.fmt(s8.fee)} | **${x.fmt(s8.driver)}** |
| Groupe (1 passager) | ${x.fmt(t.groupe)} | ${x.fmt(x.splitFare(t.groupe, x.C.rateLaunch).fee)} | **${x.fmt(x.splitFare(t.groupe, x.C.rateLaunch).driver)}** | ${x.fmt(x.splitFare(t.groupe, x.C.ratePermanent).fee)} | **${x.fmt(x.splitFare(t.groupe, x.C.ratePermanent).driver)}** |
| Groupe (2 passagers) | ${x.fmt(t.groupe * 2)} | ${x.fmt(x.splitFare(t.groupe * 2, x.C.rateLaunch).fee)} | **${x.fmt(x.splitFare(t.groupe * 2, x.C.rateLaunch).driver)}** | ${x.fmt(x.splitFare(t.groupe * 2, x.C.ratePermanent).fee)} | **${x.fmt(x.splitFare(t.groupe * 2, x.C.ratePermanent).driver)}** |
| Moto | ${x.fmt(t.moto)} | ${x.fmt(x.splitFare(t.moto, x.C.rateLaunch).fee)} | **${x.fmt(x.splitFare(t.moto, x.C.rateLaunch).driver)}** | ${x.fmt(x.splitFare(t.moto, x.C.ratePermanent).fee)} | **${x.fmt(x.splitFare(t.moto, x.C.ratePermanent).driver)}** |`;
  },

  'fin-split-others': (x) => {
    const order = ['Centre-ville', 'Glass', 'Charbonnages', 'Akanda', 'Nzeng-Ayong'];
    const others = [
      ...order.map((from) => x.TRIPS.find((t) => t.from === from)),
      ...x.EXTRA,
    ];
    const soloRows = others
      .map((t) => {
        const s5 = x.splitFare(t.solo, x.C.rateLaunch);
        const s8 = x.splitFare(t.solo, x.C.ratePermanent);
        return `| ${t.label} | ${x.fmt(t.solo)} | ${x.fmt(s5.driver)} | ${x.fmt(s8.driver)} |`;
      })
      .join('\n');
    const gmTrips = HYP.GROUPE_MOTO_TRIPS.map(([from, to]) =>
      x.TRIPS.find((t) => t.from === from && t.to === to)
    );
    const gmRows = gmTrips
      .map((t) => {
        const g5 = x.splitFare(t.groupe, x.C.rateLaunch);
        const m5 = x.splitFare(t.moto, x.C.rateLaunch);
        return `| ${t.label} | ${x.fmt(t.groupe)} → ${x.fmt(g5.driver)} | ${x.fmt(t.moto)} → ${x.fmt(m5.driver)} |`;
      })
      .join('\n');
    return `| Trajet | Prix | Chauffeur à ${x.pct(x.C.rateLaunch)} | Chauffeur à ${x.pct(x.C.ratePermanent)} |
|---|---|---|---|
${soloRows}

### 3.3 Groupe et Moto (par passager / par course)

| Trajet | Groupe / passager (chauffeur à ${x.pct(x.C.rateLaunch)}) | Moto (chauffeur à ${x.pct(x.C.rateLaunch)}) |
|---|---|---|
${gmRows}

**Lecture :** sur une course à ${x.fmt(x.AIRPORT_TRIP.solo)} FCFA, le chauffeur garde **${x.fmt(x.splitFare(x.AIRPORT_TRIP.solo, x.C.rateLaunch).driver)} FCFA à ${x.pct(x.C.rateLaunch)}** et **${x.fmt(x.splitFare(x.AIRPORT_TRIP.solo, x.C.ratePermanent).driver)} FCFA à ${x.pct(x.C.ratePermanent)}**. Le passage de ${x.pct(x.C.rateLaunch)} à ${x.pct(x.C.ratePermanent)} ne coûte que ${x.fmt(x.SWITCH_IMPACT)} FCFA au chauffeur sur cette course — c'est l'argument à tenir face aux chauffeurs au moment de la bascule.`;
  },

  'fin-scenarios': (x) => `**Hypothèses (à valider par le réel) :**
- Mix des courses : 50 % Solo, 30 % Groupe (2 passagers en moyenne), 20 % Moto.
- Course moyenne calculée sur les 6 trajets de référence (hypothèses de prix de marché, estimation v2.11) : Solo ${x.fmt(x.SOLO_AVG)} FCFA, Groupe ${x.fmt(x.GROUPE_AVG)} FCFA/passager, Moto ${x.fmt(x.MOTO_AVG)} FCFA.
- **Revenu moyen par course : ${x.fmt(x.AVG_FARE)} FCFA** (toutes catégories, total payé par les passagers).
- Mois = 30 jours. Les chiffres sont arrondis.

| Courses / jour | Courses / mois | CA total des courses / mois | Plateforme à ${x.pct(x.C.rateLaunch)} / mois | Plateforme à ${x.pct(x.C.ratePermanent)} / mois |
|---|---|---|---|---|
${x.SCENARIOS.map((s) => `| ${s.perDay} | ${x.fmt(s.perMonth)} | ${x.fmt(s.ca)} | **${x.fmt(s.platLaunch)}** | **${x.fmt(s.platPermanent)}** |`).join('\n')}

**Lecture :** à 25 courses par jour, la plateforme gagne environ **${x.fmt(Math.round(x.SCENARIOS[1].platLaunch / 1000) * 1000)} FCFA/mois pendant le lancement**, puis **${x.fmt(x.SCENARIOS[1].platPermanent)} FCFA/mois à ${x.pct(x.C.ratePermanent)}**. À 100 courses par jour, environ **${x.fmt(x.SCENARIOS[3].platLaunch)} FCFA/mois** puis **${x.fmt(x.SCENARIOS[3].platPermanent)} FCFA/mois**.`,

  'fin-driver-monthly': (x) => `**Hypothèses :** un chauffeur actif fait **${HYP.DRIVER_RIDES_PER_DAY} courses par jour, ${HYP.DRIVER_DAYS_PER_MONTH} jours par mois** (${x.DRIVER_MONTH_RIDES} courses). Gain moyen par course : **${x.fmt(x.DRIVER_AVG_LAUNCH)} FCFA à ${x.pct(x.C.rateLaunch)}**, **${x.fmt(x.DRIVER_AVG_PERMANENT)} FCFA à ${x.pct(x.C.ratePermanent)}** (mix ci-dessus). Carburant et entretien à la charge du chauffeur — **non déduits ici**.

| | Revenu brut / mois |
|---|---|
| À ${x.pct(x.C.rateLaunch)} (lancement) | **${x.driverMonthly(HYP.DRIVER_RIDES_PER_DAY, x.C.rateLaunch)} FCFA** |
| À ${x.pct(x.C.ratePermanent)} (permanent) | **${x.driverMonthly(HYP.DRIVER_RIDES_PER_DAY, x.C.ratePermanent)} FCFA** |

À 4 courses/jour (${4 * HYP.DRIVER_DAYS_PER_MONTH} courses/mois) : ${x.driverMonthly(4, x.C.rateLaunch)} FCFA à ${x.pct(x.C.rateLaunch)}, ${x.driverMonthly(4, x.C.ratePermanent)} FCFA à ${x.pct(x.C.ratePermanent)}.
À 8 courses/jour (${8 * HYP.DRIVER_DAYS_PER_MONTH} courses/mois) : ${x.driverMonthly(8, x.C.rateLaunch)} FCFA à ${x.pct(x.C.rateLaunch)}, ${x.driverMonthly(8, x.C.ratePermanent)} FCFA à ${x.pct(x.C.ratePermanent)}.

**Lecture :** le revenu chauffeur est le nerf de la guerre. À 6 courses par jour, un chauffeur gagne autour de ${x.fmt(Math.round((x.DRIVER_MONTH_RIDES * x.DRIVER_AVG_PERMANENT) / 10000) * 10000)} FCFA/mois brut — c'est ce chiffre qui recrute, pas la commission.`,

  'fin-deposits': (x) => `| Chauffeurs inscrits | Dépôts encaissés (${x.fmt(x.DEPOSIT)} FCFA chacun) |
|---|---|
| 20 (objectif lancement) | **${x.fmt(20 * x.DEPOSIT)} FCFA** |
| 50 | **${x.fmt(50 * x.DEPOSIT)} FCFA** |
| 100 | **${x.fmt(100 * x.DEPOSIT)} FCFA** |

**Règles à respecter :**
- Les dépôts sont **remboursables** : ils doivent rester disponibles. Ne jamais les dépenser comme du revenu.
- Le dépôt couvre environ la première semaine de commissions d'un chauffeur actif (à ${x.pct(x.C.rateLaunch)}, ${x.fmt(x.AVG_FARE)} FCFA/course × ${x.pct(x.C.rateLaunch)} × ${HYP.DRIVER_RIDES_PER_DAY} courses/jour ≈ ${x.fmt(x.COMMISSION_PER_DAY)} FCFA de commission/jour → ${x.fmt(x.DEPOSIT)} FCFA ≈ ${x.DEPOSIT_DAYS} jours de commissions).
- Le plafond de dette (${x.fmt(x.DEBT_CAP)} FCFA) protège la plateforme : un chauffeur qui ne règle pas est coupé avant que la dette ne grandisse.`,

  'fin-breakeven': (x) => `Avec des coûts fixes quasi nuls au lancement, la plateforme est bénéficiaire en brut dès la première course. La vraie question est : **à partir de quand la commission couvre les coûts des offres payantes** (Vercel Pro + Supabase Pro, ~${x.fmt(x.MONTHLY_COSTS)} FCFA/mois, hypothèse) ?

| Taux | CA courses nécessaire / mois | Courses / mois | Courses / jour |
|---|---|---|---|
| ${x.pct(x.C.rateLaunch)} | ${x.fmt(x.BE_LAUNCH_CA)} FCFA | ~${x.fmt(x.BE_LAUNCH_RIDES)} | **~${x.BE_LAUNCH_PER_DAY}** |
| ${x.pct(x.C.ratePermanent)} | ${x.fmt(x.BE_PERM_CA)} FCFA | ~${x.fmt(x.BE_PERM_RIDES)} | **~${x.BE_PERM_PER_DAY}** |

**Lecture :** dès **~${x.BE_LAUNCH_PER_DAY} courses par jour**, la plateforme couvre ses futurs coûts d'infrastructure. En dessous, elle reste bénéficiaire en brut (coûts réels = 0), mais ne finance pas encore sa propre croissance.`,

  'fin-comparison': (x) => `| | Commission chauffeur | Sur une course à ${x.fmt(x.AIRPORT_TRIP.solo)} FCFA, le chauffeur garde |
|---|---|---|
| **Stacks Drive (lancement)** | **${x.pct(x.C.rateLaunch)}** | **${x.fmt(x.splitFare(x.AIRPORT_TRIP.solo, x.C.rateLaunch).driver)} FCFA** |
| **Stacks Drive (permanent)** | **${x.pct(x.C.ratePermanent)}**, plafond ${x.pct(x.C.rateCap)} | **${x.fmt(x.splitFare(x.AIRPORT_TRIP.solo, x.C.ratePermanent).driver)} FCFA** |
| Gozem | ~20 % | ~${x.fmt(x.GOZEM_DRIVER)} FCFA |
| Yango | 0 % au lancement (temporaire) | ${x.fmt(x.AIRPORT_TRIP.solo)} FCFA (pendant le lancement) |
| Bolt (autres marchés) | 15–25 % | ~${x.fmt(x.AIRPORT_TRIP.solo * 0.75)}–${x.fmt(x.AIRPORT_TRIP.solo * 0.85)} FCFA |

**Lecture :**
- Contre Gozem, l'écart est massif : **+${x.fmt(x.GAP_LAUNCH)} FCFA par course à ${x.fmt(x.AIRPORT_TRIP.solo)} FCFA** pour le chauffeur (à ${x.pct(x.C.rateLaunch)}), +${x.fmt(x.GAP_PERMANENT)} FCFA à ${x.pct(x.C.ratePermanent)}. C'est l'argument n°1 de recrutement.
- Contre Yango, on ne peut pas gagner sur la commission pendant leur lancement à 0 % — mais leur 0 % est temporaire et leurs tarifs passagers sont bas (Éco dès 600 FCFA), donc le gain absolu du chauffeur par course est plus faible. Notre argument : un prix de course plus élevé + une commission basse et stable.
- Gozem facture en plus un prix à la minute et du surge : le prix final n'est pas le prix affiché. Notre promesse inverse : le prix accepté est le prix payé, toujours.`,

  'fin-vigilances': (x) => `4. **Plafond de dette à ${x.fmt(x.DEBT_CAP)} FCFA** : un chauffeur actif atteint ce plafond en ~${x.DEPOSIT_DAYS} jours de commissions s'il ne règle pas. Le rappel automatique (7 jours) et la coupure doivent fonctionner.
5. **Bascule ${x.pct(x.C.rateLaunch)} → ${x.pct(x.C.ratePermanent)} (après ${x.C.launchMonths} mois).** À annoncer aux chauffeurs à l'avance ; l'impact par course est faible (${x.fmt(x.SWITCH_IMPACT)} FCFA sur ${x.fmt(x.AIRPORT_TRIP.solo)} FCFA) mais doit être dit, pas découvert.`,

  // -- Plan de suivi et de lancement (interne) ------------------------------
  'plan-coverage': (x) => `> Zone couverte (code) : **${x.NB_QUARTIERS} quartiers, ${x.NB_POIS} lieux, ${x.NB_DIFFICULT} quartiers à accès difficile** — points de dépôt : ${x.DROP_OFFS.join(', ')}. Tous les PK jusqu'à PK${x.MAX_BITUME_PK} sont bitumés (normaux).`,

  'plan-argu': (x) => `Argumentaire chauffeur : commission ${x.pct(x.C.rateLaunch)} (${x.C.launchMonths} mois) puis ${x.pct(x.C.ratePermanent)}, plafond ${x.pct(x.C.rateCap)} ; sur une course à ${x.fmt(x.AIRPORT_TRIP.solo)} FCFA (exemple), le chauffeur garde ${x.fmt(x.splitFare(x.AIRPORT_TRIP.solo, x.C.rateLaunch).driver)} FCFA (contre ~${x.fmt(x.GOZEM_DRIVER)} chez Gozem) ; dépôt ${x.fmt(x.DEPOSIT)} FCFA remboursable`,

  'plan-promise': (x) => `- **Groupe imbattable à l'aéroport : ${x.fmt(x.AIRPORT_TRIP.groupe)} FCFA par passager** (estimation indicative) contre ${HYP.GOZEM_AIRPORT_RANGE} chez Gozem.
- **Le chauffeur garde ${x.KEEP_PERMANENT}–${x.KEEP_LAUNCH} %** de chaque course (contre ~75–82 % chez Gozem).`,

  'plan-vigilance': (x) => `8. **Bascule ${x.pct(x.C.rateLaunch)} → ${x.pct(x.C.ratePermanent)} après ${x.C.launchMonths} mois.** À annoncer aux chauffeurs à l'avance (impact : ${x.fmt(x.SWITCH_IMPACT)} FCFA sur une course à ${x.fmt(x.AIRPORT_TRIP.solo)} FCFA).`,

  'plan-decisions': (x) => `- Commission : ${x.pct(x.C.rateLaunch)} (${x.C.launchMonths} mois) puis ${x.pct(x.C.ratePermanent)}, plafond ${x.pct(x.C.rateCap)} garanti. \`lib/commission.ts\` intouchable sans décision de Randy.
- Prix : calculés et revalidés côté serveur uniquement. Estimation indicative au km (Solo ${x.fmt(x.P.baseSolo)} + ${x.fmt(x.P.perKmSolo)}/km, Groupe ${x.fmt(x.P.baseGroupe)} + ${x.fmt(x.P.perKmGroupe)}/km, Moto ×${String(x.MOTO_FACTOR).replace('.', ',')}), aucun tarif fixe, prix convenu entre passager et chauffeur puis figé à l'acceptation, **jamais de surge**.`,

  // -- README (repo) ---------------------------------------------------------
  'readme-commission': (x) => `- **Commission :** ${x.pct(x.C.rateLaunch)} au lancement (${x.C.launchMonths} mois), puis ${x.pct(x.C.ratePermanent)} permanent, **plafond ${x.pct(x.C.rateCap)} garanti** (voir \`lib/commission.ts\`). La commission est calculée sur le total de la course, supplément route non bitumée compris.
- **Paiement :** le passager paie le chauffeur directement (espèces ou transfert P2P Airtel Money / Moov Money). L'appli ne touche jamais l'argent — elle compte seulement. Commission réglée 1 fois par semaine, en un seul transfert Mobile Money. Dépôt de garantie remboursable : ${x.fmt(x.DEPOSIT)} FCFA. Plafond de dette : ~${x.fmt(x.DEBT_CAP)} FCFA.`,

  'readme-map': (x) => `- **Carte :** ${x.NB_QUARTIERS} quartiers de Libreville avec leurs noms affichés sur la carte (${x.TIER1} visibles au zoom 12, ${x.TIER2_VISIBLE} au zoom 13, ${x.TIER_TOTAL} au zoom 14), ${x.NB_POIS} lieux (supermarchés, marchés, stations, pharmacies, hôtels, santé, lieux publics), icônes chauffeurs dorées avec note, feuille de demande à 3 positions (façon Uber) avec bouton pour la replier et voir la carte.`,

  'readme-difficult': (x) => `- **Quartiers à accès difficile :** ${x.NB_DIFFICULT} quartiers ne sont pas desservis sur route bitumée — la course s'arrête par défaut à un point de dépôt sur route bitumée ; le passager peut demander la continuité sur route non bitumée pour un supplément forfaitaire de **${x.fmt(x.P.unpaved)} FCFA**, que le chauffeur est libre d'accepter ou non.`,

  'readme-rules': (x) => `- **Règles métier :** \`lib/commission.ts\` (commission ${x.pct(x.C.rateLaunch)} / ${x.pct(x.C.ratePermanent)} / plafond ${x.pct(x.C.rateCap)}), \`lib/pricing.ts\` (estimation indicative au km : prise en charge + prix au km, AUCUN tarif fixe — le prix final est convenu entre le passager et le chauffeur, supplément route non bitumée ${x.fmt(x.P.unpaved)} FCFA), \`lib/neighborhoods.ts\` (${x.NB_QUARTIERS} quartiers, accès difficile, points de dépôt), \`lib/pois.ts\` (${x.NB_POIS} lieux sur la carte), \`lib/fare-guard.ts\` (sécurité des prix : bornes absolues ${x.fmt(x.FARE_MIN)}–${x.fmt(x.FARE_MAX)} FCFA validées côté serveur, audit).`,

  // -- État des lieux (repo) --------------------------------------------------
  'etat-commission': (x) => `- **Commission validée par Randy :** ${x.pct(x.C.rateLaunch)} au lancement (${x.C.launchMonths} mois), puis ${x.pct(x.C.ratePermanent)} permanent, **plafond ${x.pct(x.C.rateCap)} garanti**. La commission est calculée sur le total de la course, supplément route non bitumée compris.`,

  'etat-deposit': (x) => `- **Garde-fous contre les chauffeurs qui disparaissent sans payer :** **dépôt de garantie remboursable de ${x.fmt(x.DEPOSIT)} FCFA** à l'inscription (transfert P2P, gardé si le chauffeur part sans solder, remboursé s'il part proprement) + **plafond de dette d'environ ${x.fmt(x.DEBT_CAP)} FCFA** (au-delà, plus de nouvelles demandes tant que ce n'est pas réglé).`,

  'etat-pricing': (x) => `- **Prix :** estimation indicative au km — prise en charge + prix au kilomètre (Solo ${x.fmt(x.P.baseSolo)} + ${x.fmt(x.P.perKmSolo)} FCFA/km, Groupe ${x.fmt(x.P.baseGroupe)} + ${x.fmt(x.P.perKmGroupe)} FCFA/km, Moto = Solo ×${String(x.MOTO_FACTOR).replace('.', ',')}), **jamais de surge** ; AUCUN tarif fixe défini par la plateforme. Le prix final est convenu entre le passager et le chauffeur — le chauffeur propose, le passager peut proposer son prix à la demande et contre-proposer — puis il est figé à l'acceptation. Planchers de l'estimation Solo ${x.fmt(x.P.minSolo)} / Groupe ${x.fmt(x.P.minGroupe)} FCFA.`,

  'etat-map': (x) => `- **Carte :** ${x.NB_QUARTIERS} quartiers de Libreville avec leurs noms affichés sur la carte (${x.TIER1} visibles au zoom 12, ${x.TIER2_VISIBLE} au zoom 13, ${x.TIER_TOTAL} au zoom 14), ${x.NB_POIS} lieux (supermarchés, marchés, stations, pharmacies, hôtels, santé, lieux publics — pictogrammes dès le zoom 13, noms dès le zoom 15), icônes chauffeurs dorées avec note, feuille de demande à 3 positions avec bouton pour la replier et voir la carte.`,

  'etat-difficult': (x) => `- **Quartiers à accès difficile :** ${x.NB_DIFFICULT} quartiers ne sont pas desservis sur route bitumée — la course s'y arrête par défaut à un point de dépôt sur route bitumée (${x.DROP_OFFS.join(', ')} selon la zone) ; le passager peut demander la continuité sur route non bitumée pour un supplément forfaitaire de **${x.fmt(x.P.unpaved)} FCFA**, que le chauffeur est libre d'accepter ou non. La commission est calculée sur le total, supplément compris. Tous les PK jusqu'à PK${x.MAX_BITUME_PK} inclus sont bitumés et normaux.`,

  'etat-table-commission': (x) => `**${x.pct(x.C.rateLaunch)} (${x.C.launchMonths} mois) puis ${x.pct(x.C.ratePermanent)}, plafond ${x.pct(x.C.rateCap)} garanti**`,

  'etat-table-keep': (x) => `**${x.KEEP_PERMANENT}–${x.KEEP_LAUNCH} % de chaque course**`,

  'etat-table-min': (x) => `Estimation Groupe dès ${x.fmt(x.P.minGroupe)} FCFA/passager (indicative, pas un tarif)`,

  'etat-table-map': (x) => `**Oui — ${x.NB_QUARTIERS} quartiers nommés + ${x.NB_POIS} lieux**`,

  'etat-force1': (x) => `**1. Le chauffeur garde ${x.KEEP_PERMANENT}–${x.KEEP_LAUNCH} % de chaque course, contre 70–85 % chez les concurrents.**
C'est l'argument n° 1 pour recruter. Yango est à 0 % de commission au lancement, mais c'est temporaire — après, il retombe dans la fourchette 15–30 % du marché. Nous, le plafond de ${x.pct(x.C.rateCap)} est garanti, écrit dans les CGU. Un chauffeur qui fait ${HYP.EXAMPLE_RIDES_PER_DAY} courses par jour à ${x.fmt(HYP.EXAMPLE_AVG_FARE)} FCFA en moyenne garde environ ${x.fmt(x.FORCE1_GAIN)} FCFA de plus par mois chez nous que chez un concurrent à 30 % (hypothèse : ${x.fmt(HYP.EXAMPLE_AVG_FARE)} FCFA × ${HYP.EXAMPLE_RIDES_PER_DAY} courses × ${HYP.DRIVER_DAYS_PER_MONTH} jours ; à vérifier avec les vrais chiffres une fois lancé).`,

  'etat-weakness5': (x) => `**5. Fiabilité : l'estimation est calculée côté serveur, les prix convenus sont validés côté serveur, le circuit complet n'a jamais été testé en conditions réelles.**
Depuis la v2.2 : estimation calculée côté serveur uniquement, bornes absolues de sécurité (${x.fmt(x.FARE_MIN)}–${x.fmt(x.FARE_MAX)} FCFA, pas de prix fou), pas de double commission (idempotence), journal d'audit, blocage + message clair en cas d'anomalie, page d'erreur de marque (« Service momentanément indisponible ») si ça plante vraiment. Reste vrai : le circuit complet (estimation → prix convenu → commission → règlement hebdo → dépôt → plafond) n'a jamais été testé avec de vrais chauffeurs et de vraies courses. Un bug de trop-perçu ou de double commission au lancement tuerait la confiance des chauffeurs en une semaine.`,

  'etat-paperasse-commission': (x) => `${x.pct(x.C.rateLaunch)} / ${x.pct(x.C.ratePermanent)} / plafond ${x.pct(x.C.rateCap)}. Ne pas toucher aux taux sans décision de Randy.`,

  'etat-paperasse-pricing': (x) => `Prise en charge + prix au km (Solo ${x.fmt(x.P.baseSolo)} + ${x.fmt(x.P.perKmSolo)}/km, Groupe ${x.fmt(x.P.baseGroupe)} + ${x.fmt(x.P.perKmGroupe)}/km, Moto ×${String(x.MOTO_FACTOR).replace('.', ',')}), AUCUN tarif fixe — le prix final est convenu entre le passager et le chauffeur, supplément route non bitumée ${x.fmt(x.P.unpaved)} FCFA.`,

  'etat-paperasse-neighborhoods': (x) => `${x.NB_QUARTIERS} quartiers, ${x.NB_DIFFICULT} à accès difficile, points de dépôt.`,

  'etat-paperasse-pois': (x) => `${x.NB_POIS} lieux.`,

  'etat-paperasse-cgu': (x) => `Faites — dépôt + plafond (${x.fmt(x.DEPOSIT)} FCFA, règlement hebdo), routes non bitumées (§6 : point de dépôt + supplément ${x.fmt(x.P.unpaved)} FCFA, chauffeur libre).`,
};

// ---------------------------------------------------------------------------
// Table des blocs : fichier, mode, ancre (1re passe : le script ajoute les
// marqueurs après la ligne d'ancre ; les blocs "inline" vivent dans un
// tableau Markdown — leurs marqueurs doivent déjà exister dans le fichier).
// ---------------------------------------------------------------------------
const FIN = path.join(INTERNAL_DIR, 'doc-financier.md');
const PLAN = path.join(INTERNAL_DIR, 'plan-suivi-lancement.md');
const README = path.join(REPO_ROOT, 'README.md');
const ETAT = path.join(REPO_ROOT, 'docs/etat-des-lieux-lancement.md');

const BLOCKS = [
  { id: 'fin-rules', file: FIN, mode: 'block', anchor: '## 2. Règles tarifaires (chiffres du code)' },
  { id: 'fin-trips', file: FIN, mode: 'block', anchor: '**6 trajets de référence — HYPOTHÈSES de prix de marché**' },
  { id: 'fin-split-airport', file: FIN, mode: 'block', anchor: '### 3.1 Trajet de référence : Aéroport ↔ Centre-ville' },
  { id: 'fin-split-others', file: FIN, mode: 'block', anchor: '### 3.2 Autres trajets de référence (Solo)' },
  { id: 'fin-scenarios', file: FIN, mode: 'block', anchor: '## 4. Scénarios de volume — revenu de la plateforme' },
  { id: 'fin-driver-monthly', file: FIN, mode: 'block', anchor: '## 5. Revenu chauffeur mensuel (hypothèse)' },
  { id: 'fin-deposits', file: FIN, mode: 'block', anchor: '## 6. Trésorerie des dépôts (ce n\'est pas du revenu)' },
  { id: 'fin-breakeven', file: FIN, mode: 'block', anchor: '## 8. Seuil de rentabilité' },
  { id: 'fin-comparison', file: FIN, mode: 'block', anchor: '## 9. Comparaison concurrentielle (commission)' },
  { id: 'fin-vigilances', file: FIN, mode: 'block', anchor: '3. **Dépôts ≠ trésorerie disponible.**' },
  { id: 'plan-coverage', file: PLAN, mode: 'block', anchor: '> **Ce document est interne.' },
  { id: 'plan-argu', file: PLAN, mode: 'inline' },
  { id: 'plan-promise', file: PLAN, mode: 'block', anchor: '- **« Le prix accepté est le prix payé, même dans les embouteillages. »**' },
  { id: 'plan-vigilance', file: PLAN, mode: 'block', anchor: '7. **Vérification automatisée.**' },
  { id: 'plan-decisions', file: PLAN, mode: 'block', anchor: '## Décisions verrouillées (rappel)' },
  { id: 'readme-commission', file: README, mode: 'block', anchor: '- **Deux types de course :**' },
  { id: 'readme-map', file: README, mode: 'block', anchor: '- **Sécurité :**' },
  { id: 'readme-difficult', file: README, mode: 'block', anchorBlock: 'readme-map' },
  { id: 'readme-rules', file: README, mode: 'inline' },
  { id: 'etat-commission', file: ETAT, mode: 'block', anchor: '- **Modèle Uber, pas BlaBlaCar :**' },
  { id: 'etat-deposit', file: ETAT, mode: 'block', anchorBlock: 'etat-commission' },
  { id: 'etat-pricing', file: ETAT, mode: 'block', anchor: '- **Fidélité :**' },
  { id: 'etat-map', file: ETAT, mode: 'block', anchorBlock: 'etat-pricing' },
  { id: 'etat-difficult', file: ETAT, mode: 'block', anchorBlock: 'etat-map' },
  { id: 'etat-table-commission', file: ETAT, mode: 'inline' },
  { id: 'etat-table-keep', file: ETAT, mode: 'inline' },
  { id: 'etat-table-min', file: ETAT, mode: 'inline' },
  { id: 'etat-table-map', file: ETAT, mode: 'inline' },
  { id: 'etat-force1', file: ETAT, mode: 'block', anchor: '### 2.2 Les 3 vraies forces — celles qui font la différence' },
  { id: 'etat-weakness5', file: ETAT, mode: 'block', anchor: 'pas par la pub.' },
  { id: 'etat-paperasse-commission', file: ETAT, mode: 'inline' },
  { id: 'etat-paperasse-pricing', file: ETAT, mode: 'inline' },
  { id: 'etat-paperasse-neighborhoods', file: ETAT, mode: 'inline' },
  { id: 'etat-paperasse-pois', file: ETAT, mode: 'inline' },
  { id: 'etat-paperasse-cgu', file: ETAT, mode: 'inline' },
];

for (const b of BLOCKS) {
  if (!G[b.id]) fail(`générateur manquant pour le bloc ${b.id}`);
}

// ---------------------------------------------------------------------------
// Moteur de synchro
// ---------------------------------------------------------------------------
const START = (id) => `<!-- DOC-SYNC: ${id} -->`;
const END = '<!-- /DOC-SYNC -->';

/** Diff lisible, ligne par ligne (LCS simple — les blocs sont petits). */
function diffLines(actual, expected) {
  const a = actual.split('\n');
  const b = expected.split('\n');
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < n) out.push(`- ${a[i++]}`);
  while (j < m) out.push(`+ ${b[j++]}`);
  return out.join('\n');
}

/** Applique un bloc à un contenu de fichier. Retourne { content, status }.
 *  status : 'ok' (déjà à jour), 'updated' (contenu remplacé),
 *  'inserted' (marqueurs ajoutés après l'ancre), 'missing-marker' (inline
 *  sans marqueurs — à ajouter à la main dans un tableau), 'anchor-missing'. */
function applyBlock(content, block, generated) {
  const start = START(block.id);
  const i = content.indexOf(start);
  if (i !== -1) {
    const j = content.indexOf(END, i + start.length);
    if (j === -1) fail(`marqueur de fin manquant pour le bloc ${block.id}`);
    if (block.mode === 'inline') {
      const current = content.slice(i + start.length, j);
      if (current === generated) return { content, status: 'ok' };
      return {
        content: content.slice(0, i + start.length) + generated + content.slice(j),
        status: 'updated',
      };
    }
    // Mode bloc : le contenu vit entre les marqueurs, sur ses propres lignes.
    const current = content.slice(i + start.length, j).replace(/^\n|\n$/g, '');
    if (current === generated) return { content, status: 'ok' };
    return {
      content: content.slice(0, i + start.length) + `\n${generated}\n` + content.slice(j),
      status: 'updated',
    };
  }
  // Marqueurs absents.
  if (block.mode === 'inline') return { content, status: 'missing-marker' };
  // 1re passe : on insère les marqueurs après l'ancre.
  let anchorIdx = -1;
  let insertAt = -1;
  if (block.anchorBlock) {
    const prevStart = content.indexOf(START(block.anchorBlock));
    if (prevStart === -1) return { content, status: 'anchor-missing' };
    const prevEnd = content.indexOf(END, prevStart);
    if (prevEnd === -1) fail(`marqueur de fin manquant pour le bloc ${block.anchorBlock}`);
    const lineEnd = content.indexOf('\n', prevEnd);
    insertAt = lineEnd === -1 ? content.length : lineEnd + 1;
    anchorIdx = prevEnd;
  } else if (block.anchor) {
    const lines = content.split('\n');
    const li = lines.findIndex((l) => l.includes(block.anchor));
    if (li === -1) return { content, status: 'anchor-missing' };
    insertAt = lines.slice(0, li + 1).join('\n').length + 1;
    anchorIdx = li;
  }
  if (insertAt === -1 || anchorIdx === -1) return { content, status: 'anchor-missing' };
  const inserted = `${start}\n${generated}\n${END}\n`;
  return {
    content: content.slice(0, insertAt) + inserted + content.slice(insertAt),
    status: 'inserted',
  };
}

/** Met à jour la ligne « Dernière mise à jour » d'un doc interne. */
function refreshDateLine(content) {
  return content.replace(
    /> Dernière mise à jour : \*\*[^*]+\*\*\./,
    `> Dernière mise à jour : **${TODAY}**.`
  );
}

/** Ajoute une entrée au journal des mises à jour (docs internes uniquement).
 *  Sans doublon le même jour pour le même changement. */
function appendJournal(content, headingRe, summary) {
  const lines = content.split('\n');
  const hi = lines.findIndex((l) => headingRe.test(l));
  if (hi === -1) return { content, added: false };
  let lastRow = -1;
  for (let i = hi + 1; i < lines.length; i++) {
    if (/^\| \d{2}\/\d{2}\/\d{4} \|/.test(lines[i])) lastRow = i;
    else if (lastRow !== -1 && lines[i].trim() !== '' && !lines[i].startsWith('|')) break;
  }
  if (lastRow === -1) return { content, added: false };
  const row = `| ${TODAY} | ${summary} |`;
  if (lines.slice(0, lastRow + 1).some((l) => l.trim() === row)) return { content, added: false };
  lines.splice(lastRow + 1, 0, row);
  return { content: lines.join('\n'), added: true };
}

// ---------------------------------------------------------------------------
// Exécution
// ---------------------------------------------------------------------------
const files = [...new Set(BLOCKS.map((b) => b.file))];
const report = { updated: [], inserted: [], stale: [], skipped: [], errors: [] };
let exitCode = 0;

for (const file of files) {
  const isInternal = file.startsWith(INTERNAL_DIR);
  const exists = fs.existsSync(file);
  if (!exists) {
    if (isInternal) {
      // Hors repo (ex. build Vercel) : les docs internes ne sont pas là.
      report.skipped.push(`${path.basename(file)} (hors repo — ignoré)`);
      continue;
    }
    fail(`fichier de documentation introuvable : ${file}`);
  }
  const original = readOrThrow(file, path.basename(file));
  let content = original;
  const changedBlocks = [];
  const fileBlocks = BLOCKS.filter((b) => b.file === file);
  for (const block of fileBlocks) {
    const generated = G[block.id](CTX);
    if (generated.includes('\n') && block.mode === 'inline') {
      fail(`le bloc inline ${block.id} ne doit pas contenir de saut de ligne`);
    }
    const res = applyBlock(content, block, generated);
    if (res.status === 'updated' || res.status === 'inserted') {
      content = res.content;
      changedBlocks.push(block.id);
      report[res.status].push(`${path.basename(file)} :: ${block.id}`);
    } else if (res.status === 'missing-marker') {
      report.stale.push(
        `${path.basename(file)} :: ${block.id} — marqueurs absents (bloc inline : à ajouter à la main dans le tableau)`
      );
      exitCode = 1;
    } else if (res.status === 'anchor-missing') {
      report.stale.push(
        `${path.basename(file)} :: ${block.id} — ancre introuvable, impossible d'insérer les marqueurs`
      );
      exitCode = 1;
    } else if (CHECK_MODE) {
      // 'ok' en mode check : rien à faire.
    }
    if (CHECK_MODE && res.status === 'updated') {
      const start = START(block.id);
      const i = original.indexOf(start);
      const j = original.indexOf(END, i + start.length);
      const current =
        block.mode === 'inline'
          ? original.slice(i + start.length, j)
          : original.slice(i + start.length, j).replace(/^\n|\n$/g, '');
      report.stale.push(
        `${path.basename(file)} :: ${block.id} — en retard :\n${diffLines(current, generated)}`
      );
      exitCode = 1;
    }
  }

  if (CHECK_MODE) continue;

  // Écriture + journal (docs internes) seulement si quelque chose a changé.
  if (content !== original) {
    const summary = `Mise à jour automatique (docs:sync) : ${changedBlocks.join(', ')}`;
    if (isInternal) {
      content = refreshDateLine(content);
      const journaled = appendJournal(content, /^##.*Journal des mises à jour/, summary);
      content = journaled.content;
    }
    fs.writeFileSync(file, content, 'utf8');
    report.updated.push(`${path.basename(file)} (${changedBlocks.length} bloc(s))`);
  }
}

// ---------------------------------------------------------------------------
// Rapport
// ---------------------------------------------------------------------------
const mode = CHECK_MODE ? 'docs:check' : 'docs:sync';
if (CHECK_MODE) {
  if (exitCode === 0) {
    console.log(`[${mode}] OK — toutes les documentations sont à jour (${BLOCKS.length} blocs).`);
  } else {
    console.error(`[${mode}] ÉCHEC — documentations en retard :`);
    for (const s of report.stale) console.error(`\n--- ${s}`);
    console.error(`\nLancez \`npm run docs:sync\` pour régénérer depuis le code.`);
  }
} else {
  console.log(`[${mode}] Source : lib/pricing.ts, lib/commission.ts, lib/fare-guard.ts, lib/neighborhoods.ts, lib/pois.ts, lib/gamification.ts`);
  console.log(`[${mode}] ${CTX.NB_QUARTIERS} quartiers, ${CTX.NB_POIS} lieux, ${CTX.NB_DIFFICULT} difficiles — estimation ancre ${CTX.ANCHOR_TRIP.label} : Solo ${CTX.fmt(CTX.ANCHOR_TRIP.solo)} / Groupe ${CTX.fmt(CTX.ANCHOR_TRIP.groupe)} FCFA, moyenne par course ${CTX.fmt(CTX.AVG_FARE)} FCFA.`);
  if (report.inserted.length) console.log(`[${mode}] Marqueurs ajoutés :\n  - ${report.inserted.join('\n  - ')}`);
  if (report.updated.length) console.log(`[${mode}] Fichiers mis à jour :\n  - ${report.updated.join('\n  - ')}`);
  if (!report.inserted.length && !report.updated.length) {
    console.log(`[${mode}] Rien à faire — toutes les documentations sont déjà à jour (${BLOCKS.length} blocs).`);
  }
}
for (const s of report.skipped) console.log(`[${mode}] Ignoré : ${s}`);
process.exit(exitCode);
