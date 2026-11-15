/** Remboursement de la caution — déclenchement manuel (v2.55).
 *
 *  POST { driverId? } — le chauffeur (sa propre caution) ou
 *  l'admin (n'importe quel chauffeur). Applique les règles CGU §7 :
 *  - fraude confirmée (admin, body { forfeit: true, reason }) ->
 *    confiscation, aucun remboursement ;
 *  - dette impayée -> déduite du remboursement ;
 *  - sinon remboursement intégral (5 000 FCFA) sur la carte
 *    d'origine, sous 5 à 10 jours ouvrés.
 *  Le remboursement automatique au départ passe par
 *  POST /api/driver/leave (même fonction, lib/card-ledger.ts).
 *  ANTI-DOUBLE-DÉCLENCHEMENT : un chauffeur ne peut se rembourser
 *  lui-même qu'APRÈS son départ (driver_left_at renseigné) — le
 *  départ normal passe par « Quitter » (POST /api/driver/leave),
 *  le cron quotidien réessaie ensuite tant que ce n'est pas
 *  effectif. L'admin reste exempt (relance manuelle après un
 *  échec, confiscation). Le claim atomique de lib/card-ledger.ts
 *  protège en plus contre deux déclencheurs concurrents.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/supabase/server';
import { refundDriverDeposit } from '@/lib/card-ledger';

const BodySchema = z.object({
  driverId: z.string().uuid().optional(),
  forfeit: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Connexion requise.' }, { status: 401 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Demande invalide.' }, { status: 400 });
  }
  const driverId = parsed.data.driverId ?? sessionUser.id;
  const isAdmin = Boolean(sessionUser.profile?.is_admin);
  if (driverId !== sessionUser.id && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Non autorisé.' }, { status: 403 });
  }
  if (parsed.data.forfeit && !isAdmin) {
    return NextResponse.json({ ok: false, error: 'Confiscation réservée à l’admin.' }, { status: 403 });
  }
  // Garde anti-double-déclencheur : le chauffeur ne se rembourse
  // lui-même qu'après son départ (le départ normal passe par
  // « Quitter »). L'admin reste exempt.
  if (!isAdmin && driverId === sessionUser.id && !sessionUser.profile?.driver_left_at) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Le remboursement de ta caution se déclenche automatiquement quand tu quittes — utilise « Quitter » dans ton tableau de bord.',
      },
      { status: 403 }
    );
  }

  const result = await refundDriverDeposit(driverId, {
    adminForfeit: parsed.data.forfeit ?? false,
    forfeitReason: parsed.data.reason,
  });
  if (!result.refunded && result.amount === 0 && result.note.includes('Aucune caution')) {
    return NextResponse.json({ ok: false, error: result.note }, { status: 400 });
  }
  return NextResponse.json({ ok: true, ...result });
}
