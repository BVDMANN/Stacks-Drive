import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';
import {
  ADMIN_EMAIL,
  sendDisputeEmail,
} from '@/lib/email';
import { DISPUTE_REASONS, DISPUTE_REASON_LABELS } from '@/lib/disputes';
import {
  COMPLAINT_TOPIC_IDS,
  escalationPrefix,
} from '@/lib/auto-replies';

const DisputeSchema = z.object({
  rideId: z.string().uuid(),
  reason: z.enum(DISPUTE_REASONS),
  amountConcerned: z.number().int().min(0).max(1000000).optional(),
  message: z.string().trim().min(2).max(1000),
  /** Sujet de plainte dont la réponse auto a été rejetée (v2.29) :
   *  le litige est une escalade — préfixe tracé dans le message,
   *  événement `complaint_escalated` en plus de `dispute_opened`. */
  escalatedFromAutoReply: z.enum(COMPLAINT_TOPIC_IDS).optional(),
});

/** POST /api/disputes — ouvrir un litige depuis sa course (passager ou
 *  chauffeur). Course terminée ou annulée, avec un chauffeur assigné.
 *  Un seul litige par partie et par course. L'admin est prévenu par
 *  e-mail (Resend) — un échec d'envoi ne bloque jamais l'ouverture :
 *  il est journalisé et le litige reste visible dans /admin. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = DisputeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  const { data: ride } = await supabase
    .from('rides')
    .select('id, passenger_id, driver_id, status, pickup, destination, proposed_price')
    .eq('id', v.rideId)
    .single();
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  if (ride.status !== 'terminee' && ride.status !== 'annulee') {
    return NextResponse.json(
      { error: 'On ouvre un litige une fois la course terminée ou annulée.' },
      { status: 400 }
    );
  }
  const isPassenger = ride.passenger_id === user.id;
  const isDriver = ride.driver_id === user.id;
  if (!isPassenger && !isDriver) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }
  const fromRole = isPassenger ? 'passager' : 'chauffeur';

  // Escalade après réponse auto rejetée (v2.29) : le préfixe dans
  // le message dit à l'admin (et dans l'e-mail) d'où vient le
  // litige — sans nouvelle colonne. Tronqué à 1 000 caractères
  // (contrainte de la table `disputes`).
  const storedMessage = v.escalatedFromAutoReply
    ? `${escalationPrefix(v.escalatedFromAutoReply)} ${v.message}`.slice(0, 1000)
    : v.message;

  const { data: inserted, error } = await supabase
    .from('disputes')
    .insert({
      ride_id: v.rideId,
      opened_by_id: user.id,
      opened_by_role: fromRole,
      reason: v.reason,
      amount_concerned: v.amountConcerned ?? null,
      message: storedMessage,
      status: 'ouvert',
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'Tu as déjà ouvert un litige sur cette course.' },
        { status: 409 }
      );
    }
    console.error('[api/disputes]', error.message);
    return NextResponse.json({ error: 'Ouverture impossible pour le moment.' }, { status: 500 });
  }

  const disputeId = (inserted as { id: string }).id;
  // Re-vérification selfie (v2.30) : un litige ouvert contre un
  // chauffeur (signalement) déclenche un contrôle selfie ponctuel à
  // sa prochaine mise en ligne — meilleur effort, jamais bloquant
  // pour l'ouverture du litige ; sans la migration v2.30, la
  // colonne manque et l'update échoue silencieusement.
  if (ride.driver_id && ride.driver_id !== user.id) {
    try {
      await supabase
        .from('profiles')
        .update({
          selfie_recheck_required: true,
          selfie_recheck_reason: 'signalement',
        })
        .eq('id', ride.driver_id);
    } catch {
      // Colonne absente : rien à faire.
    }
  }
  await logAudit(supabase, 'dispute_opened', {
    actorId: user.id,
    rideId: v.rideId,
    disputeId,
    reason: v.reason,
    amountConcerned: v.amountConcerned ?? null,
  });
  if (v.escalatedFromAutoReply) {
    await logAudit(supabase, 'complaint_escalated', {
      actorId: user.id,
      rideId: v.rideId,
      disputeId,
      autoReplyId: v.escalatedFromAutoReply,
      reason: v.reason,
    });
  }

  // E-mail admin — échec journalisé sans crash, jamais bloquant.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://stacks-drive.vercel.app';
  const sent = await sendDisputeEmail({
    to: ADMIN_EMAIL,
    disputeId,
    reasonLabel: DISPUTE_REASON_LABELS[v.reason],
    openedByRole: fromRole,
    openedByName: (profile as { full_name: string | null } | null)?.full_name ?? null,
    pickup: ride.pickup,
    destination: ride.destination,
    acceptedPrice: ride.proposed_price,
    amountConcerned: v.amountConcerned ?? null,
    message: storedMessage,
    adminUrl: `${baseUrl}/admin`,
  });
  if (!sent) {
    console.error('[api/disputes] e-mail admin non envoyé pour le litige', disputeId);
  }

  return NextResponse.json({ ok: true, disputeId }, { status: 201 });
}

/** GET /api/disputes?rideId= — mes litiges déjà ouverts sur cette course
 *  (pour masquer le formulaire une fois le litige ouvert). */
export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const rideId = new URL(request.url).searchParams.get('rideId');
  if (!rideId) {
    return NextResponse.json({ error: 'rideId requis.' }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }
  const { data, error } = await supabase
    .from('disputes')
    .select('id, reason, status, created_at, resolved_at')
    .eq('ride_id', rideId)
    .eq('opened_by_id', user.id);
  if (error) {
    console.error('[api/disputes]', error.message);
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, disputes: data ?? [] });
}
