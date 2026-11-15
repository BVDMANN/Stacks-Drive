import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  NEIGHBORHOODS,
  PAYMENT_METHODS,
  dropOffPointFor,
  isDifficultAccess,
  type Neighborhood,
} from '@/lib/neighborhoods';
import { estimateTripServer, neighborhoodPoint } from '@/lib/estimate-server';
import { isInServiceArea } from '@/lib/geo';
import { getDriverOwed } from '@/lib/earnings';
import { DEBT_CAP_FCFA } from '@/lib/gamification';
import { logAudit } from '@/lib/audit';
import { getIncomingRequests, getPassengerRatings } from '@/lib/rides';
import { mapRideRow, type ProfileRow } from '@/lib/db-types';

/** Point exact (v2.47 — épingle / lieu / GPS) : coordonnées +
 *  adresse résolue + quartier de rattachement. Le quartier doit être
 *  celui du trajet (vérifié par un refine ci-dessous) : le point
 *  affine le départ/l'arrivée à l'intérieur du quartier, il ne
 *  change pas de quartier. */
const TripPointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(200).nullable(),
  neighborhood: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]),
});

const RequestSchema = z
  .object({
    pickup: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]),
    destination: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]),
    rideType: z.enum(['solo', 'groupe']),
    /** Classe Confort (v2.34) : clim garantie, chauffeurs 4,5★ et
     *  plus — une Solo au tarif Solo, éligibilité vérifiée côté
     *  serveur au matching. */
    comfort: z.boolean().default(false),
    /** Chauffeur favori prioritaire (v2.34) : la demande lui est
     *  réservée 30 s avant de s'ouvrir aux autres chauffeurs. */
    favoriteDriverId: z.string().uuid().optional().nullable(),
    vehiclePreference: z.enum(['voiture', 'moto', 'tous']).default('tous'),
    seats: z.number().int().min(1).max(4).default(1),
    paymentMethod: z.enum(PAYMENT_METHODS).default('especes'),
    /** Route non bitumée (v2.6) : le passager demande la continuité
     *  jusqu'à un quartier à accès difficile (+ supplément). */
    unpavedRoad: z.boolean().default(false),
    /** Prix proposé directement par le passager (v2.11, optionnel) :
     *  visible par les chauffeurs, qui peuvent l'accepter en proposant
     *  ce prix ou contre-proposer. Le prix final se décide entre les
     *  deux parties — l'estimation affichée avant la course n'est
     *  qu'indicative. */
    offeredPrice: z
      .number()
      .int()
      .min(400, 'Ton prix doit être entre 400 et 50 000 FCFA.')
      .max(50000, 'Ton prix doit être entre 400 et 50 000 FCFA.')
      .optional()
      .nullable(),
    /** Course planifiée (v2.30, optionnel) : heure prévue (ISO).
     *  Au moins 30 min dans le futur, au plus 7 jours. Sans elle, la
     *  demande part tout de suite comme avant. */
    scheduledAt: z.string().datetime({ offset: true }).optional().nullable(),
    /** Points exacts (v2.47, optionnels) : départ et destination
     *  précis (épingle / lieu / GPS). Sans eux, l'estimation et la
     *  course utilisent les centres de quartiers (ancien client). */
    pickupPoint: TripPointSchema.optional().nullable(),
    destinationPoint: TripPointSchema.optional().nullable(),
  })
  .refine((v) => v.pickup !== v.destination, {
    message: 'Le départ et la destination doivent être différents.',
  })
  .refine((v) => !v.unpavedRoad || isDifficultAccess(v.destination), {
    message: 'La route non bitumée ne concerne que les quartiers à accès difficile.',
  })
  .refine((v) => v.seats === 1, {
    message: 'Groupe : 1 place. Solo : le véhicule est entièrement libre — pas de nombre de passagers.',
  })
  .refine((v) => !(v.rideType === 'groupe' && v.vehiclePreference === 'moto'), {
    message: 'La moto ne prend qu’un passager : choisis Solo pour la moto.',
  })
  .refine((v) => !(v.comfort && v.rideType === 'groupe'), {
    message: 'Confort est une course Solo (véhicule entier) : choisis Solo avec l’option Confort.',
  })
  .refine((v) => !(v.comfort && v.vehiclePreference === 'moto'), {
    message: 'Confort exige une voiture climatisée : la moto n’est pas éligible.',
  })
  .refine((v) => !v.pickupPoint || v.pickupPoint.neighborhood === v.pickup, {
    message: 'Le point de départ ne correspond pas au quartier choisi.',
  })
  .refine((v) => !v.destinationPoint || v.destinationPoint.neighborhood === v.destination, {
    message: 'Le point de destination ne correspond pas au quartier choisi.',
  });

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Connecte-toi pour continuer.', status: 401 as const };
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'role, full_name, phone, is_verified, is_online, is_admin, current_area, last_lat, last_lng'
    )
    .eq('id', user.id)
    .single();
  return { supabase, user, profile: profile as ProfileRow | null };
}

