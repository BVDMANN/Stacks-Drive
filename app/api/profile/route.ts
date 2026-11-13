import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { NEIGHBORHOODS, VEHICLE_TYPES, type Neighborhood } from '@/lib/neighborhoods';

const ProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'Nom complet requis.').max(120).optional(),
  phone: z.string().trim().min(8, 'Numéro de téléphone invalide.').max(30).optional(),
  vehicleType: z.enum(VEHICLE_TYPES).optional(),
  vehicleBrand: z.string().trim().max(60).optional().nullable(),
  vehicleModel: z.string().trim().max(60).optional().nullable(),
  vehicleColor: z.string().trim().max(40).optional().nullable(),
  plate: z.string().trim().max(20).optional().nullable(),
  seats: z.number().int().min(1).max(9).optional(),
  isOnline: z.boolean().optional(),
  /** Bascule de mode Passager / Chauffeur (même compte). */
  role: z.enum(['passager', 'chauffeur']).optional(),
  /** Quartier où se trouve le chauffeur quand il est en ligne. */
  currentArea: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]).optional(),
  // Réservé à l'admin : vérification d'un chauffeur (driverId requis).
  driverId: z.string().uuid().optional(),
  verificationStatus: z.enum(['verifie', 'refuse']).optional(),
  verificationNote: z.string().trim().max(300).optional(),
});

/** PATCH /api/profile — modifier son propre profil (véhicule, mode,
 *  zone, en ligne) ; un admin peut valider ou refuser la vérification
 *  d'un chauffeur (driverId + verificationStatus + motif éventuel). */
export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Supabase n’est pas configuré sur ce déploiement.' },
      { status: 503 }
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = ProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  const v = parsed.data;

  // Vérification d'un chauffeur : admin uniquement.
  if (v.driverId !== undefined || v.verificationStatus !== undefined) {
    const { data: caller } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();
    if (!caller?.is_admin) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 });
    }
    if (!v.driverId || !v.verificationStatus) {
      return NextResponse.json(
        { error: 'Chauffeur et décision de vérification requis.' },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        verification_status: v.verificationStatus,
        verification_note: v.verificationNote ?? null,
      })
      .eq('id', v.driverId);
    if (error) {
      console.error('[api/profile]', error.message);
      return NextResponse.json(
        { error: 'Modification impossible pour le moment.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const patch: Record<string, unknown> = {};
  if (v.fullName !== undefined) patch.full_name = v.fullName;
  if (v.phone !== undefined) patch.phone = v.phone;
  if (v.vehicleType !== undefined) patch.vehicle_type = v.vehicleType;
  if (v.vehicleBrand !== undefined) patch.vehicle_brand = v.vehicleBrand || null;
  if (v.vehicleModel !== undefined) patch.vehicle_model = v.vehicleModel || null;
  if (v.vehicleColor !== undefined) patch.vehicle_color = v.vehicleColor || null;
  if (v.plate !== undefined) patch.plate = v.plate || null;
  if (v.seats !== undefined) patch.seats = v.seats;
  if (v.isOnline !== undefined) patch.is_online = v.isOnline;
  if (v.role !== undefined) patch.role = v.role;
  if (v.currentArea !== undefined) {
    patch.current_area = v.currentArea;
    // Position approximative = centre du quartier (carte + radar).
    const { NEIGHBORHOOD_COORDS } = await import('@/lib/neighborhoods');
    const coords = NEIGHBORHOOD_COORDS[v.currentArea];
    patch.last_lat = coords.lat;
    patch.last_lng = coords.lng;
  }

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id);
  if (error) {
    console.error('[api/profile]', error.message);
    return NextResponse.json(
      { error: 'Modification impossible pour le moment.' },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
