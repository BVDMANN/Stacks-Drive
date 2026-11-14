import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';

/** POST /api/notify-me — liste d'attente « préviens-moi »
 *  (v2.32, écran hors zone).
 *
 *  N'importe quel visiteur peut s'inscrire (connecté ou non —
 *  l'écran hors zone s'affiche aussi aux visiteurs) : e-mail +
 *  consentement explicite obligatoires, ville / pays en
 *  best-effort. JAMAIS de coordonnées précises : la route refuse
 *  tout champ `lat` / `lng` et la table `area_waitlist` n'a
 *  aucune colonne de position. Un e-mail déjà inscrit renvoie
 *  `ok: true, already: true` (pas d'erreur, pas de doublon —
 *  unicité sur l'e-mail en base).
 *
 *  Sans Supabase configuré ou sans la migration v2.32 : 503
 *  explicite (jamais d'inscription silencieusement perdue). */

const NotifySchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    consent: z.literal(true, {
      errorMap: () => ({
        message: 'Le consentement est requis pour être prévenu par e-mail.',
      }),
    }),
    city: z.string().trim().max(80).nullable().optional(),
    country: z.string().trim().max(80).nullable().optional(),
  })
  .strict();

export async function POST(request: NextRequest) {
  // Validation d'abord : une demande invalide renvoie 400 même
  // sans Supabase configuré (jamais de 503 pour une mauvaise entrée).
  const body = await request.json().catch(() => null);
  const parsed = NotifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 400 }
    );
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Service indisponible pour le moment. Réessaie dans quelques instants.' },
      { status: 503 }
    );
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('area_waitlist').insert({
    email: v.email,
    city: v.city ?? null,
    country: v.country ?? null,
    consent: true,
  });
  if (error) {
    // E-mail déjà inscrit (unicité) : succès idempotent.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, already: true });
    }
    // Table absente (migration v2.32 non appliquée) : 503 explicite.
    if ((error as { code?: string }).code === '42P01' || error.message.includes('area_waitlist')) {
      return NextResponse.json(
        { ok: false, error: 'Service indisponible pour le moment. Réessaie dans quelques instants.' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: 'Envoi impossible pour le moment. Réessaie dans quelques instants.' },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, already: false });
}
