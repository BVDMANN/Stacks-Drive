import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getRideRequestById } from '@/lib/rides';
import { mapDriverProfile, stripDriverPhone } from '@/lib/db-types';
import { getDriverEarningsSummary } from '@/lib/earnings';
import { releaseSeat } from '@/lib/seats';
import { formatFcfa } from '@/lib/commission';
import { logAudit } from '@/lib/audit';
import {
  CANCEL_REASON_CODES,
  cancelReasonLabel,
  cancelReasonText,
  recordCancellation,
  type CancelReasonCode,
  type CancelRole,
} from '@/lib/cancellations';
import { getTrustedContacts } from '@/lib/trusted-contacts';
import { notifyAdminAlert, reportApiFailure } from '@/lib/admin-alerts';
import { checkCancellationFraud, checkPinFraud, checkSpeedFraud } from '@/lib/fraud';
import { sendTrustedShareEmail } from '@/lib/email';
// v2.55 — paiement par carte : empreinte avant démarrage, capture
// à la clôture, annulation de l'empreinte à l'annulation.
import { captureCardRide, getCardPaymentForRide, voidCardHold } from '@/lib/card-ledger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://stacks-drive.vercel.app';

type Ctx = { params: Promise<{ id: string }> };

const ActionSchema = z.object({
  action: z.enum(['cancel', 'start', 'complete', 'rate', 'relaunch']),
  rating: z.number().int().min(1).max(5).optional(),
  /** Motif d'annulation (v2.23) : liste courte, selon le rôle.
   *  Absent = anciennes versions du client → « autre ». */
  reasonCode: z.enum(CANCEL_REASON_CODES as [CancelReasonCode, ...CancelReasonCode[]]).optional(),
  /** Précision libre sur l'annulation (max 200 caractères). */
  reason: z.string().trim().max(200).optional(),
  /** Code PIN à 4 chiffres donné par le passager (démarrage, v2.2). */
  pin: z.string().regex(/^[0-9]{4}$/).optional(),
});

/** Partage automatique du suivi au départ de la course (v2.23) :
 *  le lien de suivi est envoyé par e-mail aux contacts de confiance
 *  du passager qui ont une adresse (les autres sont joints en 1 tap
 *  WhatsApp / SMS depuis l'écran de course — aucun fournisseur SMS
 *  n'est branché à la plateforme). Ne bloque jamais le démarrage :
 *  toute erreur est avalée, l'envoi est tracé dans l'audit. */
async function autoShareWithTrustedContacts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rideId: string
): Promise<void> {
  try {
    const { data: ride } = await supabase
      .from('rides')
      .select('passenger_id, driver_id, pickup, destination, proposed_price, estimated_price, loyalty_free, share_token')
      .eq('id', rideId)
      .single();
    if (!ride?.passenger_id || !ride.share_token) return;
    const contacts = await getTrustedContacts(supabase, ride.passenger_id as string);
    if (contacts.length === 0) return;
    const [{ data: passenger }, { data: driver }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', ride.passenger_id).single(),
      ride.driver_id
        ? supabase.from('profiles').select('full_name, plate').eq('id', ride.driver_id).single()
        : Promise.resolve({ data: null }),
    ]);
    const shareUrl = `${APP_URL}/suivi/${ride.share_token}`;
    const priceLabel = ride.loyalty_free
      ? '0 FCFA — 10e course offerte'
      : formatFcfa((ride.proposed_price as number | null) ?? (ride.estimated_price as number));
    let emailed = 0;
    for (const contact of contacts) {
      if (!contact.email) continue;
      const ok = await sendTrustedShareEmail({
        to: contact.email,
        contactName: contact.name,
        passengerName: (passenger as { full_name?: string | null } | null)?.full_name ?? null,
        pickup: ride.pickup as string,
        destination: ride.destination as string,
        driverName: (driver as { full_name?: string | null } | null)?.full_name ?? null,
        plate: (driver as { plate?: string | null } | null)?.plate ?? null,
        priceLabel,
        shareUrl,
      });
      if (ok) emailed += 1;
    }
    await logAudit(supabase, 'trusted_share_sent', {
      actorId: ride.passenger_id as string,
      rideId,
      contactsTotal: contacts.length,
      emailed,
      whatsappSmsTap: contacts.length - emailed,
    });
  } catch (err) {
    console.error('[api/rides/[id]] auto-share contacts:', err);
  }
}

