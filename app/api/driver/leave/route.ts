/** Départ d'un chauffeur (v2.55).
 *
 *  POST — chauffeur : ferme son compte chauffeur (mise hors
 *  ligne, date de départ enregistrée) et déclenche le
 *  REMBOURSEMENT AUTOMATIQUE de sa caution carte si elle a été
 *  versée par carte (intégral, sauf dette déduite ou fraude
 *  confirmée — CGU §7). Le remboursement arrive sur sa carte
 *  sous 5 à 10 jours ouvrés. Si le remboursement échoue
 *  (Stripe indisponible), le cron quotidien réessaie : le départ
 *  reste enregistré et la caution reste 'paye' jusqu'au
 *  remboursement effectif.
 */
import { NextResponse } from 'next/server';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { refundDriverDeposit } from '@/lib/card-ledger';
import { logAudit } from '@/lib/audit';

export async function POST() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ ok: false, error: 'Connexion requise.' }, { status: 401 });
  }
  if (!sessionUser.profile || sessionUser.profile.role !== 'chauffeur') {
    return NextResponse.json({ ok: false, error: 'Réservé aux chauffeurs.' }, { status: 403 });
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ driver_left_at: new Date().toISOString(), is_online: false })
    .eq('id', sessionUser.id);
  if (error) {
    return NextResponse.json({ ok: false, error: 'Départ impossible pour le moment.' }, { status: 500 });
  }

  await logAudit(supabase, 'driver_left', {
    actorId: sessionUser.id,
    details: { driver: sessionUser.id },
  }).catch(() => undefined);

  const refund = await refundDriverDeposit(sessionUser.id);
  return NextResponse.json({
    ok: true,
    message:
      'Ton compte chauffeur est fermé. ' +
      (refund.refunded
        ? refund.note
        : 'Ta caution sera remboursée automatiquement — tu seras informé quand le remboursement partira.'),
    refund,
  });
}
