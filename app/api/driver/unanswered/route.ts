import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  checkAndLogUnansweredRides,
  filterZonesNearDriver,
  getUnansweredZones,
} from '@/lib/no-driver-zones';
import type { Neighborhood } from '@/lib/neighborhoods';

/** GET /api/driver/unanswered — demandes sans chauffeur près de moi
 *  (v2.27, lot E).
 *
 *  À chaque lecture : on (re)vérifie les demandes en attente et on
 *  journalise celles sans proposition depuis plus de 2 min (une seule
 *  alerte par demande, unicité en base), puis on renvoie celles
 *  proches du chauffeur (25 km ou même quartier). Le chauffeur voit
 *  ainsi les demandes qu'il pourrait prendre — sans spam : une demande
 *  déjà alertée ne réapparaît pas en double.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, zones: [] });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Connecte-toi pour continuer.' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, current_area, last_lat, last_lng')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { ok: false, error: 'Réservé aux chauffeurs.' },
      { status: 403 }
    );
  }
  await checkAndLogUnansweredRides(supabase);
  const zones = await getUnansweredZones(supabase, 20);
  const nearby = filterZonesNearDriver(zones, {
    lat: (profile as { last_lat: number | null }).last_lat ?? null,
    lng: (profile as { last_lng: number | null }).last_lng ?? null,
    area: (profile as { current_area: Neighborhood | null }).current_area ?? null,
  });
  return NextResponse.json({ ok: true, zones: nearby });
}