/** GET /api/rides/[id] — demande + chauffeur assigné (avec sa note). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }
  const found = await getRideRequestById(id, user.id);
  if (!found) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  const { ride, row } = found;
  // Note du passager (v2.30) : le chauffeur la voit sur la carte de
  // course pour décider — même source que les demandes entrantes.
  if (row.passenger_id) {
    const { getPassengerRating } = await import('@/lib/rides');
    ride.passengerRating = await getPassengerRating(row.passenger_id);
  }
  let driver: import('@/types').DriverProfile | null = null;
  if (row.driver) {
    // v2.20 : jamais de téléphone chauffeur côté passager — la
    // communication passe par la messagerie in-app. (Le chauffeur
    // qui consulte sa propre course voit sa propre fiche sans
    // téléphone non plus : il n'en a pas besoin, c'est la sienne.)
    const d = stripDriverPhone(mapDriverProfile(row.driver));
    if (d) {
      // Note moyenne du chauffeur.
      const { data: rated } = await supabase
        .from('rides')
        .select('rating_driver')
        .eq('driver_id', row.driver.id)
        .eq('status', 'terminee')
        .not('rating_driver', 'is', null);
      const ratings = (rated ?? []).map((r: { rating_driver: number | null }) => r.rating_driver ?? 0);
      if (ratings.length > 0) {
        d.rating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
        d.trips = ratings.length;
      }
      driver = d;
    }
  }
  // v2.55 — statut du paiement carte (empreinte / encaissement),
  // pour que le passager voie où en est son paiement et que le
  // chauffeur sache si la course peut démarrer.
  const cardPayment = await getCardPaymentForRide(id);
  return NextResponse.json({
    ok: true,
    ride,
    driver,
    cardPayment: cardPayment
      ? {
          status: cardPayment.status,
          fareFcfa: cardPayment.fare_fcfa,
          feesFcfa: cardPayment.fees_fcfa,
          chargedFcfa: cardPayment.charged_fcfa,
        }
      : null,
  });
}

/** Données de la popup de célébration après une course terminée
 *  (v2.2, points en v2.3) : montant gardé en gros, % gardé, Course
 *  Double (points doublés), progression de la quête du jour, points
 *  gagnés, série, niveau. Les chiffres viennent de la base
 *  (driver_earnings + résumé), jamais du client. */
async function buildCelebration(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rideId: string,
  driverId: string,
  finalized?: unknown
) {
  const { data: ride } = await supabase
    .from('rides')
    .select('proposed_price, estimated_price, platform_fee, driver_share, loyalty_free, is_double_ride')
    .eq('id', rideId)
    .single();
  const fare = ride?.proposed_price ?? ride?.estimated_price ?? 0;
  const kept = ride?.driver_share ?? 0;
  const commission = ride?.platform_fee ?? 0;
  const ratePct = fare > 0 ? Math.round(((fare - kept) / fare) * 100) : 0;
  const fin = (finalized ?? {}) as {
    quest_points?: number;
    points_earned?: number;
    tier?: string;
    streak?: number;
    completed_count?: number;
  };
  let summary = null;
  try {
    summary = await getDriverEarningsSummary(driverId);
  } catch {
    summary = null;
  }
  return {
    fare,
    fareLabel: formatFcfa(fare),
    kept,
    keptLabel: formatFcfa(kept),
    commission,
    commissionLabel: formatFcfa(commission),
    keptPct: 100 - ratePct,
    isDoubleRide: ride?.is_double_ride ?? false,
    loyaltyFree: ride?.loyalty_free ?? false,
    questBonus: fin.quest_points ?? 0,
    questDone: summary?.quest.day.done ?? 0,
    questTarget: summary?.quest.day.target ?? 8,
    questBonusAmount: summary?.quest.day.bonus ?? 1000,
    pointsEarned: fin.points_earned ?? 0,
    streakDays: summary?.streakDays ?? fin.streak ?? 0,
    tier: summary?.tier.current ?? fin.tier ?? 'Bronze',
    completedRides: summary?.completedRides ?? fin.completed_count ?? 0,
  };
}

