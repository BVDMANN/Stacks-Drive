#!/usr/bin/env node
/** Récupération des épiceries de Libreville depuis OpenStreetMap
 *  (v2.51) — génère `lib/epiceries.ts` (données LOCALES : la carte
 *  ne dépend pas d'Overpass à chaque chargement).
 *
 *  SOURCE PRIMAIRE — API Overpass (exhaustive) :
 *    requête : nwr[shop=supermarket|convenience|grocery] dans le
 *    rectangle Grand Libreville (lat 0,22–0,69, lng 9,24–9,76),
 *    `out center` (les ways donnent leur centre).
 *    endpoint : https://overpass-api.de/api/interpreter
 *  REPLI — Photon (partiel, par noms) : si Overpass est
 *    injoignable (c'est le cas depuis la VM de dev — proxy, HTTP
 *    406 / connexions refusées), le script interroge Photon avec
 *    une liste de termes (noms génériques + enseignes connues) et
 *    ne garde que les résultats tagués `shop=supermarket /
 *    convenience / grocery`. La moisson Photon est PARTIELLE (un
 *    commerce sans nom ne peut pas être trouvé par nom) : pour la
 *    couverture complète, relancer ce script depuis un poste avec
 *    accès Overpass — Overpass reste la source de référence.
 *
 *  RÈGLES (aucune donnée inventée) :
 *  - chaque point vient d'OSM avec ses VRAIES coordonnées et son
 *    VRAI nom (`name` OSM) ; sans nom → libellé générique
 *    « Épicerie » + rue si connue (`addr:street`), jamais de nom
 *    inventé ;
 *  - déduplication avec les POI existants (`lib/pois.ts`) : un
 *    point à moins de 30 m d'un POI est écarté (même lieu, autre
 *    nom) ; à moins de 80 m avec un nom qui se recoupe (l'un
 *    contient l'autre, accents/casse ignorés), il est écarté aussi
 *    — un même lieu n'apparaît qu'une fois sur la carte ;
 *  - identifiant stable `epicerie-<osm_type>-<osm_id>` (jamais de
 *    clé sur le nom : deux « Épicerie » sans nom ne se confondent
 *    pas).
 *
 *  RAFRAÎCHIR :
 *    node scripts/fetch-epiceries.mjs
 *  Le script réécrit `lib/epiceries.ts` (en-tête daté + nombre de
 *  points + source utilisée) et liste les points écartés.
 *
 *  AUCUNE migration, AUCUN token, AUCUN push — le script ne fait
 *  qu'écrire le fichier de données local.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'lib', 'epiceries.ts');
const POIS_FILE = path.join(ROOT, 'lib', 'pois.ts');

const BBOX = { south: 0.22, west: 9.24, north: 0.69, east: 9.76 };
const SHOP_VALUES = new Set(['supermarket', 'convenience', 'grocery']);
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const PHOTON_BBOX = `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`;
// Termes du repli Photon (noms génériques + enseignes de Libreville
// dont le nom est connu — un commerce OSM sans nom ne peut pas être
// trouvé par cette voie ; voir l'en-tête).
const PHOTON_TERMS = [
  'supermarché',
  'supermarket',
  'épicerie',
  'alimentation',
  'market',
  'CK2',
  'Cecado',
  'Casino',
  'Géant',
  'Carrefour',
  'Prix Import',
  'Mbolo',
  'Spar',
  'Super U',
  'Auchan',
  'Leader Price',
  'Mini Market',
  'Boutique',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLa = ((lat2 - lat1) * Math.PI) / 180;
  const dLo = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLa / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function inBbox(lat, lng) {
  return lat >= BBOX.south && lat <= BBOX.north && lng >= BBOX.west && lng <= BBOX.east;
}

async function fetchJson(url, init, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Moisson Overpass (exhaustive). Lance une erreur si injoignable. */
async function harvestOverpass() {
  const q = `[out:json][timeout:60];(nwr["shop"="supermarket"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});nwr["shop"="convenience"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});nwr["shop"="grocery"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}););out center 500;`;
  const data = await fetchJson(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(q)}`,
  }, 60000);
  const out = [];
  for (const el of data.elements ?? []) {
    const tags = el.tags ?? {};
    if (!SHOP_VALUES.has(tags.shop)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined || !inBbox(lat, lng)) continue;
    out.push({
      id: `epicerie-${el.type}-${el.id}`,
      name: tags.name?.trim() || 'Épicerie',
      shop: tags.shop,
      lat,
      lng,
      street: tags['addr:street']?.trim() || null,
    });
  }
  return out;
}

/** Moisson Photon (repli partiel, par noms — voir l'en-tête). */
async function harvestPhoton() {
  const byId = new Map();
  for (const term of PHOTON_TERMS) {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&bbox=${PHOTON_BBOX}&limit=50&lang=fr`;
      const data = await fetchJson(url, { headers: { Accept: 'application/json' } }, 15000);
      for (const f of data.features ?? []) {
        const p = f.properties ?? {};
        if (p.osm_key !== 'shop' || !SHOP_VALUES.has(p.osm_value)) continue;
        const coords = f.geometry?.coordinates;
        if (!coords || coords.length < 2) continue;
        const lng = coords[0];
        const lat = coords[1];
        if (!inBbox(lat, lng)) continue;
        const id = `epicerie-${p.osm_type}-${p.osm_id}`;
        if (byId.has(id)) continue;
        byId.set(id, {
          id,
          name: p.name?.trim() || 'Épicerie',
          shop: p.osm_value,
          lat,
          lng,
          street: p.street?.trim() || null,
        });
      }
    } catch (err) {
      console.error(`[fetch-epiceries] Photon « ${term} » : ${err.message}`);
    }
    await sleep(1100);
  }
  return [...byId.values()];
}

