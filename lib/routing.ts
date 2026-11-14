/** Itinéraire routier (v2.27, lot E — phase 1).
 *
 *  La carte traçait jusqu'ici une ligne droite entre le départ et la
 *  destination. On passe par OSRM (Open Source Routing Machine) pour
 *  obtenir le vrai trajet par les rues de Libreville : distance et
 *  durée routières réelles, géométrie à afficher sur la carte.
 *
 *  Serveur de routage : le serveur DÉMO public d'OSRM
 *  (`router.project-osrm.org`, sans clé) — testé le 14/11/2026 :
 *  Centre-ville → Nzeng-Ayong = 6,54 km, 10 min, par des rues
 *  nommées (Rue Basile Itaty, Avenue Pierre Marie Tchouakero,
 *  Boulevard Monseigneur Jean-Rémi Bessieux…). Limites du serveur
 *  démo : max 1 requête/seconde, usage raisonnable non commercial,
 *  aucune garantie de disponibilité — DÉMO UNIQUEMENT, pas pour la
 *  production : l'auto-hébergement OSRM sur petit VPS viendra au
 *  lancement (décision différée, pas dans ce lot).
 *
 *  Règles :
 *  - L'ESTIMATION DE PRIX NE CHANGE PAS : le modèle au km actuel
 *    (Solo 500 + 210/km, Groupe 300 + 135/km — `lib/pricing.ts`)
 *    reste calculé sur la distance à vol d'oiseau. Seules la durée
 *    et la distance AFFICHÉES deviennent routières.
 *  - Repli ligne droite : si OSRM est indisponible (ou trop lent),
 *    on revient à l'ancien comportement (ligne droite + durée
 *    estimée à 25 km/h) — jamais d'erreur visible pour l'utilisateur.
 *  - Aucun secret : l'URL du serveur est une variable
 *    d'environnement publique (`OSRM_BASE_URL`), sans clé.
 *  - Étapes (P0b) : `steps=true` — les manœuvres OSRM sont traduites
 *    en instructions françaises (`RouteStep`) pour la navigation
 *    guidée du chauffeur ; vides en repli ligne droite.
 */

import { haversineKm } from './geo';

export interface RoutePoint {
  lat: number;
  lng: number;
}

export type RouteSource = 'osrm' | 'fallback';

export interface RouteStep {
  /** Instruction en français (« Tourne à gauche sur Rue Basile Itaty »). */
  instruction: string;
  /** Longueur de l'étape, en km. */
  distanceKm: number;
  /** Durée de l'étape, en minutes. */
  durationMin: number;
}

export interface RoadRoute {
  /** Distance routière (OSRM) ou à vol d'oiseau (repli), en km. */
  distanceKm: number;
  /** Durée routière (OSRM) ou estimée à 25 km/h (repli), en minutes. */
  durationMin: number;
  /** Géométrie du trajet (points lat/lng) — ligne droite à 2 points
   *  en repli. */
  geometry: RoutePoint[];
  source: RouteSource;
  /** Instructions virage par virage (manœuvres OSRM, en français) —
   *  vides en repli ligne droite. Utilisées par la navigation guidée
   *  chauffeur (P0b) : aucune instruction = pas de guidage, juste
   *  l'itinéraire. */
  steps: RouteStep[];
}

/** Serveur OSRM démo (public, sans clé). Surchargé par la variable
 *  d'environnement `OSRM_BASE_URL` (futur VPS auto-hébergé). */
export const OSRM_DEMO_BASE_URL = 'https://router.project-osrm.org';

/** Durée du cache serveur d'un trajet (5 min par trajet). */
export const ROUTE_CACHE_TTL_MS = 5 * 60 * 1000;

/** Intervalle minimum entre deux appels au serveur démo OSRM
 *  (limite : 1 requête/seconde — on garde une marge). */
export const OSRM_MIN_INTERVAL_MS = 1100;

/** Nombre maximum de points conservés dans une géométrie (allègement
 *  avant envoi au client — un trajet urbain tient largement dedans). */
export const ROUTE_MAX_POINTS = 400;

/** Durée estimée à vitesse urbaine moyenne (25 km/h) + 2 min fixes —
 *  même formule que `estimateTrip` (`lib/pricing.ts`) : le repli
 *  affiche exactement ce que l'ancienne estimation affichait. */
export function estimateDurationMin(distanceKm: number): number {
  return Math.max(5, Math.round((distanceKm / 25) * 60) + 2);
}

/** Repli ligne droite : distance à vol d'oiseau + durée estimée. */
export function straightLineRoute(from: RoutePoint, to: RoutePoint): RoadRoute {
  const distanceKm = haversineKm(from.lat, from.lng, to.lat, to.lng);
  return {
    distanceKm,
    durationMin: estimateDurationMin(distanceKm),
    geometry: [from, to],
    source: 'fallback',
    steps: [],
  };
}

/** Formate une distance d'étape : « 120 m » sous 1 km, « 1,2 km » au-delà. */
export function formatStepDistance(distanceKm: number): string {
  if (distanceKm < 1) return `${Math.max(10, Math.round(distanceKm * 1000 / 10) * 10)} m`;
  return `${distanceKm.toFixed(1).replace('.', ',')} km`;
}

type OsrmStep = {
  maneuver?: { type?: string; modifier?: string };
  name?: string;
  distance?: number;
  duration?: number;
};

/** Une manœuvre OSRM → une instruction en français, courte et
 *  lisible en conduisant. `isLast` : la dernière étape est l'arrivée. */
