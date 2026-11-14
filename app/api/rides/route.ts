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
import { estimateFare } from '@/lib/pricing';
import { getDriverOwed } from '@/lib/earnings';
import { DEBT_CAP_FCFA } from '@/lib/gamification';
import { logAudit } from '@/lib/audit';
import { getIncomingRequests } from '@/lib/rides';
import { mapRideRow, type ProfileRow } from '@/lib/db-types';

const RequestSchema = z
  .object({
    pickup: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]),
    destination: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]),
    rideType: z.enum(['solo', 'groupe']),
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
  })
  .refine((v) => v.pickup !== v.destination, {
    message: 'Le départ et la destination doivent être différents.',
  })
  .refine((v) => !v.unpavedRoad || isDifficultAccess(v.destination), {
    message: 'La route non bitumée ne concerne que les quartiers à accès difficile.',
  })
  .refine((v) => (v.rideType === 'solo' ? v.seats === 1 : true), {
    message: 'Une course Solo ne prend qu’un seul passager.',
  })
  .refine((v) => !(v.rideType === 'groupe' && v.vehiclePreference === 'moto'), {
    message: 'La moto ne prend qu’un passager : choisis Solo pour la moto.',
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
      'role, full_name, phone, is_verified, is_online, current_area, last_lat, last_lng'
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
  // Estimation indicative (v2.11) : un repère pour le passager et les
  // chauffeurs, jamais un prix. Le prix final se décide entre eux.
  const estimate = estimateFare(v.pickup, v.destination, v.rideType, v.vehiclePreference, {
    unpavedRoad: v.unpavedRoad,
  });
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
    passenger_offered_price: v.offeredPrice ?? null,
    payment_method: v.paymentMethod,
    message: '',
    status: 'recherche',
    unpaved_requested: v.unpavedRoad,
    drop_off_point: dropOff,
  };
  let { data: ride, error } = await supabase
    .from('rides')
    .insert(insertPayload)
    .select('id')
    .single();

  // Migration v2.6 / v2.10 pas encore appliquée : on crée la demande
  // sans les champs concernés (le prix proposé par le passager, lui,
  // est simplement perdu — la demande reste valable, le passager
  // attend les propositions des chauffeurs).
  if (error && error.code === '42703') {
    delete insertPayload.unpaved_requested;
    delete insertPayload.drop_off_point;
    delete insertPayload.passenger_offered_price;
    ({ data: ride, error } = await supabase
      .from('rides')
      .insert(insertPayload)
      .select('id')
      .single());
  }

  if (error || !ride) {
    console.error('[api/rides]', error?.message);
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
    offeredPrice: v.offeredPrice ?? null,
    unpavedRequested: v.unpavedRoad,
    dropOffPoint: dropOff,
  });
  return NextResponse.json(
    { ok: true, rideId: ride.id, estimatedPrice: estimate.price },
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
    return NextResponse.json({
      ok: true,
      rides: rides.map((r) => ({
        ride: r,
        passenger: r.passengerId ? passengers.get(r.passengerId) ?? null : null,
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
