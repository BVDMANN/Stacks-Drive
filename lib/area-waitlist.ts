/** Liste d'attente « préviens-moi » (v2.32, écran hors zone).
 *
 *  Quand la géolocalisation place quelqu'un hors de la zone de
 *  service (Grand Libreville, `SERVICE_BOUNDS` dans `lib/geo.ts`),
 *  l'appli lui propose de laisser son e-mail pour être prévenu
 *  quand Stacks Drive arrive chez lui. Une seule chose est
 *  conservée : l'e-mail + la ville / le pays en best-effort —
 *  JAMAIS de coordonnées GPS précises (ni lat, ni lng, ni adresse).
 *  Consentement explicite obligatoire (case à cocher, vérifiée
 *  côté serveur dans `POST /api/notify-me`).
 *
 *  La table `area_waitlist` n'existe qu'après la migration
 *  v2.32 (non exécutée) : comme `getUnansweredZones`
 *  (`lib/no-driver-zones.ts`), la lecture admin retourne une
 *  liste vide si la table est absente — jamais d'erreur. */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Clé de session : l'écran hors zone fermé ne réapparaît pas
 *  avant la fin de la session navigateur (portée session, pas de
 *  persistance définitive — la personne revoit le message à sa
 *  prochaine visite). */
export const OUT_OF_ZONE_DISMISSED_KEY =
  'stacks-drive-out-of-zone-dismissed-v1';

export interface AreaWaitlistEntry {
  id: string;
  email: string;
  city: string | null;
  country: string | null;
  createdAt: string;
}

/** Demandes « préviens-moi », les plus récentes d'abord, pour la
 *  section /admin. Table absente (migration v2.32 non appliquée)
 *  = liste vide, silencieusement. */
export async function getAreaWaitlist(
  supabase: SupabaseClient,
  limit = 100
): Promise<AreaWaitlistEntry[]> {
  try {
    const { data, error } = await supabase
      .from('area_waitlist')
      .select('id, email, city, country, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as {
      id: string;
      email: string;
      city: string | null;
      country: string | null;
      created_at: string;
    }[]).map((r) => ({
      id: r.id,
      email: r.email,
      city: r.city,
      country: r.country,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}