/** POST /api/rides — le PASSAGER envoie une demande de course.
 *  L'estimation indicative est calculée côté serveur (jamais depuis
 *  le client) et affichée comme un repère — ce n'est PAS le prix de
 *  la course. Le prix final est convenu entre le passager (qui peut
 *  proposer son prix à la demande) et le chauffeur, puis figé à
 *  l'acceptation de la proposition. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase n’est pas configuré sur ce déploiement.' },
      { status: 503 }
    );
  }
  const auth = await requireUser();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user, profile } = auth;
  // v2.45 — compte admin = admin uniquement : l'admin ne commande
  // pas de course (il n'est pas passager). Rejet serveur, avant le
  // contrôle de rôle — le rôle en base de l'admin est « passager ».
  if (profile?.is_admin === true) {
    return NextResponse.json(
      {
        error: 'Le compte administrateur ne commande pas de courses : utilise un compte passager.',
        code: 'admin_not_allowed',
      },
      { status: 403 }
    );
  }
  if (profile?.role !== 'passager') {
    return NextResponse.json(
      { error: 'Bascule en mode Passager pour commander une course.' },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;
  // Course planifiée (v2.30) : au moins 30 min dans le futur (le
  // temps de trouver un chauffeur), au plus 7 jours. La demande ne
  // part aux chauffeurs que ~15 min avant l'heure prévue (dispatch
  // au sondage des demandes entrantes, voir lib/rides.ts).
  let scheduledAt: Date | null = null;
  if (v.scheduledAt) {
    scheduledAt = new Date(v.scheduledAt);
    const min = Date.now() + 30 * 60 * 1000;
    const max = Date.now() + 7 * 24 * 60 * 60 * 1000;
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < min) {
      return NextResponse.json(
        { error: 'Choisis une heure au moins 30 minutes dans le futur.' },
        { status: 400 }
      );
    }
    if (scheduledAt.getTime() > max) {
      return NextResponse.json(
        { error: 'On ne planifie pas plus de 7 jours à l’avance.' },
        { status: 400 }
      );
    }
  }
  // Points exacts (v2.47) : le point doit être dans la zone de
  // service — sinon, message clair + pas de demande créée (le client
  // revient au dernier point valide, sans bloquer).
  for (const [point, label] of [
    [v.pickupPoint, 'départ'],
    [v.destinationPoint, 'destination'],
  ] as const) {
    if (point && !isInServiceArea(point.lat, point.lng)) {
      return NextResponse.json(
        {
          error: `Le point de ${label} est hors zone — Stacks Drive est à Libreville pour l’instant. Choisis un point dans la zone, ou un quartier dans la liste.`,
        },
        { status: 400 }
      );
    }
  }
  // Estimation indicative (v2.11) : un repère pour le passager et les
  // chauffeurs, jamais un prix. Le prix final se décide entre eux.
  // Confort (v2.34) : même estimation que Solo — aucune différence
  // de prix décidée.
  // v2.50 (ADR 0025) : distance ROUTIÈRE OSRM entre les points exacts
  // (ou les centres de quartiers si pas d'épingle) — calculée côté
  // serveur par le même estimateur que `/api/estimate`, donc le même
  // trajet donne le même prix côté client et côté serveur. Repli
  // OSRM indisponible : vol d'oiseau, estimation marquée approximative.
  const serverEstimate = await estimateTripServer({
    from: v.pickupPoint
      ? { lat: v.pickupPoint.lat, lng: v.pickupPoint.lng }
      : neighborhoodPoint(v.pickup),
    to: v.destinationPoint
      ? { lat: v.destinationPoint.lat, lng: v.destinationPoint.lng }
      : neighborhoodPoint(v.destination),
    fromNeighborhood: v.pickup,
    toNeighborhood: v.destination,
    unpavedRoad: v.unpavedRoad,
    vehiclePreference: v.vehiclePreference,
  });
  const estimate = v.rideType === 'solo' ? serverEstimate.solo : serverEstimate.groupe;
  // Chauffeur favori (v2.34) : il doit vraiment être un favori du
  // passager, sinon la priorité est ignorée (jamais d'erreur bloquante).
  let preferredDriverId: string | null = null;
  let preferredUntil: string | null = null;
  if (v.favoriteDriverId) {
    const { data: fav } = await supabase
      .from('favorite_drivers')
      .select('driver_id')
      .eq('passenger_id', user.id)
      .eq('driver_id', v.favoriteDriverId)
      .single();
    if (fav) {
      preferredDriverId = v.favoriteDriverId;
      preferredUntil = new Date(Date.now() + 30 * 1000).toISOString();
    }
  }
  // Point de dépôt (v2.6) : si la destination est à accès difficile, la
  // course s'arrête par défaut là — sauf si le chauffeur accepte la
  // piste (choix figé à l'acceptation).
  const dropOff = isDifficultAccess(v.destination) ? dropOffPointFor(v.destination) : null;

  const insertPayload: Record<string, unknown> = {
    passenger_id: user.id,
    pickup: v.pickup,
    destination: v.destination,
    ride_type: v.rideType,
    vehicle_preference: v.vehiclePreference,
    seats: v.seats,
    estimated_price: estimate.price,
    // Distance et durée routières du trajet (v2.50) : celles de
    // l'estimation serveur (OSRM, ou repli vol d'oiseau) — le
    // chauffeur et le suivi affichent les mêmes chiffres.
    distance_km: serverEstimate.route.distanceKm,
    duration_min: serverEstimate.route.durationMin,
    passenger_offered_price: v.offeredPrice ?? null,
    payment_method: v.paymentMethod,
    message: '',
    status: scheduledAt ? 'planifiee' : 'recherche',
    scheduled_at: scheduledAt ? scheduledAt.toISOString() : null,
    unpaved_requested: v.unpavedRoad,
    drop_off_point: dropOff,
    comfort: v.comfort,
    preferred_driver_id: preferredDriverId,
    preferred_until: preferredUntil,
    // Points exacts (v2.47) : persistés pour le chauffeur (adresse
    // précise sur sa fiche course + navigation OSRM dessus) et pour
    // le suivi. Nulls = centre de quartier.
    pickup_lat: v.pickupPoint?.lat ?? null,
    pickup_lng: v.pickupPoint?.lng ?? null,
    pickup_address: v.pickupPoint?.address ?? null,
    destination_lat: v.destinationPoint?.lat ?? null,
    destination_lng: v.destinationPoint?.lng ?? null,
    destination_address: v.destinationPoint?.address ?? null,
  };
  let { data: ride, error } = await supabase
    .from('rides')
    .insert(insertPayload)
    .select('id')
    .single();

  // Migration v2.30 pas encore appliquée : une course planifiée ne
  // peut pas être enregistrée (la colonne manque) — erreur explicite,
  // jamais une demande immédiate silencieuse à la place.
  if (error && error.code === '42703' && scheduledAt) {
    return NextResponse.json(
      {
        error:
          'Les courses planifiées ne sont pas encore activées sur ce déploiement (migration v2.30 à appliquer). Commande une course immédiate.',
      },
      { status: 503 }
    );
  }

  // Migration v2.6 / v2.10 pas encore appliquée : on crée la demande
  // sans les champs concernés (le prix proposé par le passager, lui,
  // est simplement perdu — la demande reste valable, le passager
  // attend les propositions des chauffeurs).
  if (error && error.code === '42703') {
    // Course planifiée sans la migration v2.30 : on ne dégrade pas
    // en demande immédiate — erreur explicite (voir ci-dessus).
    if (scheduledAt) {
      return NextResponse.json(
        {
          error:
            'Les courses planifiées ne sont pas encore activées sur ce déploiement (migration v2.30 à appliquer). Commande une course immédiate.',
        },
        { status: 503 }
      );
    }
    delete insertPayload.unpaved_requested;
    delete insertPayload.drop_off_point;
    delete insertPayload.passenger_offered_price;
    delete insertPayload.comfort;
    delete insertPayload.preferred_driver_id;
    delete insertPayload.preferred_until;
    // Migration v2.47 pas encore appliquée : la demande part sans les
    // points exacts (centres de quartiers) — l'estimation affichée
    // reste celle calculée sur les points, le trajet reste valable.
    delete insertPayload.pickup_lat;
    delete insertPayload.pickup_lng;
    delete insertPayload.pickup_address;
    delete insertPayload.destination_lat;
    delete insertPayload.destination_lng;
    delete insertPayload.destination_address;
    // Migration v2.50 pas encore appliquée : la demande part sans la
    // distance et la durée routières (l'estimation affichée reste
    // celle calculée sur la route, le trajet reste valable).
    delete insertPayload.distance_km;
    delete insertPayload.duration_min;
    ({ data: ride, error } = await supabase
      .from('rides')
      .insert(insertPayload)
      .select('id')
      .single());
  }

  if (error || !ride) {
    console.error('[api/rides]', error?.code, error?.message);
    return NextResponse.json(
      { error: 'Demande impossible pour le moment. Réessaie.' },
      { status: 500 }
    );
  }
  await logAudit(supabase, 'fare_computed', {
    actorId: user.id,
    rideId: ride.id,
    pickup: v.pickup,
    destination: v.destination,
    rideType: v.rideType,
    estimatedPrice: estimate.price,
    distanceKm: serverEstimate.route.distanceKm,
    durationMin: serverEstimate.route.durationMin,
    approximate: serverEstimate.approximate,
    distanceSource: serverEstimate.route.source,
    offeredPrice: v.offeredPrice ?? null,
    unpavedRequested: v.unpavedRoad,
    dropOffPoint: dropOff,
  });
  return NextResponse.json(
    {
      ok: true,
      rideId: ride.id,
      estimatedPrice: estimate.price,
      approximate: serverEstimate.approximate,
      scheduled: scheduledAt !== null,
      comfort: v.comfort,
      preferredDriverId,
    },
    { status: 201 }
  );
}

/** GET /api/rides?scope=mine|incoming|active
 *  - mine : mes demandes (passager).
 *  - incoming : demandes entrantes pour un chauffeur en ligne et vérifié.
 *  - active : mes courses en cours (passager ou chauffeur). */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const auth = await requireUser();
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user, profile } = auth;
  const scope = new URL(request.url).searchParams.get('scope') ?? 'mine';

  if (scope === 'incoming') {
    // v2.45 — l'admin ne reçoit jamais de proposition : il n'est
    // pas chauffeur (le contrôle de rôle ci-dessous le bloquerait
    // déjà, l'admin étant « passager » en base — ce rejet explicite
    // verrouille le cas où le rôle venait à changer).
    if (profile?.is_admin === true) {
      return NextResponse.json(
        {
          error: 'Le compte administrateur ne reçoit pas de demandes : il n’est pas chauffeur.',
          code: 'admin_not_allowed',
        },
        { status: 403 }
      );
    }
    if (profile?.role !== 'chauffeur') {
      return NextResponse.json(
        { error: 'Seuls les chauffeurs reçoivent des demandes.' },
        { status: 403 }
      );
    }
    if (!profile.is_verified) {
      return NextResponse.json(
        { error: 'Fais vérifier ton compte (selfie + pièce d’identité) pour recevoir des demandes.' },
        { status: 403 }
      );
    }
    if (!profile.is_online) {
      return NextResponse.json({ ok: true, rides: [] });
    }
    // Plafond de dette (v2.2) : au-delà de ~5 000 FCFA de commissions
    // non réglées, le chauffeur ne voit plus les nouvelles demandes.
    const owed = await getDriverOwed(user.id);
    if (owed >= DEBT_CAP_FCFA) {
      return NextResponse.json({
        ok: true,
        rides: [],
        debtBlocked: true,
        debtAmount: owed,
        debtCap: DEBT_CAP_FCFA,
      });
    }
    const rides = await getIncomingRequests({
      id: user.id,
      currentArea: (profile.current_area as Neighborhood | null) ?? null,
      lat: profile.last_lat,
      lng: profile.last_lng,
    });
    // Joindre le passager (nom + téléphone) pour la pop-up chauffeur.
    const passengerIds = [...new Set(rides.map((r) => r.passengerId).filter(Boolean))] as string[];
    const passengers = new Map<string, { name: string | null; phone: string | null }>();
    if (passengerIds.length > 0) {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .in('id', passengerIds);
      (data ?? []).forEach((p: { id: string; full_name: string | null; phone: string | null }) =>
        passengers.set(p.id, { name: p.full_name, phone: p.phone })
      );
    }
    // Note du passager (v2.30) : moyenne des notes données par les
    // chauffeurs après ses courses terminées — le chauffeur la voit
    // dans la demande entrante pour décider d'accepter. Absente =
    // nouveau passager (jamais 0 inventé).
    const passengerRatings = await getPassengerRatings(passengerIds);
    return NextResponse.json({
      ok: true,
      rides: rides.map((r) => ({
        ride: r,
        passenger: r.passengerId ? passengers.get(r.passengerId) ?? null : null,
        passengerRating: r.passengerId
          ? (passengerRatings.get(r.passengerId) ?? null)
          : null,
      })),
    });
  }

  if (scope === 'active') {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .or(`passenger_id.eq.${user.id},driver_id.eq.${user.id}`)
      .in('status', ['recherche', 'propositions', 'acceptee', 'en_cours'])
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[api/rides]', error.message);
      return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, rides: (data ?? []).map(mapRideRow) });
  }

  // scope=driver : courses assignées au chauffeur (historique + gains).
  // On joint le nom du passager et les gains de chaque course
  // (driver_earnings quand disponible, sinon montants figés de la course).
  if (scope === 'driver') {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .eq('driver_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      console.error('[api/rides]', error.message);
      return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
    }
    const rides = (data ?? []).map(mapRideRow);
    const passengerIds = [...new Set(rides.map((r) => r.passengerId).filter(Boolean))] as string[];
    const passengers: Record<string, string> = {};
    if (passengerIds.length > 0) {
      const { data: ps } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', passengerIds);
      (ps ?? []).forEach((p: { id: string; full_name: string | null }) => {
        passengers[p.id] = p.full_name ?? 'Passager';
      });
    }
    const earnings: Record<string, { fare: number; commission: number; kept: number }> = {};
    const rideIds = rides.map((r) => r.id);
    if (rideIds.length > 0) {
      const { data: earn, error: earnError } = await supabase
        .from('driver_earnings')
        .select('ride_id, fare_amount, commission_amount, driver_kept_amount')
        .in('ride_id', rideIds);
      if (!earnError && earn) {
        (earn as { ride_id: string; fare_amount: number; commission_amount: number; driver_kept_amount: number }[]).forEach(
          (e) => {
            earnings[e.ride_id] = {
              fare: e.fare_amount,
              commission: e.commission_amount,
              kept: e.driver_kept_amount,
            };
          }
        );
      }
      // Repli : montants figés dans la course (migration v2.2 non appliquée).
      rides.forEach((r) => {
        if (!earnings[r.id]) {
          earnings[r.id] = {
            fare: r.proposedPrice ?? r.estimatedPrice,
            commission: r.platformFee,
            kept: r.driverShare,
          };
        }
      });
    }
    return NextResponse.json({ ok: true, rides, passengers, earnings });
  }

  // scope=mine (défaut) : historique du passager.
  const { data, error } = await supabase
    .from('rides')
    .select('*')
    .eq('passenger_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) {
    console.error('[api/rides]', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rides: (data ?? []).map(mapRideRow) });
}
