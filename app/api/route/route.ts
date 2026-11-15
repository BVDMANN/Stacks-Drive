import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fetchRoadRoute, ROUTE_CACHE_TTL_MS, type RoadRoute } from '@/lib/routing';

/** GET /api/route — itinéraire routier (v2.27, lot E — phase 1).
 *
 *  Proxy OSRM démo (serveur public, sans clé — voir `lib/routing.ts`) :
 *  la clé n'existe pas, rien de secret ne transite ici. Cache serveur
 *  5 min par trajet (mêmes coordonnées arrondies). L'espacement
 *  minimum 1,1 s entre deux appels au serveur démo (limite : 1 req/s)
 *  est centralisé dans `fetchRoadRoute` depuis la v2.50 — cette route
 *  n'a plus à l'appliquer elle-même.
 *  En cas d'indisponibilité d'OSRM, repli ligne droite (jamais
 *  d'erreur : la carte trace l'ancien trait droit et la durée estimée).
 *
 *  Paramètres : fromLat, fromLng, toLat, toLng (coordonnées GPS).
 *  Réponse : { ok: true, route: { distanceKm, durationMin, geometry,
 *  source: 'osrm' | 'fallback' } }.
 */

const QuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat: z.coerce.number().min(-90).max(90),
  toLng: z.coerce.number().min(-180).max(180),
});

const cache = new Map<string, { at: number; route: RoadRoute }>();

function cacheKey(fromLat: number, fromLng: number, toLat: number, toLng: number): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(fromLat)},${r(fromLng)}>${r(toLat)},${r(toLng)}`;
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Coordonnées invalides.' }, { status: 400 });
  }
  const { fromLat, fromLng, toLat, toLng } = parsed.data;
  const key = cacheKey(fromLat, fromLng, toLat, toLng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, route: cached.route, cached: true });
  }
  const route = await fetchRoadRoute(
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng }
  );
  cache.set(key, { at: Date.now(), route });
  return NextResponse.json({ ok: true, route, cached: false });
}
