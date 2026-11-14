import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { NEIGHBORHOODS, type Neighborhood } from '@/lib/neighborhoods';

const ReturnTripSchema = z.object({
  /** Quartier de retour (null = effacer la destination). */
  returnDestination: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]).nullable(),
  /** Filtre actif ou non — désactivable à tout moment. */
  enabled: z.boolean(),
});

/** GET /api/driver/return-trip — destination de retour et état du
 *  filtre du chauffeur connecté. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, return_destination, return_filter_enabled')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json({ error: 'Seuls les chauffeurs définissent un retour.' }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    returnDestination: (profile as { return_destination: string | null }).return_destination ?? null,
    enabled: (profile as { return_filter_enabled: boolean | null }).return_filter_enabled ?? false,
  });
}

/** POST /api/driver/return-trip — définir / modifier / désactiver le
 *  filtre destination de retour. */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json({ error: 'Seuls les chauffeurs définissent un retour.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = ReturnTripSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Destination de retour invalide.' }, { status: 400 });
  }
  if (parsed.data.enabled && !parsed.data.returnDestination) {
    return NextResponse.json(
      { error: 'Choisis un quartier de retour pour activer le filtre.' },
      { status: 400 }
    );
  }
  const { error } = await supabase
    .from('profiles')
    .update({
      return_destination: parsed.data.returnDestination,
      return_filter_enabled: parsed.data.enabled,
    })
    .eq('id', user.id);
  if (error) {
    if (error.code === '42703') {
      return NextResponse.json(
        { error: 'Le retour n’est pas encore activé sur ce déploiement (migration v2.34 à appliquer).' },
        { status: 503 }
      );
    }
    console.error('[api/driver/return-trip]', error.message);
    return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    returnDestination: parsed.data.returnDestination,
    enabled: parsed.data.enabled,
  });
}