/** POI existants (nom + coords) lus dans lib/pois.ts — pour la
 *  déduplication « même lieu = une seule fois ». */
function readExistingPois() {
  const src = fs.readFileSync(POIS_FILE, 'utf8');
  const pois = [];
  const re =
    /\{\s*name:\s*'([^']+)',\s*category:\s*'([^']+)',\s*neighborhood:\s*'([^']+)',\s*lat:\s*([0-9.]+),\s*lng:\s*([0-9.]+)/g;
  for (const m of src.matchAll(re)) {
    pois.push({ name: m[1], category: m[2], lat: parseFloat(m[4]), lng: parseFloat(m[5]) });
  }
  return pois;
}

function dedup(candidates, existing) {
  const kept = [];
  const dropped = [];
  for (const c of candidates) {
    let reason = null;
    for (const p of existing) {
      const d = haversineM(c.lat, c.lng, p.lat, p.lng);
      if (d <= 30) {
        reason = `à ${Math.round(d)} m du POI « ${p.name} » (${p.category}) — même lieu`;
        break;
      }
      if (d <= 80) {
        const cn = norm(c.name);
        const pn = norm(p.name);
        if (cn && pn && (cn.includes(pn) || pn.includes(cn))) {
          reason = `à ${Math.round(d)} m du POI « ${p.name} » (${p.category}), nom recoupé — même lieu`;
          break;
        }
      }
    }
    if (reason) dropped.push({ ...c, reason });
    else kept.push(c);
  }
  return { kept, dropped };
}

function esc(s) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function main() {
  const existing = readExistingPois();
  console.log(`[fetch-epiceries] POI existants lus : ${existing.length}`);
  let harvested = [];
  let source = 'overpass';
  try {
    harvested = await harvestOverpass();
    console.log(`[fetch-epiceries] Overpass : ${harvested.length} commerces`);
  } catch (err) {
    console.error(`[fetch-epiceries] Overpass injoignable (${err.message}) — repli Photon (partiel).`);
    source = 'photon-fallback';
    harvested = await harvestPhoton();
    console.log(`[fetch-epiceries] Photon (repli) : ${harvested.length} commerces`);
  }
  // Déduplication interne (même osm_id déjà écarté ; même nom +
  // mêmes coords arrondies = doublon de source).
  const seen = new Set();
  harvested = harvested.filter((c) => {
    const k = `${norm(c.name)}|${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const { kept, dropped } = dedup(harvested, existing);
  kept.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const date = new Date().toISOString().slice(0, 10);
  const header = `/** Épiceries de Libreville (v2.51) — données OpenStreetMap,
 *  générées par \`scripts/fetch-epiceries.mjs\` (NE PAS ÉDITER À LA
 *  MAIN — relancer le script pour rafraîchir).
 *
 *  Source : ${source === 'overpass' ? 'API Overpass (exhaustive : shop=supermarket / convenience / grocery, Grand Libreville)' : 'Photon (REPLI PARTIEL, par noms — Overpass injoignable depuis la VM de dev ; pour la couverture complète, relancer le script depuis un poste avec accès Overpass)'}.
 *  Date de génération : ${date} — ${kept.length} point(s).
 *  Déduplication : ${dropped.length} point(s) écarté(s) car déjà
 *  présent(s) dans les POI (\`lib/pois.ts\`) — même lieu = une seule
 *  fois (voir le journal du script).
 *
 *  Chaque point vient d'OSM avec ses vraies coordonnées et son vrai
 *  nom ; sans nom → libellé générique « Épicerie » + rue si connue,
 *  jamais de nom inventé. La carte ne dépend pas d'Overpass à
 *  chaque chargement : ces données sont locales.
 */`;
  const body = kept
    .map(
      (c) =>
        `  { id: '${c.id}', name: '${esc(c.name)}', shop: '${c.shop}', lat: ${c.lat}, lng: ${c.lng}, street: ${c.street ? `'${esc(c.street)}'` : 'null'} },`
    )
    .join('\n');
  const file = `${header}

export type EpicerieShop = 'supermarket' | 'convenience' | 'grocery';

/** Une épicerie OSM : nom réel (ou « Épicerie » générique), type de
 *  commerce, coordonnées exactes, rue si connue. Identifiant
 *  stable (osm_type + osm_id) — deux « Épicerie » sans nom ne se
 *  confondent pas. */
export interface Epicerie {
  id: string;
  name: string;
  shop: EpicerieShop;
  lat: number;
  lng: number;
  street: string | null;
}

export const EPICERIES: Epicerie[] = [
${body}
];
`;
  fs.writeFileSync(OUT_FILE, file);
  console.log(`[fetch-epiceries] Écrit ${OUT_FILE} : ${kept.length} épicerie(s), ${dropped.length} écartée(s).`);
  for (const d of dropped) console.log(`  écartée : ${d.name} (${d.lat}, ${d.lng}) — ${d.reason}`);
}

main().catch((err) => {
  console.error('[fetch-epiceries] ÉCHEC :', err);
  process.exit(1);
});
