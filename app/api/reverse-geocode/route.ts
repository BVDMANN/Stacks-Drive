import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

/** GET /api/reverse-geocode — géocodage inverse (v2.47, pickup précis).
 *
 *  Le passager déplace l'épingle sur la carte : l'adresse du point
 *  s'affiche dans la feuille (« Point de départ : Rue du Bord de mer,
 *  Centre-ville »). L'appel passe par le serveur — le navigateur ne
 *  parle jamais directement à Nominatim, dont la politique d'usage
 *  exige 1 requête/seconde et un User-Agent qui identifie l'appli
 *  (le serveur applique les deux).
 *
 *  Sources, dans l'ordre : Nominatim (OpenStreetMap, gratuit, sans
 *  clé — `reverse?format=jsonv2`, zoom 18 : rue + numéro + quartier),
 *  puis Photon (Komoot, gratuit, sans clé) en repli si Nominatim
 *  échoue ou dépasse 5 s. Si les deux échouent, la réponse est quand
 *  même `ok: true` avec `address: null` — le client affiche alors les
 *  coordonnées + le quartier le plus proche, jamais une adresse
 *  inventée (voir `lib/pickup-point.ts`).
 *
 *  Cache serveur 10 min par point (coordonnées arrondies à 4
 *  décimales, ~11 m — un glisser d'épingle ne rappelle pas le
 *  service) + espacement minimum 1,1 s entre deux appels amont
 *  (limite Nominatim : 1 req/s). Le cache et l'espacement sont
 *  par instance serveur (démarrage à froid = compteurs remis à zéro)
 *  : en production multi-instances, la limite reste respectée en
 *  moyenne grâce au cache client (debounce 400 ms) et au cache
 *  serveur — voir ADR 0022 pour le plan de montée en charge
 *  (Photon / Nominatim auto-hébergé au lancement si le volume
 *  l'exige).
 *
 *  Paramètres : lat, lng (coordonnées GPS).
 *  Réponse : { ok: true, address: string | null, area: string | null,
 *  source: 'nominatim' | 'photon' | 'none' }.
 */

const QuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

/** User-Agent exigé par la politique d'usage Nominatim : nom de
 *  l'appli + URL + contact. L'e-mail est celui de l'entreprise
 *  (déjà public dans `.env.example` et la documentation). */
const NOMINATIM_USER_AGENT =
  'Stacks-Drive/2.47 (https://stacks-drive.vercel.app; contact stacks.markett@gmail.com)';

const NOMINATIM_MIN_INTERVAL_MS = 1100;
const UPSTREAM_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 10 * 60 * 1000;

type Source = 'nominatim' | 'photon' | 'none';

interface Resolved {
  address: string | null;
  area: string | null;
  source: Source;
}

const cache = new Map<string, { at: number; result: Resolved }>();
let lastUpstreamCallAt = 0;

function cacheKey(lat: number, lng: number): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(lat)},${r(lng)}`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Adresse lisible depuis une réponse Nominatim (`addressdetails=1`,
 *  zoom 18) : « Rue du Bord de mer 12, Centre-ville », « Rue du Bord
 *  de mer, Centre-ville », ou juste le quartier si la rue est
 *  inconnue. Null si rien d'exploitable. */
function formatNominatim(data: {
  address?: {
    road?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    city?: string;
    town?: string;
  };
}): Resolved | null {
  const a = data.address;
  if (!a) return null;
  const road = a.road?.trim() ?? '';
  const number = a.house_number?.trim() ?? '';
  const area =
    a.suburb?.trim() ??
    a.neighbourhood?.trim() ??
    a.city_district?.trim() ??
    a.city?.trim() ??
    a.town?.trim() ??
    null;
  const street = road ? (number ? `${road} ${number}` : road) : null;
  if (street && area) return { address: `${street}, ${area}`, area, source: 'nominatim' };
  if (street) return { address: street, area, source: 'nominatim' };
  if (area) return { address: area, area, source: 'nominatim' };
  return null;
}

/** Adresse lisible depuis une réponse Photon (`/reverse`) : premier
 *  résultat GeoJSON — `name` (lieu), `street` + `housenumber`,
 *  `district` / `city`. Même forme que Nominatim. */
function formatPhoton(data: {
  features?: {
    properties?: {
      name?: string;
      street?: string;
      housenumber?: string;
      district?: string;
      city?: string;
    };
  }[];
}): Resolved | null {
  const p = data.features?.[0]?.properties;
  if (!p) return null;
  const road = p.street?.trim() ?? '';
  const number = p.housenumber?.trim() ?? '';
  const area = p.district?.trim() ?? p.city?.trim() ?? null;
  const street = road ? (number ? `${road} ${number}` : road) : null;
  if (street && area) return { address: `${street}, ${area}`, area, source: 'photon' };
  if (street) return { address: street, area, source: 'photon' };
  if (p.name?.trim()) return { address: p.name.trim(), area, source: 'photon' };
  if (area) return { address: area, area, source: 'photon' };
  return null;
}

async function resolveNominatim(lat: number, lng: number): Promise<Resolved | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetchWithTimeout(
      url,
      { headers: { Accept: 'application/json', 'User-Agent': NOMINATIM_USER_AGENT } },
      UPSTREAM_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Parameters<typeof formatNominatim>[0];
    return formatNominatim(data);
  } catch {
    return null;
  }
}

async function resolvePhoton(lat: number, lng: number): Promise<Resolved | null> {
  try {
    const url = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`;
    const res = await fetchWithTimeout(
      url,
      { headers: { Accept: 'application/json' } },
      UPSTREAM_TIMEOUT_MS
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Parameters<typeof formatPhoton>[0];
    return formatPhoton(data);
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Coordonnées invalides.' }, { status: 400 });
  }
  const { lat, lng } = parsed.data;
  const key = cacheKey(lat, lng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, ...cached.result, cached: true });
  }
  // Respect de la limite Nominatim : 1 requête/seconde (marge 1,1 s).
  const waitMs = NOMINATIM_MIN_INTERVAL_MS - (Date.now() - lastUpstreamCallAt);
  if (waitMs > 0) await sleep(waitMs);
  lastUpstreamCallAt = Date.now();
  const resolved =
    (await resolveNominatim(lat, lng)) ??
    (await resolvePhoton(lat, lng)) ?? { address: null, area: null, source: 'none' as Source };
  cache.set(key, { at: Date.now(), result: resolved });
  return NextResponse.json({ ok: true, ...resolved, cached: false });
}