/** PATCH /api/rides/[id] — annuler (passager ou chauffeur), démarrer /
 *  terminer (chauffeur assigné), noter (après course terminée),
 *  relancer une course planifiée expirée (v2.30). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Action invalide.' },
      { status: 400 }
    );
  }
  const { action } = parsed.data;

  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, ride_type, status, rating_driver, rating_passenger, pickup, destination, scheduled_at, estimated_price, payment_method, loyalty_free, unpaved_requested')
    .eq('id', id)
    .single();
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  const isPassenger = ride.passenger_id === user.id;
  const isDriver = ride.driver_id === user.id;

  // Relancer une course planifiée expirée (v2.30) : le passager
  // renvoie la demande tout de suite, aux mêmes conditions (trajet,
  // type, prix estimé). `created_at` est ramené à maintenant pour
  // que la demande passe le filtre « moins de 15 min » du dispatch.
  if (action === 'relaunch') {
    if (!isPassenger) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }
    if (ride.status !== 'expiree') {
      return NextResponse.json(
        { error: 'Seule une course planifiée expirée peut être relancée.' },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from('rides')
      .update({
        status: 'recherche',
        scheduled_at: null,
        dispatched_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'expiree');
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Relance impossible.' }, { status: 500 });
    }
    await logAudit(supabase, 'ride_relaunched', { actorId: user.id, rideId: id });
    return NextResponse.json({ ok: true });
  }

  if (action === 'cancel') {
    if (!isPassenger && !isDriver) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }
    // Une course planifiée s'annule avant son envoi (v2.30) : elle
    // n'a jamais occupé de place ni reçu de proposition.
    if (!['recherche', 'propositions', 'acceptee', 'planifiee'].includes(ride.status)) {
      return NextResponse.json(
        { error: 'Cette course ne peut plus être annulée.' },
        { status: 400 }
      );
    }
    // Motif (v2.23) : liste courte selon le rôle ; les anciens
    // clients qui n'en envoient pas tombent sur « autre ».
    const role = (isPassenger ? 'passager' : 'chauffeur') as CancelRole;
    const reasonCode = (parsed.data.reasonCode ?? 'autre') as CancelReasonCode;
    const reasonDetail = parsed.data.reason ?? null;
    const { error } = await supabase
      .from('rides')
      .update({
        status: 'annulee',
        cancelled_by: role,
        cancel_reason: cancelReasonText(reasonCode, reasonDetail),
      })
      .eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Annulation impossible.' }, { status: 500 });
    }
    // Places libres (v2.19) : une course acceptée puis annulée libère
    // sa place (Groupe + 1, Solo → capacité entière). Une demande
    // jamais acceptée n'avait rien occupé.
    if (ride.status === 'acceptee' && ride.driver_id) {
      await releaseSeat(supabase, ride.driver_id, ride.ride_type as 'solo' | 'groupe');
    }
    // v2.55 — annulation de l'empreinte carte (void) : rien n'est
    // débité quand la course est annulée avant capture. Ne bloque
    // jamais l'annulation, qui a déjà abouti.
    if (ride.status === 'acceptee' || ride.status === 'en_cours') {
      await voidCardHold(id);
    }
    // Historique + notification immédiate à l'autre partie (v2.23) :
    // message système dans la messagerie de course (visible en ~3 s
    // côté client quand la course était acceptée) + journal d'audit.
    // Les propositions en attente expirent toutes seules (60 s).
    await recordCancellation(supabase, {
      rideId: id,
      cancelledByUserId: user.id,
      cancelledByRole: role,
      reasonCode,
      reasonDetail,
      hasCounterpart: ride.driver_id !== null,
      chatWasOpen: ride.status === 'acceptee',
    });
    await logAudit(supabase, 'ride_cancelled', {
      actorId: user.id,
      rideId: id,
      cancelledBy: role,
      reason: cancelReasonLabel(reasonCode) ?? reasonCode,
      wasAccepted: ride.status === 'acceptee',
    });
    // Détection de fraude (v2.26) : annulations en série au-delà du
    // signalement P0a (3+ et taux > 25 %). Meilleur effort : ne
    // bloque jamais l'annulation, qui a déjà abouti.
    await checkCancellationFraud(supabase, user.id);
    return NextResponse.json({ ok: true, reason: cancelReasonLabel(reasonCode) });
  }

  if (action === 'start') {
    if (!isDriver) {
      return NextResponse.json({ error: 'Seul le chauffeur peut démarrer la course.' }, { status: 403 });
    }
    if (ride.status !== 'acceptee') {
      return NextResponse.json({ error: 'La course doit être confirmée pour démarrer.' }, { status: 400 });
    }
    // v2.55 — course par carte : pas de démarrage sans empreinte
    // confirmée. Le chauffeur ne roule jamais sans garantie de
    // paiement (sauf course offerte fidélité : le passager paie 0).
    if (ride.payment_method === 'carte' && !ride.loyalty_free) {
      const cardPayment = await getCardPaymentForRide(id);
      if (!cardPayment || cardPayment.status !== 'hold_confirmed') {
        return NextResponse.json(
          {
            error:
              'Le passager n’a pas encore confirmé le paiement par carte — la course ne peut pas démarrer. Demande-lui de confirmer l’empreinte dans l’application.',
            cardHoldRequired: true,
          },
          { status: 402 }
        );
      }
    }
    // Code PIN (v2.2) : le passager donne son code à 4 chiffres au
    // chauffeur. Vérification atomique côté base (verify_ride_pin) :
    // 5 codes faux = course verrouillée + signalée à l'admin.
    const pin = parsed.data.pin;
    if (!pin) {
      return NextResponse.json(
        { error: 'Demande le code à 4 chiffres au passager pour démarrer.' },
        { status: 400 }
      );
    }
    const { data: pinResult, error: pinError } = await supabase.rpc('verify_ride_pin', {
      p_ride_id: id,
      p_pin: pin,
    });
    if (pinError) {
      console.error('[api/rides/[id]] verify_ride_pin:', pinError.message);
      // Erreur critique répétée (v2.24) : au 5e échec en 1 h, une
      // seule alerte part à l'admin — les échecs isolés ne
      // déclenchent rien.
      await reportApiFailure('PATCH /api/rides/[id] (verify_ride_pin)', pinError.message);
      return NextResponse.json(
        { error: 'Vérification du code impossible pour le moment — la migration v2.2 doit être appliquée dans Supabase. Réessaie dans quelques minutes.' },
        { status: 503 }
      );
    }
    const result = pinResult as { ok: boolean; attempts_left?: number; locked?: boolean; error?: string };
    if (!result?.ok) {
      // 5 codes faux : course verrouillée (v2.24) — une seule alerte
      // admin pour cette course (clé = course, jamais de doublon).
      if (result?.locked) {
        await notifyAdminAlert({
          kind: 'pin_locked',
          key: `pin-locked:${id}`,
          detail: `Course verrouillée après 5 codes PIN faux : ${ride.pickup} → ${ride.destination}. À débloquer dans /admin.`,
        });
        // Détection de fraude (v2.26) : 2 courses verrouillées sur
        // 30 jours = faux PIN répétés, au-delà du verrouillage lot B.
        await checkPinFraud(supabase, user.id);
      }
      return NextResponse.json(
        {
          error: result?.error ?? 'Code faux.',
          attemptsLeft: result?.attempts_left ?? null,
          locked: result?.locked ?? false,
        },
        { status: result?.locked ? 423 : 400 }
      );
    }
    // Départ de la course (v2.23) : le lien de suivi part
    // automatiquement vers les contacts de confiance du passager
    // (e-mail quand une adresse est renseignée). Ne bloque jamais
    // le démarrage.
    await autoShareWithTrustedContacts(supabase, id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'complete') {
    if (!isDriver) {
      return NextResponse.json({ error: 'Seul le chauffeur peut terminer la course.' }, { status: 403 });
    }
    // Idempotence : si la course est déjà terminée (double clic, retry),
    // on ne la clôture pas deux fois — on renvoie la célébration.
    if (ride.status === 'terminee') {
      const celebration = await buildCelebration(supabase, id, user.id);
      return NextResponse.json({ ok: true, alreadyCompleted: true, celebration });
    }
    if (ride.status !== 'en_cours') {
      return NextResponse.json({ error: 'La course doit être en cours pour se terminer.' }, { status: 400 });
    }
    // Mise à jour conditionnelle : seul le passage en_cours → terminee
    // aboutit. Un double envoi concurrent ne crée pas de doublon.
    const { data: updated, error } = await supabase
      .from('rides')
      .update({ status: 'terminee', completed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'en_cours')
      .select('id');
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Clôture impossible.' }, { status: 500 });
    }
    if (!updated || updated.length === 0) {
      // Un autre appel vient de la terminer : idempotent.
      const celebration = await buildCelebration(supabase, id, user.id);
      return NextResponse.json({ ok: true, alreadyCompleted: true, celebration });
    }

    // Clôture des gains (idempotente côté base : jamais de double
    // commission). Si la fonction n'existe pas encore (migration v2.2
    // non appliquée), la course reste terminée et les gains seront
    // recalculés au prochain affichage du tableau de bord.
    const { data: finalized, error: finalizeError } = await supabase.rpc(
      'finalize_ride_earnings',
      { p_ride_id: id }
    );
    if (finalizeError) {
      console.error('[api/rides/[id]] finalize_ride_earnings:', finalizeError.message);
    }
    // v2.55 — course par carte : capture du prix convenu (+ frais)
    // sur l'empreinte, APRÈS la clôture des gains (la commission
    // est alors compensée automatiquement en dette). Ne bloque
    // jamais la clôture : en cas d'échec de capture, la part du
    // chauffeur part dans le lot quotidien, financée par la
    // plateforme — le chauffeur n'est jamais pénalisé.
    let cardCapture: { captured: boolean; reason?: string } | null = null;
    if (ride.payment_method === 'carte' && !ride.loyalty_free) {
      cardCapture = await captureCardRide(id);
    }
    // Places libres (v2.19) : la fin de course libère sa place
    // (Groupe + 1, Solo → capacité entière) — le chauffeur redevient
    // disponible pour les demandes adaptées.
    await releaseSeat(supabase, user.id, ride.ride_type as 'solo' | 'groupe');
    // Détection de fraude (v2.26) : vitesse moyenne impossible sur
    // la course terminée (distance / durée incohérentes). La durée
    // est calculée depuis le démarrage, la distance vient de la
    // ligne de course — données manquantes = on ne conclut pas.
    try {
      const { data: finished } = await supabase
        .from('rides')
        .select('distance_km, started_at, completed_at')
        .eq('id', id)
        .single();
      const row = finished as { distance_km: number | null; started_at: string | null; completed_at: string | null } | null;
      const durationMin =
        row?.started_at && row?.completed_at
          ? Math.max(0, (new Date(row.completed_at).getTime() - new Date(row.started_at).getTime()) / 60000)
          : null;
      await checkSpeedFraud(supabase, user.id, id, row?.distance_km ?? null, durationMin);
    } catch {
      // Détection indisponible : la course reste terminée.
    }
    const celebration = await buildCelebration(supabase, id, user.id, finalized);
    return NextResponse.json({ ok: true, celebration, cardCapture });
  }

  // rate
  if (ride.status !== 'terminee') {
    return NextResponse.json(
      { error: 'On ne note qu’une course terminée.' },
      { status: 400 }
    );
  }
  const rating = parsed.data.rating;
  if (!rating) {
    return NextResponse.json({ error: 'Note de 1 à 5 requise.' }, { status: 400 });
  }
  if (isPassenger && ride.rating_driver === null) {
    const { error } = await supabase
      .from('rides')
      .update({ rating_driver: rating })
      .eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Note impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  if (isDriver && ride.rating_passenger === null) {
    const { error } = await supabase
      .from('rides')
      .update({ rating_passenger: rating })
      .eq('id', id);
    if (error) {
      console.error('[api/rides/[id]]', error.message);
      return NextResponse.json({ error: 'Note impossible.' }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Note déjà donnée ou non autorisée.' }, { status: 400 });
}
