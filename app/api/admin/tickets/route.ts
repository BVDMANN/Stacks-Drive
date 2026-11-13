import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';

const TicketDecisionSchema = z.object({
  ticketId: z.string().uuid(),
  /** approuver = chauffeur vérifié ; refuser = dossier refusé ;
   *  refaire = demander au chauffeur de renvoyer des documents. */
  decision: z.enum(['verifie', 'refuse', 'refaire']),
  note: z.string().trim().max(300).optional(),
});

/** PATCH /api/admin/tickets — l'admin tranche un ticket de vérification
 *  (v2.4). Chaque action met à jour : le profil du chauffeur
 *  (statut + motif visible par le chauffeur), le ticket (résolu, par
 *  qui, quand) et le journal d'audit. Les autres tickets ouverts du
 *  même chauffeur sont résolus en même temps (un dossier = une décision). */
export async function PATCH(request: NextRequest) {
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
  const { data: caller } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single();
  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = TicketDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const { ticketId, decision, note } = parsed.data;

  const { data: ticket, error: ticketError } = await supabase
    .from('verification_tickets')
    .select('id, driver_id, kind, summary, details, status')
    .eq('id', ticketId)
    .single();
  if (ticketError || !ticket) {
    return NextResponse.json({ error: 'Ticket introuvable.' }, { status: 404 });
  }
  if (ticket.status !== 'ouvert') {
    return NextResponse.json({ error: 'Ce ticket est déjà résolu.' }, { status: 400 });
  }

  // Motif visible par le chauffeur (obligatoire pour refuser / refaire).
  const defaultNote =
    decision === 'refaire'
      ? 'Merci de renvoyer des documents plus lisibles : selfie bien éclairé, visage visible, et pièce photographiée bien à plat, tous les textes lisibles.'
      : 'Vérification refusée : merci de renvoyer des documents valides et lisibles.';
  const verificationNote = decision === 'verifie' ? null : note?.trim() || defaultNote;
  if (decision !== 'verifie' && (verificationNote?.length ?? 0) < 3) {
    return NextResponse.json({ error: 'Indiquez le motif (visible par le chauffeur).' }, { status: 400 });
  }
  const nextStatus = decision === 'verifie' ? 'verifie' : 'refuse';

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ verification_status: nextStatus, verification_note: verificationNote })
    .eq('id', ticket.driver_id);
  if (profileError) {
    console.error('[api/admin/tickets]', profileError.message);
    return NextResponse.json({ error: 'Modification impossible pour le moment.' }, { status: 500 });
  }

  const resolution = {
    decision,
    note: verificationNote,
    at: new Date().toISOString(),
  };
  const details = { ...((ticket.details ?? {}) as Record<string, unknown>), resolution };
  const { error: resolveError } = await supabase
    .from('verification_tickets')
    .update({
      status: 'resolu',
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      details,
    })
    .eq('driver_id', ticket.driver_id)
    .eq('status', 'ouvert');
  if (resolveError) {
    console.error('[api/admin/tickets] résolution ticket:', resolveError.message);
  }

  await logAudit(supabase, 'verification_ticket_resolved', {
    actorId: user.id,
    driverName: null,
    ticketId,
    decision,
    kind: ticket.kind,
  });

  return NextResponse.json({ ok: true });
}
