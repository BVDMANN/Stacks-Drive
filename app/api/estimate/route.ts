import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { NEIGHBORHOODS, type Neighborhood } from '@/lib/neighborhoods';
import { estimateTripServer, type ServerEstimate } from '@/lib/estimate-server';
import { ROUTE_CACHE_TTL_MS } from '@/lib/routing';

/** POST /api/estimate — estimation d'un trajet, calculée CÔTÉ
 *  SERVEUR (v2.50, ADR 0025).
 *
 *  Le client ne calcule PLUS jamais un prix seul : il envoie les
 *  deux points exacts (épingle déplacée ou centre de quartier) et
 *  les deux quartiers, et le serveur renvoie les deux estimations
 *  (Solo / Groupe) + la route (géométrie OSRM pour la carte).
 *
 *  Distance = DISTANCE ROUTIÈRE OSRM entre les points exacts.
 *  Modèle au km inchangé (Solo 500 + 210/km, Groupe 300 + 135/km,
 *  planchers 550/400, suppléments aéroport 800/300 et piste 800).
 *  Ancre Centre-ville ↔ Nzeng-Ayong = Solo 1 500 / Groupe 950,
 *  valeur FIXE, dans les deux sens.
 *
 *  REPLI (OSRM indisponible) : distance à vol d'oiseau entre les
 *  points exacts, et la réponse est marquée `approximate: true`
 *  (l'interface affiche « Estimation approximative »). Jamais de
 *  prix inventé, jamais d'erreur : la route répond toujours 200
 *  avec une estimation (approximative au pire).
 *
 *  Cache serveur 5 min par trajet (mêmes coordonnées arrondies +
 *  quartiers + options) — l'espacement OSRM (1,1 s) est centralisé
 *  dans `fetchRoadRoute` (`lib/routing.ts`).
 *
 *  Corps : { fromLat, fromLng, toLat, toLng, fromNeighborhood,
 *  toNeighborhood, unpavedRoad?, vehiclePreference? }.
 *  Réponse : { ok: true, solo, groupe, route, approximate, cached }.
 */

const BodySchema = z.object({
  fromLat: z.number().min(-90).max(90),
  fromLng: z.number().min(-180).max(180),
  toLat: z.number().min(-90).max(90),
  toLng: z.number().min(-180).max(180),
  fromNeighborhood: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]),
  toNeighborhood: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]),
  unpavedRoad: z.boolean().optional().default(false),
  vehiclePreference: z.enum(['voiture', 'moto', 'tous']).optional().default('tous'),
});

const cache = new Map<string, { at: number; estimate: ServerEstimate }>();

function cacheKey(body: z.infer<typeof BodySchema>): string {
  const r = (n: number) => n.toFixed(4);
  return [
    r(body.fromLat),
    r(body.fromLng),
    r(body.toLat),
    r(body.toLng),
    body.fromNeighborhood,
    body.toNeighborhood,
    body.unpavedRoad ? 'unpaved' : 'paved',
    body.vehiclePreference,
  ].join('|');
}

export async function POST(request: NextRequest) {
  const json = (await request.json().catch(() => null)) as unknown;
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Trajet invalide.' },
      { status: 400 }
    );
  }
  const body = parsed.data;
  const key = cacheKey(body);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < ROUTE_CACHE_TTL_MS) {
    return NextResponse.json({ ok: true, ...cached.estimate, cached: true });
  }
  const estimate = await estimateTripServer({
    from: { lat: body.fromLat, lng: body.fromLng },
    to: { lat: body.toLat, lng: body.toLng },
    fromNeighborhood: body.fromNeighborhood,
    toNeighborhood: body.toNeighborhood,
    unpavedRoad: body.unpavedRoad,
    vehiclePreference: body.vehiclePreference,
  });
  cache.set(key, { at: Date.now(), estimate });
  return NextResponse.json({ ok: true, ...estimate, cached: false });
}
