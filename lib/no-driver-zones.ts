/** Zones sans chauffeur (v2.27, lot E).
 *
 *  Quand une demande reste sans proposition plus de 2 minutes, c'est
 *  un signal : personne n'est disponible dans le coin (ou personne
 *  n'a vu la demande). Deux choses se passent alors :
 *
 *  1. ALERTE aux chauffeurs proches : la demande apparaît dans une
 *     bannière « Demande sans chauffeur près de toi » sur l'accueil
 *     chauffeur — UNE SEULE alerte par demande (unicité `ride_id`
 *     en base : la re-vérification ne recrée rien), sans spam.
 *  2. JOURNAL des zones vides : chaque demande sans proposition est
 *     consignée dans `unanswered_zones`, visible dans /admin — pour
 *     cibler le recrutement de chauffeurs dans les quartiers où les
 *     passagers attendent.
 *
 *  Déclenchement : aucun nouveau cron Vercel — la vérification tourne
 *  en meilleur effort à chaque sondage des demandes entrantes côté
 *  chauffeur (`getIncomingRequests`, `lib/rides.ts`) et à chaque
 *  lecture de la bannière (`/api/driver/unanswered`). Une demande qui
 *  reçoit ensuite une proposition sort d'elle-même de la liste des
 *  alertes actives (statut ≠ `recherche`) ; le journal, lui, garde
 *  la trace.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from './neighborhoods';
import { haversineKm } from './geo';

/** Délai sans proposition avant alerte + journalisation (minutes). */
export const NO_DRIVER_ALERT_AFTER_MIN = 2;

/** Rayon d'alerte côté chauffeur : la bannière ne montre que les
 *  demandes sans chauffeur à moins de 25 km (même rayon élargi que
 *  le dispatch). */
export const NO_DRIVER_ALERT_RADIUS_KM = 25;

export interface UnansweredZone {
  rideId: string;
  pickup: string;
  destination: string;
  rideType: 'solo' | 'groupe';
  /** Minutes d'attente depuis la création de la demande. */
  waitingMin: number;
  createdAt: string;
  alertedAt: string;
}

/** Vérifie les demandes en attente et journalise celles sans
 *  proposition depuis plus de `NO_DRIVER_ALERT_AFTER_MIN` minutes.
 *  Idempotent (unicité `ride_id`) et silencieux si la table
 *  n'existe pas encore (migration v2.27 non appliquée) : retourne
 *  le nombre de nouvelles zones journalisées. */
export async function checkAndLogUnansweredRides(
  supabase: SupabaseClient
): Promise<number> {
  try {
    const cutoff = new Date(Date.now() - NO_DRIVER_ALERT_AFTER_MIN * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('rides')
      .select('id, pickup, destination, ride_type, created_at')
      .eq('status', 'recherche')
      .lt('created_at', cutoff);
    if (error || !data) return 0;
    const rows = data as {
      id: string;
      pickup: string;
      destination: string;
      ride_type: string;
      created_at: string;
    }[];
    if (rows.length === 0) return 0;
    const ids = rows.map((r) => r.id);
    // Demandes ayant déjà reçu au moins une proposition : pas des
    // zones sans chauffeur (une proposition = un chauffeur a répondu).
    const { data: proposed } = await supabase
      .from('ride_proposals')
      .select('ride_id')
      .in('ride_id', ids);
    const withProposal = new Set(
      ((proposed ?? []) as { ride_id: string }[]).map((p) => p.ride_id)
    );
    const unanswered = rows.filter((r) => !withProposal.has(r.id));
    if (unanswered.length === 0) return 0;
    const { error: upsertError } = await supabase.from('unanswered_zones').upsert(
      unanswered.map((r) => ({
        ride_id: r.id,
        pickup: r.pickup,
        destination: r.destination,
        ride_type: r.ride_type,
      })),
      { onConflict: 'ride_id', ignoreDuplicates: true }
    );
    if (upsertError) return 0;
    return unanswered.length;
  } catch {
    return 0;
  }
}

/** Zones sans chauffeur ACTIVES (demande toujours en `recherche`,
 *  sans proposition) — bannière chauffeur + journal admin. Résilient
 *  sans la migration : liste vide. */
export async function getUnansweredZones(
  supabase: SupabaseClient,
  limit = 20
): Promise<UnansweredZone[]> {
  try {
    const { data, error } = await supabase
      .from('unanswered_zones')
      .select('ride_id, pickup, destination, ride_type, created_at, alerted_at, rides!inner(status, created_at)')
      .order('alerted_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    const now = Date.now();
    return (
      (data as unknown as {
        ride_id: string;
        pickup: string;
        destination: string;
        ride_type: string;
        created_at: string;
        alerted_at: string;
        rides: { status: string; created_at: string } | null;
      }[])
        // La demande a reçu une proposition ou a été annulée depuis :
        // plus une alerte active (le journal garde la ligne en base,
        // elle ne s'affiche plus ici).
        .filter((z) => z.rides?.status === 'recherche')
        .map((z) => ({
          rideId: z.ride_id,
          pickup: z.pickup,
          destination: z.destination,
          rideType: (z.ride_type === 'groupe' ? 'groupe' : 'solo') as 'solo' | 'groupe',
          waitingMin: Math.max(
            0,
            Math.round((now - new Date(z.rides?.created_at ?? z.created_at).getTime()) / 60000)
          ),
          createdAt: z.rides?.created_at ?? z.created_at,
          alertedAt: z.alerted_at,
        }))
    );
  } catch {
    return [];
  }
}

/** Filtre « près de moi » pour la bannière chauffeur : seules les
 *  zones dont le départ est à moins de `NO_DRIVER_ALERT_RADIUS_KM`
 *  de la position du chauffeur (ou dans son quartier si pas de GPS). */
export function filterZonesNearDriver(
  zones: UnansweredZone[],
  driver: { lat: number | null; lng: number | null; area: Neighborhood | null }
): UnansweredZone[] {
  return zones.filter((z) => {
    const coords = NEIGHBORHOOD_COORDS[z.pickup as Neighborhood];
    if (!coords) return driver.area === (z.pickup as Neighborhood);
    if (driver.lat !== null && driver.lng !== null) {
      return (
        haversineKm(driver.lat, driver.lng, coords.lat, coords.lng) <=
        NO_DRIVER_ALERT_RADIUS_KM
      );
    }
    return driver.area === (z.pickup as Neighborhood);
  });
}
