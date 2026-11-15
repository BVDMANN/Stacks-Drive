import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { SERVICE_BOUNDS } from '@/lib/geo';

/** GET /api/search-address — recherche d'adresses rue par rue
 *  (v2.51, le trou de la recherche de destination : jusqu'ici on ne
 *  trouvait que les 75 quartiers et les lieux de la carte — une
 *  rue tapée au clavier ne donnait rien).
 *
 *  Le client n'appelle jamais Photon directement : l'appel passe par
 *  le serveur — même pattern que `/api/reverse-geocode` (proxy
 *  Nominatim puis Photon, cache 10 min, espacement 1,1 s, timeout
 *  5 s). Photon est gratuit, sans clé, et indexe les rues OSM de
 *  Libreville (nom + quartier/district + coordonnées).
 *
 *  Paramètres : q (≥ 2 caractères), lat/lng optionnels (tri par
 *  proximité côté Photon). Bbox Grand Libreville imposée côté
 *  Photon ET re-vérifiée ici (un résultat hors zone est écarté —
 *  Photon peut déborder de la bbox sur les noms ambigus).
 *
 *  Réponse : { ok: true, results: [{ id, name, street, district,
 *  city, type, lat, lng }], source: 'photon' | 'none' }. `id` =
 *  `osm_type:osm_id` (stable — deux rues au même nom ne se
 *  confondent jamais). Si Photon échoue ou dépasse 5 s, la réponse
 *  est quand même `ok: true` avec un tableau vide + source 'none'
 *  — le client affiche alors les résultats locaux seuls, jamais
 *  une erreur brute.
 *
 *  Déduplication : Photon renvoie parfois le même lieu plusieurs
 *  fois (une entrée par `osm_key` — ex. une agence à la fois
 *  `amenity=bank` et `office=financial`) : on ne garde que la
 *  première occurrence de chaque `osm_type:osm_id`.
 */

const QuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const PHOTON_MIN_INTERVAL_MS = 1100;
const UPSTREAM_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const RESULT_LIMIT = 8;
/** Bbox Grand Libreville (même rectangle que `SERVICE_BOUNDS`,
 *  ordre Photon : lon min, lat min, lon max, lat max). */
const PHOTON_BBOX = `${SERVICE_BOUNDS.west},${SERVICE_BOUNDS.south},${SERVICE_BOUNDS.east},${SERVICE_BOUNDS.north}`;

type Source = 'photon' | 'none';

interface AddressHit {
  id: string;
  name: string;
  street: string | null;
  district: string | null;
  city: string | null;
  type: string;
  lat: number;
  lng: number;
}

const cache = new Map<string, { at: number; result: { results: AddressHit[]; source: Source } }>();
let lastUpstreamCallAt = 0;

function cacheKey(q: string, lat?: number, lng?: number): string {
  const norm = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const r = (n: number) => n.toFixed(2);
  return lat !== undefined && lng !== undefined ? `${norm}|${r(lat)},${r(lng)}` : norm;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface PhotonFeature {
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    type?: string;
    name?: string;
    street?: string;
    district?: string;
    city?: string;
  };
  geometry?: { coordinates?: [number, number] };
}

function toHits(data: { features?: PhotonFeature[] }): AddressHit[] {
  const seen = new Set<string>();
  const hits: AddressHit[] = [];
  for (const f of data.features ?? []) {
    const p = f.properties ?? {};
    const coords = f.geometry?.coordinates;
    const name = p.name?.trim();
    if (!name || !coords || coords.length < 2) continue;
    const lng = coords[0];
    const lat = coords[1];
    // Re-vérification bbox : Photon peut déborder sur les noms
    // ambigus (ex. « Rue du Bord de mer » en France) — hors zone
    // = écarté, jamais proposé comme destination à Libreville.
    if (
      lat < SERVICE_BOUNDS.south ||
      lat > SERVICE_BOUNDS.north ||
      lng < SERVICE_BOUNDS.west ||
      lng > SERVICE_BOUNDS.east
    ) {
      continue;
    }
    const id =
      p.osm_type && p.osm_id !== undefined ? `${p.osm_type}:${p.osm_id}` : `${name}|${lat.toFixed(5)},${lng.toFixed(5)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    hits.push({
      id,
      name,
      street: p.street?.trim() || null,
      district: p.district?.trim() || null,
      city: p.city?.trim() || null,
      type: p.type?.trim() || p.osm_value?.trim() || 'place',
      lat,
      lng,
    });
  }
  return hits;
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Recherche invalide.' }, { status: 400 });
  }
  const { q, lat, lng } = parsed.data;
  const key = cacheKey(q, lat, lng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, ...cached.result, cached: true });
  }
  // Respect de la politique d'usage Photon : 1 requête/seconde.
  const waitMs = PHOTON_MIN_INTERVAL_MS - (Date.now() - lastUpstreamCallAt);
  if (waitMs > 0) await sleep(waitMs);
  lastUpstreamCallAt = Date.now();
  let result: { results: AddressHit[]; source: Source } = { results: [], source: 'none' };
  try {
    const params = new URLSearchParams({
      q,
      limit: String(RESULT_LIMIT),
      bbox: PHOTON_BBOX,
      lang: 'fr',
    });
    if (lat !== undefined && lng !== undefined) {
      params.set('lat', String(lat));
      params.set('lon', String(lng));
    }
    const res = await fetchWithTimeout(`https://photon.komoot.io/api/?${params.toString()}`, UPSTREAM_TIMEOUT_MS);
    if (res.ok) {
      const data = (await res.json()) as { features?: PhotonFeature[] };
      const hits = toHits(data);
      result = { results: hits, source: 'photon' };
    }
  } catch {
    // Photon injoignable : repli propre, tableau vide + source
    // 'none' — jamais d'erreur brute au client.
  }
  cache.set(key, { at: Date.now(), result });
  return NextResponse.json({ ok: true, ...result, cached: false });
}
