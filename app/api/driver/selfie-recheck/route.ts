import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { logAudit } from '@/lib/audit';
import { ADMIN_EMAIL, isEmailConfigured, sendVerificationTicketEmail } from '@/lib/email';
import { TICKET_KIND_LABELS } from '@/lib/verification';

const RecheckSchema = z.object({
  /** Résultat du contrôle de présence d'un visage, calculé côté
   *  client (détection v2.4, FaceDetector natif) — jamais une
   *  reconnaissance faciale : aucune comparaison avec le selfie
   *  d'origine, aucune identification. */
  face: z.enum(['detecte', 'absent', 'indisponible']),
});

/** POST /api/driver/selfie-recheck — refaire un selfie de contrôle
 *  (v2.30, plancher P1).
 *
 *  Le chauffeur envoie un selfie (multipart, champ `selfie`) + le
 *  résultat du contrôle de présence d'un visage (`face`, calculé côté
 *  client). La photo N'EST PAS conservée : seule l'empreinte SHA-256
 *  est calculée (anti-doublon, comme en v2.4) puis oubliée avec le
 *  fichier — aucun stockage, aucune comparaison biométrique.
 *
 *  - visage détecté → drapeau levé, `last_selfie_check_at` posé :
 *    le chauffeur peut se remettre en ligne ;
 *  - aucun visage → le drapeau RESTE, un ticket `visage_non_detecte`
 *    part dans la file admin (v2.4, e-mail admin) : c'est un humain
 *    qui tranche, jamais de blocage définitif automatique ;
 *  - détection indisponible sur l'appareil (v2.4 : un contrôle
 *    technique ne bloque jamais le chauffeur) → drapeau levé, le
 *    résultat est consigné pour l'admin.
 *  Sans la migration v2.30 (colonnes absentes), la re-vérification
 *  est inactive : la route répond OK sans rien changer. */
export async function POST(request: NextRequest) {
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
    .select('role, full_name, email, selfie_recheck_required')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json({ error: 'Réservé aux chauffeurs.' }, { status: 403 });
  }
  const form = await request.formData().catch(() => null);
  const selfie = form?.get('selfie');
  const parsed = RecheckSchema.safeParse({ face: form?.get('face') });
  if (!form || !(selfie instanceof File) || selfie.size === 0 || !parsed.success) {
    return NextResponse.json(
      { error: 'Envoie un selfie (photo) pour le contrôle.' },
      { status: 400 }
    );
  }
  const face = parsed.data.face;
  // Empreinte du fichier (anti-doublon, comme en v2.4) — la photo
  // elle-même n'est ni stockée ni conservée.
  let imageHash: string | null = null;
  try {
    const buf = await selfie.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    imageHash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    imageHash = null;
  }

  // Sans la migration v2.30, le drapeau n'existe pas : rien à lever.
  if ((profile as { selfie_recheck_required?: boolean | null }).selfie_recheck_required !== true) {
    return NextResponse.json({ ok: true, recheck: 'not_required' });
  }

  if (face === 'absent') {
    // Doute → ticket admin (file v2.4), pas de blocage définitif.
    const { data: ticket } = await supabase
      .from('verification_tickets')
      .insert({
        driver_id: user.id,
        kind: 'visage_non_detecte',
        summary: 'Re-vérification selfie : aucun visage détecté sur le nouveau selfie.',
        details: { recheck: true, face, image_hash: imageHash },
        urgency: 'moyenne',
        status: 'ouvert',
      })
      .select('id')
      .single();
    await logAudit(supabase, 'selfie_recheck_ambiguous', {
      actorId: user.id,
      ticketId: ticket?.id ?? null,
    });
    if (ticket?.id) {
      const sent = await sendVerificationTicketEmail({
        to: ADMIN_EMAIL,
        urgency: 'moyenne',
        kindLabel: TICKET_KIND_LABELS.visage_non_detecte,
        driverName: profile.full_name ?? 'Chauffeur sans nom',
        driverEmail: profile.email ?? '',
        summary: 'Re-vérification selfie : aucun visage détecté sur le nouveau selfie.',
        reasons: ['face_absent'],
        ticketId: ticket.id as string,
        adminUrl: 'https://stacks-drive.vercel.app/admin',
      });
      if (sent) {
        await supabase
          .from('verification_tickets')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', ticket.id);
      } else if (isEmailConfigured()) {
        console.error('[api/driver/selfie-recheck] e-mail ticket non envoyé (Resend).');
      }
    }
    return NextResponse.json(
      {
        ok: true,
        recheck: 'ambiguous',
        message:
          'Aucun visage détecté : ton dossier est transmis à l’administrateur, qui va le vérifier. Reprends un selfie bien éclairé, visage visible, et renvoie-le.',
      },
      { status: 202 }
    );
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      selfie_recheck_required: false,
      selfie_recheck_reason: null,
      last_selfie_check_at: new Date().toISOString(),
    })
    .eq('id', user.id);
  if (error) {
    console.error('[api/driver/selfie-recheck]', error.message);
    return NextResponse.json({ error: 'Enregistrement impossible.' }, { status: 500 });
  }
  await logAudit(supabase, 'selfie_recheck_passed', {
    actorId: user.id,
    face,
    imageHash,
  });
  return NextResponse.json({ ok: true, recheck: 'passed' });
}
