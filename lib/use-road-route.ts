'use client';

import { useEffect, useRef, useState } from 'react';
import { fetchRoadRouteViaApi, type RoadRoute, type RoutePoint } from './routing';

/** ETA routière + itinéraire côté client (P0b).
 *
 *  Un seul point d'accès à `/api/route` pour tout le client, pour ne
 *  pas marteler le serveur démo OSRM (limite : 1 requête/seconde,
 *  espacées côté serveur à 1,1 s) :
 *  - cache mémoire partagé entre composants (5 min, même clé que le
 *    cache serveur — coordonnées arrondies à 4 décimales) ;
 *  - déduplication des appels en vol (deux composants qui demandent
 *    le même trajet partagent la même promesse) ;
 *  - nouveau calcul seulement quand le départ ou l'arrivée a bougé
 *    d'environ 100 m (arrondi à 3 décimales) — le chauffeur qui
 *    avance ne relance pas un appel à chaque position GPS ;
 *  - rafraîchissement optionnel toutes les `refreshMs` (défaut :
 *    pas de rafraîchissement — l'appelant décide).
 *
 *  En cas d'échec (`null` : route API injoignable), l'appelant garde
 *  son estimation à vol d'oiseau — jamais d'erreur visible.
 *  Le PRIX n'utilise jamais cette route (modèle au km sur la distance
 *  à vol d'oiseau, `lib/pricing.ts`) : durée et distance affichées
 *  seulement.
 */

const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { at: number; route: RoadRoute }>();
const inflight = new Map<string, Promise<RoadRoute | null>>();

function cacheKey(from: RoutePoint, to: RoutePoint): string {
  const r = (n: number) => n.toFixed(4);
  return `${r(from.lat)},${r(from.lng)}>${r(to.lat)},${r(to.lng)}`;
}

function fetchShared(from: RoutePoint, to: RoutePoint): Promise<RoadRoute | null> {
  const key = cacheKey(from, to);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CLIENT_CACHE_TTL_MS) {
    return Promise.resolve(cached.route);
  }
  const running = inflight.get(key);
  if (running) return running;
  const p = fetchRoadRouteViaApi(from, to)
    .then((route) => {
      if (route) cache.set(key, { at: Date.now(), route });
      return route;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

/** Arrondi à ~100 m : en dessous, on garde la route déjà calculée. */
function round100m(p: RoutePoint): RoutePoint {
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
}

export function useRoadRoute(
  from: RoutePoint | null,
  to: RoutePoint | null,
  opts: { enabled?: boolean; refreshMs?: number } = {}
): { route: RoadRoute | null; loading: boolean } {
  const enabled = opts.enabled ?? true;
  const refreshMs = opts.refreshMs ?? 0;
  const [route, setRoute] = useState<RoadRoute | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchedRef = useRef<string | null>(null);

  const fromKey = from ? `${round100m(from).lat},${round100m(from).lng}` : null;
  const toKey = to ? `${round100m(to).lat},${round100m(to).lng}` : null;

  useEffect(() => {
    if (!enabled || !from || !to || !fromKey || !toKey) {
      lastFetchedRef.current = null;
      return;
    }
    const key = `${fromKey}>${toKey}`;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      // Même trajet à ~100 m près : pas de nouvel appel.
      if (lastFetchedRef.current === key) return;
      lastFetchedRef.current = key;
      setLoading(true);
      const r = await fetchShared(from as RoutePoint, to as RoutePoint);
      if (cancelled) return;
      if (r) setRoute(r);
      setLoading(false);
    }
    load();
    if (refreshMs > 0) {
      // Rafraîchissement périodique : on force le recalcul (trafic,
      // chauffeur qui a beaucoup bougé entre deux arrondis).
      timer = setInterval(() => {
        lastFetchedRef.current = null;
        load();
      }, refreshMs);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // from/to intentionnellement absents : fromKey/toKey portent le
    // mouvement à ~100 m près ; from/to ne servent qu'au fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, fromKey, toKey, refreshMs]);

  return { route, loading };
}

/** Lien d'itinéraire externe gratuit, sans compte (repli navigation
 *  P0b) : Google Maps, origine → destination en voiture. Sans origine
 *  connue, Google part de la position actuelle de l'appareil. */
export function googleMapsDirectionsUrl(
  to: RoutePoint,
  from?: RoutePoint | null
): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${to.lat},${to.lng}`,
    travelmode: 'driving',
  });
  if (from) params.set('origin', `${from.lat},${from.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
