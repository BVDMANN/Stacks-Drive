import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { dispatchDueScheduledRides } from '@/lib/rides';
import { requireCronSecret } from '@/lib/cron';

export const dynamic = 'force-dynamic';

/** GET /api/cron/scheduled-dispatch — filet de sécurité des courses
 *  planifiées (v2.30). Protégé par CRON_SECRET, comme les autres
 *  routes cron.
 *
 *  Normalement INUTILE : l'envoi ~15 min avant l'heure prévue est
 *  déclenché par le sondage existant des demandes entrantes (chaque
 *  chauffeur en ligne sonde toutes les 10 s — voir
 *  `dispatchDueScheduledRides` dans lib/rides.ts). Cette route
 *  n'existe que pour le cas où aucun chauffeur ne serait en ligne au
 *  moment de l'envoi : programmer un appel toutes les 5 min dans
 *  Vercel (ajouter une entrée dans `vercel.json`) ne devient utile
 *  qu'à ce moment-là — ce n'est PAS fait par défaut, aucun nouveau
 *  cron n'est ajouté par ce lot. Idempotent : rappeler la route ne
 *  renvoie jamais deux fois la même course. */
export async function GET(request: NextRequest) {
  const auth = requireCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const result = await dispatchDueScheduledRides(supabase);
  return NextResponse.json({ ok: true, ...result });
}
