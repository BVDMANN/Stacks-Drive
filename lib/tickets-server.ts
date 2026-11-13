/** Tickets de vérification chauffeur (v2.4) — lectures côté serveur.
 *
 *  Serveur uniquement (importe le client Supabase avec cookies) : ne
 *  jamais importer ce module depuis un composant client. Les types et
 *  helpers purs sont dans `lib/tickets.ts`.
 *
 *  Lecture défensive : si la table n'existe pas encore (migration
 *  v2.4 non appliquée), les lectures renvoient [] — jamais de crash.
 */

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { URGENCY_RANK, type StoredVerificationChecks, type TicketKind, type TicketStatus, type TicketUrgency } from '@/lib/verification';
import { TICKET_KIND_LABELS, type VerificationTicket } from '@/lib/tickets';

interface TicketRow {
  id: string;
  driver_id: string;
  kind: string;
  summary: string;
  details: Record<string, unknown>;
  urgency: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  email_sent_at: string | null;
  driver?: {
    full_name: string | null;
    email: string;
    phone: string | null;
    selfie_url: string | null;
    id_document_url: string | null;
    id_document_type: string | null;
    verification_checks: StoredVerificationChecks | null;
  } | null;
}

/** Tickets ouverts + récemment résolus (admin), triés par urgence puis
 *  par date (les plus récents d'abord). [] si la table n'existe pas. */
export async function getVerificationTickets(): Promise<VerificationTicket[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('verification_tickets')
    .select(
      `id, driver_id, kind, summary, details, urgency, status, created_at,
       resolved_at, resolved_by, email_sent_at,
       driver:profiles!verification_tickets_driver_id_fkey (
         full_name, email, phone, selfie_url, id_document_url,
         id_document_type, verification_checks
       )`
    )
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) {
    if (error) console.error('[tickets] lecture:', error.message);
    return [];
  }
  const tickets = (data as unknown as TicketRow[]).map((row) => ({
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver?.full_name ?? null,
    driverEmail: row.driver?.email ?? '—',
    driverPhone: row.driver?.phone ?? null,
    kind: row.kind as TicketKind,
    kindLabel: TICKET_KIND_LABELS[row.kind as TicketKind] ?? row.kind,
    summary: row.summary,
    details: (row.details ?? {}) as Record<string, unknown>,
    urgency: row.urgency as TicketUrgency,
    status: row.status as TicketStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    emailSentAt: row.email_sent_at,
    checks: row.driver?.verification_checks ?? null,
    selfiePath: row.driver?.selfie_url ?? null,
    documentPath: row.driver?.id_document_url ?? null,
    documentType: row.driver?.id_document_type ?? null,
  }));
  // Tri : ouverts d'abord, par urgence (critique en tête), puis date.
  return tickets.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ouvert' ? -1 : 1;
    const rank = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
    if (rank !== 0) return rank;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Nombre de tickets ouverts (pastille admin). 0 si table absente. */
export async function countOpenTickets(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('verification_tickets')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ouvert');
  if (error) return 0;
  return count ?? 0;
}