function stepInstruction(step: OsrmStep, isLast: boolean): string {
  const name = (step.name ?? '').trim();
  const on = name ? ` sur ${name}` : '';
  const type = step.maneuver?.type ?? '';
  const mod = step.maneuver?.modifier ?? '';
  if (isLast || type === 'arrive') return `Tu es arrivé${on ? ` — ${name}` : ''}`;
  switch (type) {
    case 'depart':
      return `Prends la direction${on}`;
    case 'turn':
      if (mod === 'left' || mod === 'sharp left') return `Tourne à gauche${on}`;
      if (mod === 'right' || mod === 'sharp right') return `Tourne à droite${on}`;
      if (mod === 'slight left') return `Reste à gauche${on}`;
      if (mod === 'slight right') return `Reste à droite${on}`;
      if (mod === 'uturn') return `Fais demi-tour${on}`;
      return `Tourne${on}`;
    case 'new name':
      return `Continue${on}`;
    case 'continue':
    case 'straight':
      return `Continue tout droit${on}`;
    case 'merge':
      return `Rejoins${name ? ` ${name}` : ' la route'}`;
    case 'on ramp':
      return `Prends la bretelle${on}`;
    case 'off ramp':
      return `Prends la sortie${on}`;
    case 'fork':
      return mod === 'left' ? `À l'embranchement, reste à gauche${on}` : `À l'embranchement, reste à droite${on}`;
    case 'end of road':
      return `Au bout de la route, tourne${mod === 'left' ? ' à gauche' : mod === 'right' ? ' à droite' : ''}${on}`;
    case 'roundabout':
    case 'rotary':
      return `Au rond-point, continue${on}`;
    case 'exit roundabout':
    case 'exit rotary':
      return `Sors du rond-point${on}`;
    default:
      return `Continue${on}`;
  }
}

/** Manœuvres OSRM brutes → étapes en français. On garde les étapes
 *  de plus de 20 m (ou l'arrivée) ; au maximum 25 étapes — un trajet
 *  urbain tient largement dedans, et la liste reste lisible. */
export function parseOsrmSteps(rawSteps: OsrmStep[] | undefined): RouteStep[] {
  if (!rawSteps || rawSteps.length === 0) return [];
  const steps: RouteStep[] = [];
  rawSteps.forEach((s, i) => {
    const distanceKm = typeof s.distance === 'number' ? s.distance / 1000 : 0;
    const isLast = i === rawSteps.length - 1;
    if (!isLast && distanceKm < 0.02) return;
    steps.push({
      instruction: stepInstruction(s, isLast),
      distanceKm,
      durationMin: Math.max(0, Math.round((s.duration ?? 0) / 60)),
    });
  });
  return steps.slice(0, 25);
}

/** Allège une géométrie en gardant les extrémités (un point sur N). */
function thinGeometry(points: RoutePoint[]): RoutePoint[] {
  if (points.length <= ROUTE_MAX_POINTS) return points;
  const step = Math.ceil(points.length / ROUTE_MAX_POINTS);
  const kept = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

/** Appel direct à OSRM (côté serveur uniquement — la route API
 *  `/api/route` est le point d'entrée public). En cas d'échec
 *  quelconque (réseau, HTTP ≠ 200, réponse inattendue), repli ligne
 *  droite — jamais d'exception propagée. */
export async function fetchRoadRoute(
  from: RoutePoint,
  to: RoutePoint,
  opts: { baseUrl?: string; timeoutMs?: number } = {}
): Promise<RoadRoute> {
  const fallback = straightLineRoute(from, to);
  const baseUrl = (opts.baseUrl ?? process.env.OSRM_BASE_URL ?? OSRM_DEMO_BASE_URL).replace(
    /\/$/,
    ''
  );
  try {
    const url =
      `${baseUrl}/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}` +
      `?overview=full&geometries=geojson&steps=true`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    let res: Response;
    try {
      res = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      code?: string;
      routes?: {
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: [number, number][] };
        legs?: { steps?: OsrmStep[] }[];
      }[];
    };
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) return fallback;
    const route = data.routes[0];
    const coords = route.geometry?.coordinates ?? [];
    if (
      typeof route.distance !== 'number' ||
      typeof route.duration !== 'number' ||
      coords.length < 2
    ) {
      return fallback;
    }
    return {
      distanceKm: route.distance / 1000,
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      geometry: thinGeometry(coords.map(([lng, lat]) => ({ lat, lng }))),
      source: 'osrm',
      steps: parseOsrmSteps(route.legs?.[0]?.steps),
    };
  } catch {
    return fallback;
  }
}

/** Appel côté client via la route API `/api/route` (proxy + cache
 *  5 min). Retourne `null` si la route API est injoignable : l'appelant
 *  garde alors la ligne droite et la durée estimée. */
export async function fetchRoadRouteViaApi(
  from: RoutePoint,
  to: RoutePoint,
  signal?: AbortSignal
): Promise<RoadRoute | null> {
  try {
    const params = new URLSearchParams({
      fromLat: String(from.lat),
      fromLng: String(from.lng),
      toLat: String(to.lat),
      toLng: String(to.lng),
    });
    const res = await fetch(`/api/route?${params.toString()}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok?: boolean; route?: RoadRoute };
    if (!data?.ok || !data.route || !Array.isArray(data.route.geometry)) return null;
    return data.route;
  } catch {
    return null;
  }
}
