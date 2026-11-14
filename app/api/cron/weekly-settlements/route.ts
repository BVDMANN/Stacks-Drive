import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { requireCronSecret } from '@/lib/cron';
import { notifyAdminAlert } from '@/lib/admin-alerts';
import { lastCompletedWeek, formatWeekLabel } from '@/lib/settlements';

export const dynamic = 'force-dynamic';

/** GET /api/cron/weekly-settlements — relevés hebdo du lundi (cron Vercel,
 *  chaque lundi ~7h, heure de Libreville).
 *
 *  Génère le relevé de la semaine TERMINÉE (lundi → dimanche) pour chaque
 *  chauffeur ayant fait au moins une course : courses, commission due de
 *  la semaine, dette totale, dépôt. Idempotent (ON CONFLICT DO NOTHING) :
 *  rappeler la route ne duplique rien.
 *
 *  Protégé par CRON_SECRET (Vercel envoie `Authorization: Bearer
 *  <CRON_SECRET>`). Sans secret configuré : 503. La route n'a pas de
 *  session utilisateur : l'insertion passe par la fonction SECURITY
 *  DEFINER generate_weekly_settlements() (migration v2.15). */
export async function GET(request: NextRequest) {
  const auth = requireCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }

  const { weekStart, weekEnd } = lastCompletedWeek();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('generate_weekly_settlements', {
    p_week_start: weekStart,
  });
  if (error) {
    console.error('[cron/weekly-settlements]', error.message);
    // Cron en échec (v2.24) : une seule alerte par route et par jour.
    await notifyAdminAlert({
      kind: 'cron_failed',
      key: `cron-failed:weekly-settlements:${new Date().toISOString().slice(0, 10)}`,
      detail: `La route /api/cron/weekly-settlements a échoué : ${error.message}`,
    });
    return NextResponse.json({ error: 'Génération impossible.' }, { status: 500 });
  }

  const generated = typeof data === 'number' ? data : 0;
  // Pas de journal d'audit ici : la route cron n'a pas de session, la
  // RLS refuserait l'insertion — la trace, c'est la table
  // weekly_settlements elle-même (+ ce log serveur).
  console.log(
    `[cron/weekly-settlements] ${generated} relevé(s) généré(s) pour ${formatWeekLabel(weekStart, weekEnd)}.`
  );
  return NextResponse.json({
    ok: true,
    weekStart,
    weekEnd,
    generated,
  });
}
