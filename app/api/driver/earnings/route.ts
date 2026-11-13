import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { getDriverEarningsSummary, repairMissingEarnings } from '@/lib/earnings';

/** GET /api/driver/earnings — résumé des gains du chauffeur connecté :
 *  aujourd'hui (24 h), semaine, mois, montant dû en temps réel,
 *  dépôt, dette vs plafond, niveau, quêtes, série, badges,
 *  chauffeur de la semaine. Tout est calculé côté serveur depuis
 *  driver_earnings — jamais depuis le client. */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'Cette page est réservée aux chauffeurs.' },
      { status: 403 }
    );
  }
  try {
    // Réparation paresseuse : finalise les courses terminées sans ligne
    // de gains (migration appliquée après la clôture, finalize en échec).
    await repairMissingEarnings(user.id);
    const summary = await getDriverEarningsSummary(user.id);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    console.error('[api/driver/earnings]', err);
    return NextResponse.json(
      { error: 'Gains indisponibles pour le moment. Réessaie.' },
      { status: 500 }
    );
  }
}
