/** Heatmap de demande côté chauffeur (v2.30, plancher P1) — INFO
 *  SEULEMENT, sans surge, sans prix dynamique, sans promesse de gain.
 *
 *  Source : les vraies demandes des 7 derniers jours (`rides`,
 *  statuts recherche → terminée, hors annulées) groupées par quartier
 *  de départ, plus les demandes sans proposition (zones sans chauffeur,
 *  v2.27). Jamais de données inventées : sans historique, la liste
 *  est vide et le dit. Le niveau est relatif au quartier le plus
 *  demandé de la semaine (forte ≥ 60 %, moyenne ≥ 30 %, sinon faible).
 */

import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

export interface DemandZone {
  neighborhood: string;
  rides: number;
  /** Demandes sans proposition depuis plus de 2 min (v2.27). */
  unanswered: number;
  level: 'forte' | 'moyenne' | 'faible';
}

export async function getDemandHeatmap(): Promise<{
  zones: DemandZone[];
  windowDays: number;
  totalRides: number;
}> {
  const empty = { zones: [] as DemandZone[], windowDays: 7, totalRides: 0 };
  if (!isSupabaseConfigured()) return empty;
  const supabase = await createClient();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('rides')
    .select('pickup')
    .in('status', ['recherche', 'propositions', 'acceptee', 'en_cours', 'terminee'])
    .gte('created_at', since)
    .limit(1000);
  if (error || !data) return empty;
  const counts = new Map<string, number>();
  (data as { pickup: string }[]).forEach((r) => {
    if (!r.pickup) return;
    counts.set(r.pickup, (counts.get(r.pickup) ?? 0) + 1);
  });
  // Demandes sans chauffeur (v2.27) : 1 ligne par demande, on compte
  // par quartier de départ via la course liée — meilleur effort.
  const unanswered = new Map<string, number>();
  try {
    const { data: zones } = await supabase
      .from('unanswered_zones')
      .select('ride_id')
      .gte('created_at', since)
      .limit(200);
    const rideIds = ((zones ?? []) as { ride_id: string }[]).map((z) => z.ride_id);
    if (rideIds.length > 0) {
      const { data: rides } = await supabase
        .from('rides')
        .select('id, pickup')
        .in('id', rideIds);
      (rides ?? []).forEach((r: { pickup: string }) => {
        unanswered.set(r.pickup, (unanswered.get(r.pickup) ?? 0) + 1);
      });
    }
  } catch {
    // Table v2.27 absente : pas de compteur « sans réponse ».
  }
  const total = [...counts.values()].reduce((s, n) => s + n, 0);
  const max = Math.max(0, ...counts.values());
  const zones: DemandZone[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([neighborhood, rides]) => ({
      neighborhood,
      rides,
      unanswered: unanswered.get(neighborhood) ?? 0,
      level:
        max > 0 && rides / max >= 0.6
          ? 'forte'
          : max > 0 && rides / max >= 0.3
            ? 'moyenne'
            : 'faible',
    }));
  return { zones, windowDays: 7, totalRides: total };
}
