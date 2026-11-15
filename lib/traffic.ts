/** Trafic communautaire (v2.27, lot E — phase 2) : le « Waze maison ».
 *
 *  Aucun fournisseur de données trafic ne couvre le Gabon (TomTom /
 *  HERE / Bing : trafic temps réel indisponible) — les signalements
 *  viennent donc des chauffeurs eux-mêmes, pendant une course :
 *  « Embouteillage / Accident / Travaux / Route fermée ».
 *
 *  Règles :
 *  - Seuls les chauffeurs signalent (RLS + contrôle serveur : un
 *    chauffeur en course active). Tout le monde LIT les marqueurs
 *    (passagers et chauffeurs, sur la carte).
 *  - Expiration automatique : 30 min (embouteillage) à 60 min
 *    (accident, travaux, route fermée) — un signalement expiré
 *    disparaît de la carte, sans action manuelle.
 *  - MODÉRATION AUTO (item 15 du lot D, qui attendait ce lot) : un
 *    signalement confirmé par au moins 2 chauffeurs
 *    (`TRAFFIC_CONFIRM_MIN`) est affiché EN ÉVIDENCE (marqueur rose)
 *    ; sinon il reste affiché normalement jusqu'à expiration — il
 *    n'est jamais « mis en avant » sans confirmation. Un chauffeur
 *    ne peut pas confirmer son propre signalement, ni confirmer deux
 *    fois le même (unicité en base).
 *  - Anti-spam : un même chauffeur ne peut pas re-signaler le même
 *    type à moins de 500 m dans les 10 minutes (le signalement
 *    existant est renvoyé).
 *  - Confidentialité : l'identité du signaleur n'est JAMAIS exposée
 *    (ni aux passagers, ni aux autres chauffeurs) — seuls le type,
 *    la position et le nombre de confirmations sortent de l'API.
 */

export const TRAFFIC_TYPES = ['embouteillage', 'accident', 'travaux', 'route_fermee'] as const;
export type TrafficType = (typeof TRAFFIC_TYPES)[number];

export const TRAFFIC_LABELS: Record<TrafficType, string> = {
  embouteillage: 'Embouteillage',
  accident: 'Accident',
  travaux: 'Travaux',
  route_fermee: 'Route fermée',
};

/** Durée de vie d'un signalement, en minutes, par type. */
export const TRAFFIC_EXPIRY_MIN: Record<TrafficType, number> = {
  embouteillage: 30,
  accident: 60,
  travaux: 60,
  route_fermee: 60,
};

/** Nombre de confirmations par d'autres chauffeurs pour qu'un
 *  signalement soit affiché en évidence (modération auto). */
export const TRAFFIC_CONFIRM_MIN = 2;

/** Rayon « autour de moi » pour la liste des signalements côté
 *  chauffeur (km). */
export const TRAFFIC_NEAR_KM = 5;

/** Distance en dessous de laquelle deux signalements du même type
 *  par le même chauffeur sont considérés comme un doublon (mètres). */
export const TRAFFIC_DEDUPE_RADIUS_M = 500;

/** Fenêtre anti-doublon (minutes) : même chauffeur, même type. */
export const TRAFFIC_DEDUPE_MIN = 10;

export interface TrafficReport {
  id: string;
  type: TrafficType;
  lat: number;
  lng: number;
  neighborhood: string | null;
  /** Nombre de chauffeurs (hors signaleur) ayant confirmé. */
  confirmations: number;
  /** Vrai quand confirmations >= TRAFFIC_CONFIRM_MIN. */
  confirmed: boolean;
  expiresAt: string;
  createdAt: string;
  /** Vrai si le signalement vient du chauffeur connecté (vue chauffeur). */
  mine?: boolean;
}

import type { SupabaseClient } from '@supabase/supabase-js';

/** Signalement actif lu depuis Supabase. Résilient : si la table
 *  n'existe pas encore (migration v2.27 non appliquée), liste vide. */
export async function getActiveTrafficReports(
  supabase: SupabaseClient,
  viewerId?: string | null
): Promise<TrafficReport[]> {
  try {
    const { data, error } = await supabase
      .from('traffic_reports')
      .select('id, reporter_id, type, lat, lng, neighborhood, expires_at, created_at')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    const rows = data as {
      id: string;
      reporter_id: string | null;
      type: string;
      lat: number;
      lng: number;
      neighborhood: string | null;
      expires_at: string;
      created_at: string;
    }[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    // Nombre de confirmations par signalement (table absente avant
    // la migration → 0 partout, sans erreur bloquante).
    const counts = new Map<string, number>();
    try {
      const { data: conf } = await supabase
        .from('traffic_confirmations')
        .select('report_id')
        .in('report_id', ids);
      ((conf ?? []) as { report_id: string }[]).forEach((c) => {
        counts.set(c.report_id, (counts.get(c.report_id) ?? 0) + 1);
      });
    } catch {
      // Table absente : 0 confirmation partout.
    }
    return rows
      .filter((r) => (TRAFFIC_TYPES as readonly string[]).includes(r.type))
      .map((r) => {
        const confirmations = counts.get(r.id) ?? 0;
        return {
          id: r.id,
          type: r.type as TrafficType,
          lat: r.lat,
          lng: r.lng,
          neighborhood: r.neighborhood,
          confirmations,
          confirmed: confirmations >= TRAFFIC_CONFIRM_MIN,
          expiresAt: r.expires_at,
          createdAt: r.created_at,
          mine: viewerId ? r.reporter_id === viewerId : false,
        };
      });
  } catch {
    return [];
  }
}
