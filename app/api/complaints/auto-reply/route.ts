import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';
import {
  buildAutoReply,
  classifyComplaint,
  COMPLAINT_TOPIC_IDS,
  ESCALATION_LABELS,
  topicById,
} from '@/lib/auto-replies';

const AutoReplySchema = z.object({
  rideId: z.string().uuid(),
  topic: z.enum(COMPLAINT_TOPIC_IDS),
  message: z.string().trim().max(1000).optional(),
  amountConcerned: z.number().int().min(0).max(1000000).optional(),
});

/** POST /api/complaints/auto-reply — plainte standard (v2.29) :
 *  réponse IMMÉDIATE, sans humain, quand le motif est standard
 *  (retard, attente, annulation, prix / paiement sans fraude,
 *  itinéraire, véhicule). La réponse est construite avec les
 *  chiffres de LA course (prix figé accepté, estimation indicative,
 *  qui a annulé et pourquoi) et journalisée dans `audit_log`
 *  (`complaint_auto_replied`) — elle ne crée ni litige ni e-mail.
 *
 *  Quand la plainte n'est PAS standard (mot grave, montant
 *  contesté important, sujet « Autre »), la route ne crée RIEN :
 *  elle renvoie `outcome: 'escalate'` et c'est le client qui
 *  présente le formulaire de litige (flux v2.15 existant) —
 *  l'escalade n'est journalisée qu'à la création du litige
 *  (`complaint_escalated` dans POST /api/disputes).
 *
 *  La classification est re-faite côté serveur (même fonction que
 *  le client) : un client ne peut pas forcer une réponse auto sur
 *  un sujet grave. */
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
  const parsed = AutoReplySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;
  const topic = topicById(v.topic);
  if (!topic) {
    return NextResponse.json({ error: 'Sujet inconnu.' }, { status: 400 });
  }

  const { data: ride } = await supabase
    .from('rides')
    .select(
      'id, passenger_id, driver_id, status, proposed_price, estimated_price, cancelled_by, cancel_reason, loyalty_free'
    )
    .eq('id', v.rideId)
    .single();
  if (!ride) {
    return NextResponse.json({ error: 'Course introuvable.' }, { status: 404 });
  }
  if (ride.status !== 'terminee' && ride.status !== 'annulee') {
    return NextResponse.json(
      { error: 'On signale un problème une fois la course terminée ou annulée.' },
      { status: 400 }
    );
  }
  const isPassenger = ride.passenger_id === user.id;
  const isDriver = ride.driver_id === user.id;
  if (!isPassenger && !isDriver) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }
  const role = isPassenger ? 'passager' : 'chauffeur';
  // L'annulation n'est un sujet valable que si la course a été
  // annulée (le client filtre déjà, le serveur re-vérifie).
  if (v.topic === 'annulation' && ride.status !== 'annulee') {
    return NextResponse.json(
      { error: 'Cette course n’a pas été annulée.' },
      { status: 400 }
    );
  }

  const classified = classifyComplaint({
    topic: v.topic,
    message: v.message ?? null,
    amountConcerned: v.amountConcerned ?? null,
  });
  if (classified.outcome === 'escalate') {
    return NextResponse.json({
      ok: true,
      outcome: 'escalate',
      escalationReason: classified.escalationReason,
      escalationLabel: ESCALATION_LABELS[classified.escalationReason],
      disputeReason: topic.disputeReason,
    });
  }

  const rideRow = ride as {
    status: 'terminee' | 'annulee';
    proposed_price: number | null;
    estimated_price: number;
    cancelled_by: 'passager' | 'chauffeur' | null;
    cancel_reason: string | null;
    loyalty_free: boolean | null;
  };
  const autoReply = buildAutoReply({
    topic: classified.autoReplyId,
    role,
    rideStatus: rideRow.status,
    cancelledBy: rideRow.cancelled_by,
    cancelReason: rideRow.cancel_reason,
    acceptedPrice: rideRow.proposed_price,
    estimatedPrice: rideRow.estimated_price,
    loyaltyFree: rideRow.loyalty_free ?? false,
    amountConcerned: v.amountConcerned ?? null,
  });

  await logAudit(supabase, 'complaint_auto_replied', {
    actorId: user.id,
    rideId: v.rideId,
    topic: v.topic,
    autoReplyId: autoReply.id,
    amountConcerned: v.amountConcerned ?? null,
  });

  return NextResponse.json({ ok: true, outcome: 'auto', autoReply });
}
