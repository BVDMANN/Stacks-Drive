import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  TRAFFIC_DEDUPE_MIN,
  TRAFFIC_DEDUPE_RADIUS_M,
  TRAFFIC_EXPIRY_MIN,
  TRAFFIC_TYPES,
  getActiveTrafficReports,
  type TrafficType,
} from '@/lib/traffic';
import { haversineKm } from '@/lib/geo';

/** Trafic communautaire (v2.27, lot E — phase 2).
 *
 *  GET /api/traffic — signalements actifs (non expirés), lisibles par
 *  tout le monde (passagers + chauffeurs) : type, position, nombre de
 *  confirmations, mise en évidence si confirmé. L'identité du
 *  signaleur n'est jamais renvoyée.
 *
 *  POST /api/traffic — un CHAUFFEUR en course active signale un
 *  problème de circulation à sa position. Anti-spam : même chauffeur,
 *  même type, à moins de 500 m dans les 10 minutes → le signalement
 *  existant est renvoyé (pas de doublon). Expiration automatique
 *  (30–60 min selon le type, posée par trigger en base).
 */

const ReportSchema = z.object({
  type: z.enum(TRAFFIC_TYPES),
  lat: z.number().min(-0.5).max(1.5),
  lng: z.number().min(8.5).max(10.5),
  neighborhood: z.string().max(80).optional().nullable(),
  rideId: z.string().uuid().optional().nullable(),
});

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true, reports: [] });
  }
  const supabase = await createClient();
  const reports = await getActiveTrafficReports(supabase);
  return NextResponse.json({ ok: true, reports });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Supabase n’est pas configuré sur ce déploiement.' },
      { status: 503 }
    );
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
    .select('role, is_verified')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { ok: false, error: 'Seuls les chauffeurs signalent le trafic.' },
      { status: 403 }
    );
  }
  // Signalement pendant une course : le chauffeur doit avoir une
  // course acceptée ou en cours (la sienne — sinon n'importe qui en
  // ligne pourrait inonder la carte).
  const { data: activeRide } = await supabase
    .from('rides')
    .select('id')
    .eq('driver_id', user.id)
    .in('status', ['acceptee', 'en_cours'])
    .limit(1)
    .maybeSingle();
  if (!activeRide) {
    return NextResponse.json(
      { ok: false, error: 'Signale pendant une course — pas de course en cours.' },
      { status: 403 }
    );
  }
  const body = await request.json().catch(() => null);
  const parsed = ReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;
  const type = v.type as TrafficType;
  const since = new Date(Date.now() - TRAFFIC_DEDUPE_MIN * 60 * 1000).toISOString();
  // Anti-doublon : même chauffeur, même type, récent et proche.
  const { data: recent } = await supabase
    .from('traffic_reports')
    .select('id, lat, lng, expires_at, created_at')
    .eq('reporter_id', user.id)
    .eq('type', type)
    .gt('created_at', since);
  const existing = (recent ?? []).find(
    (r: { lat: number; lng: number }) =>
      haversineKm(v.lat, v.lng, r.lat, r.lng) * 1000 <= TRAFFIC_DEDUPE_RADIUS_M
  ) as { id: string; lat: number; lng: number; expires_at: string; created_at: string } | undefined;
  if (existing) {
    return NextResponse.json({
      ok: true,
      alreadyReported: true,
      report: {
        id: existing.id,
        type,
        lat: existing.lat,
        lng: existing.lng,
        neighborhood: v.neighborhood ?? null,
        confirmations: 0,
        confirmed: false,
        expiresAt: existing.expires_at,
        createdAt: existing.created_at,
        mine: true,
      },
    });
  }
  const expiresAt = new Date(
    Date.now() + TRAFFIC_EXPIRY_MIN[type] * 60 * 1000
  ).toISOString();
  const { data: inserted, error } = await supabase
    .from('traffic_reports')
    .insert({
      reporter_id: user.id,
      ride_id: v.rideId ?? activeRide.id,
      type,
      lat: v.lat,
      lng: v.lng,
      neighborhood: v.neighborhood ?? null,
      expires_at: expiresAt,
    })
    .select('id, created_at')
    .single();
  if (error || !inserted) {
    return NextResponse.json(
      { ok: false, error: 'Signalement impossible pour le moment.' },
      { status: 500 }
    );
  }
  return NextResponse.json({
    ok: true,
    alreadyReported: false,
    report: {
      id: inserted.id,
      type,
      lat: v.lat,
      lng: v.lng,
      neighborhood: v.neighborhood ?? null,
      confirmations: 0,
      confirmed: false,
      expiresAt,
      createdAt: inserted.created_at,
      mine: true,
    },
  });
}
