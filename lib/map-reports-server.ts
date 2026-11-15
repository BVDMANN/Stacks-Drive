/** Signalements « erreurs de carte » (v2.49) — lectures côté serveur.
 *
 *  Serveur uniquement (importe le client Supabase avec cookies) : ne
 *  jamais importer ce module depuis un composant client.
 *
 *  Lecture défensive : si la table n'existe pas encore (migration
 *  v2.49b non appliquée), les lectures renvoient [] / 0 — jamais de
 *  crash. */

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { MapReportKind, MapReportStatus } from '@/lib/map-reports';

export type { MapReportKind, MapReportStatus } from '@/lib/map-reports';

export interface MapReport {
  id: string;
  userId: string;
  kind: MapReportKind;
  title: string;
  details: string;
  status: MapReportStatus;
  createdAt: string;
  userName: string | null;
}

interface MapReportRow {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  details: string;
  status: string;
  created_at: string;
  reporter?: { full_name: string | null } | null;
}

/** Signalements ouverts + récemment résolus (admin), les plus
 *  récents d'abord. [] si la table n'existe pas. */
export async function getMapReports(): Promise<MapReport[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('map_reports')
    .select(
      `id, user_id, kind, title, details, status, created_at,
       reporter:profiles!map_reports_user_id_fkey (full_name)`
    )
    .order('created_at', { ascending: false })
    .limit(50);
  if (error || !data) {
    if (error) console.error('[map-reports] lecture:', error.message);
    return [];
  }
  return (data as unknown as MapReportRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    kind: row.kind as MapReportKind,
    title: row.title,
    details: row.details,
    status: row.status as MapReportStatus,
    createdAt: row.created_at,
    userName: row.reporter?.full_name ?? null,
  }));
}

/** Nombre de signalements ouverts (badge /admin). 0 si la table
 *  n'existe pas. */
export async function countOpenMapReports(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('map_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'ouvert');
  if (error) return 0;
  return count ?? 0;
}
