import { createHash } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  decideVerification,
  parseDocumentText,
  type ClientVerificationChecks,
} from '@/lib/verification';
import { logAudit } from '@/lib/audit';
import { ADMIN_EMAIL, isEmailConfigured, sendVerificationTicketEmail } from '@/lib/email';
import { TICKET_KIND_LABELS } from '@/lib/tickets';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 Mo par fichier
const NEW_COLUMNS = ['verification_checks', 'verification_doc_hash', 'verification_image_hash', 'verification_auto_decision'];

/** SHA-256 hex d'un buffer (Node). */
function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** SHA-256 hex du numéro de document normalisé (même recette que le
 *  client : « doc: » + numéro en majuscules, sans séparateurs). */
function docNumberHash(normalized: string): string {
  return sha256Hex(Buffer.from(`doc:${normalized.toUpperCase().replace(/[^A-Z0-9]/g, '')}`, 'utf8'));
}

/** Nettoie les contrôles envoyés par le client : seuls les champs
 *  connus sont repris, avec des types forcés (le client n'est pas
 *  une source de confiance). */
function sanitizeChecks(raw: unknown): ClientVerificationChecks | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pickStr = (v: unknown): string | null => (typeof v === 'string' ? v.slice(0, 4000) : null);
  const pickNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const pickConf = (v: unknown): ClientVerificationChecks['docNumberConfidence'] =>
    v === 'forte' || v === 'moyenne' || v === 'faible' || v === 'absente' ? v : 'absente';
  const isoOrNull = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  const face = r.face === 'detecte' || r.face === 'absent' || r.face === 'indisponible' ? r.face : 'indisponible';
  const ocrConfidence = typeof r.ocrConfidence === 'number' ? Math.round(r.ocrConfidence) : -1;
  return {
    face,
    selfieWidth: pickNum(r.selfieWidth),
    selfieHeight: pickNum(r.selfieHeight),
    documentWidth: pickNum(r.documentWidth),
    documentHeight: pickNum(r.documentHeight),
    ocrConfidence: Math.max(-1, Math.min(100, ocrConfidence)),
    ocrText: pickStr(r.ocrText) ?? '',
    docNumber: pickStr(r.docNumber),
    docNumberConfidence: pickConf(r.docNumberConfidence),
    birthDate: isoOrNull(r.birthDate),
    birthConfidence: pickConf(r.birthConfidence),
    expiryDate: isoOrNull(r.expiryDate),
    expiryConfidence: pickConf(r.expiryConfidence),
    nameOnDoc: pickStr(r.nameOnDoc),
    nameConfidence: pickConf(r.nameConfidence),
    selfieImageHash: pickStr(r.selfieImageHash),
    documentImageHash: pickStr(r.documentImageHash),
    docNumberHash: pickStr(r.docNumberHash),
  };
}

/** POST /api/verification — le chauffeur envoie son selfie + sa pièce
 *  d'identité (CNI, passeport ou permis). Les fichiers partent dans le
 *  bucket privé `driver-documents`, puis la décision est prise
 *  AUTOMATIQUEMENT (v2.4) à partir des contrôles du client (dimensions,
 *  visage, OCR, empreintes) et de vérifications serveur (doublons,
 *  re-parse OCR) :
 *  - tout passe → statut « verifie » (le chauffeur peut se mettre en ligne) ;
 *  - échec clair → statut « refuse » + motif précis (il peut renvoyer) ;
 *  - ambigu → statut « en_attente » + ticket pour l'admin (+ e-mail si
 *    Resend est configuré).
 *  Si la migration v2.4 n'est pas encore appliquée, le dossier retombe
 *  sur l'ancien flux (en_attente, revue manuelle) — jamais de crash. */
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
    .select('role, full_name, email, verification_status')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'chauffeur') {
    return NextResponse.json(
      { error: 'La vérification concerne les comptes chauffeurs.' },
      { status: 403 }
    );
  }
  if (profile.verification_status === 'verifie') {
    return NextResponse.json({ error: 'Ton compte est déjà vérifié.' }, { status: 400 });
  }
  if (profile.verification_status === 'en_attente') {
    return NextResponse.json(
      { error: 'Ta vérification est déjà en cours — attends la décision avant de renvoyer des documents.' },
      { status: 400 }
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Formulaire invalide.' }, { status: 400 });
  }
  const selfie = form.get('selfie');
  const document = form.get('document');
  const documentType = form.get('documentType');
  if (!(selfie instanceof File) || !(document instanceof File)) {
    return NextResponse.json(
      { error: 'Envoie ton selfie ET ta pièce d’identité.' },
      { status: 400 }
    );
  }
  if (!['cni', 'passeport', 'permis'].includes(String(documentType))) {
    return NextResponse.json(
      { error: 'Choisis le type de pièce : CNI, passeport ou permis.' },
      { status: 400 }
    );
  }
  for (const [label, file] of [
    ['selfie', selfie],
    ['pièce d’identité', document],
  ] as const) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: `Le fichier « ${label} » doit être une image (photo).` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Le fichier « ${label} » dépasse 5 Mo.` },
        { status: 400 }
      );
    }
  }

  const checks = sanitizeChecks(
    (() => {
      try {
        const raw = form.get('checks');
        return typeof raw === 'string' ? (JSON.parse(raw) as unknown) : null;
      } catch {
        return null;
      }
    })()
  );

  // Empreintes serveur (re-calculées depuis les fichiers reçus — jamais
  // celles annoncées par le client, qui ne servent qu'à la comparaison).
  const selfieBytes = Buffer.from(await selfie.arrayBuffer());
  const docBytes = Buffer.from(await document.arrayBuffer());
  const selfieHash = sha256Hex(selfieBytes);
  const documentHash = sha256Hex(docBytes);

  const stamp = Date.now();
  const selfieExt = selfie.name.split('.').pop()?.toLowerCase() || 'jpg';
  const docExt = document.name.split('.').pop()?.toLowerCase() || 'jpg';
  const selfiePath = `${user.id}/selfie-${stamp}.${selfieExt}`;
  const docPath = `${user.id}/document-${stamp}.${docExt}`;

  const { error: selfieError } = await supabase.storage
    .from('driver-documents')
    .upload(selfiePath, selfie, { contentType: selfie.type, upsert: false });
  if (selfieError) {
    console.error('[api/verification]', selfieError.message);
    return NextResponse.json(
      { error: 'Envoi du selfie impossible. Réessaie.' },
      { status: 500 }
    );
  }
  const { error: docError } = await supabase.storage
    .from('driver-documents')
    .upload(docPath, document, { contentType: document.type, upsert: false });
  if (docError) {
    console.error('[api/verification]', docError.message);
    await supabase.storage.from('driver-documents').remove([selfiePath]);
    return NextResponse.json(
      { error: 'Envoi de la pièce impossible. Réessaie.' },
      { status: 500 }
    );
  }

  // --- Décision automatique (v2.4) ---
  // Numéro de document : re-parse serveur du texte OCR (le texte brut
  // est re-lu ici, pas seulement les champs annoncés par le client).
  const reparsed = checks ? parseDocumentText(checks.ocrText, profile.full_name ?? null) : null;
  const docNumber = reparsed?.docNumber ?? checks?.docNumber ?? null;
  const serverDocHash = docNumber ? docNumberHash(docNumber) : null;

  // Doublons vérifiés côté serveur (base). Silencieux si les colonnes
  // v2.4 n'existent pas encore : on traite comme « pas de doublon ».
  let duplicateDoc = false;
  let duplicateImage = false;
  try {
    if (serverDocHash) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('verification_doc_hash', serverDocHash)
        .neq('id', user.id)
        .limit(1);
      if (!error && data && data.length > 0) duplicateDoc = true;
    }
    const { data: imgDup, error: imgErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('verification_image_hash', documentHash)
      .neq('id', user.id)
      .limit(1);
    if (!imgErr && imgDup && imgDup.length > 0) duplicateImage = true;
  } catch (err) {
    console.error('[api/verification] doublons indisponibles:', err);
  }

  const imageHashVerified =
    (checks?.selfieImageHash ?? null) === selfieHash &&
    (checks?.documentImageHash ?? null) === documentHash;

  const decision = decideVerification({
    checks,
    accountName: profile.full_name ?? null,
    duplicateDoc,
    duplicateImage,
    imageHashVerified,
  });

  // Statut final : auto-vérifié / auto-refusé / en attente (ticket).
  const nextStatus =
    decision.decision === 'verifie'
      ? 'verifie'
      : decision.decision === 'refuse'
        ? 'refuse'
        : 'en_attente';

  const legacyUpdate = {
    selfie_url: selfiePath,
    id_document_url: docPath,
    id_document_type: String(documentType),
    verification_status: nextStatus,
    verification_note: decision.note,
  };
  const fullUpdate = {
    ...legacyUpdate,
    verification_checks: decision.stored as unknown as Record<string, unknown>,
    verification_doc_hash: serverDocHash,
    verification_image_hash: documentHash,
    verification_auto_decision: decision.decision,
  };

  // Une seule écriture (le trigger v2.4 exige la charge utile complète
  // en même temps que le statut). Si les colonnes v2.4 n'existent pas
  // encore, on retombe sur l'ancien flux (en_attente, revue manuelle).
  let { error } = await supabase.from('profiles').update(fullUpdate).eq('id', user.id);
  const updateErrorMessage = error?.message ?? '';
  if (error && NEW_COLUMNS.some((c) => updateErrorMessage.includes(c))) {
    console.error('[api/verification] colonnes v2.4 absentes — repli manuel:', updateErrorMessage);
    const fallback = await supabase
      .from('profiles')
      .update({ ...legacyUpdate, verification_status: 'en_attente', verification_note: null })
      .eq('id', user.id);
    error = fallback.error;
    if (!error) {
      return NextResponse.json({ ok: true, decision: 'ambigu', fallback: true });
    }
  }
  if (error) {
    // Trigger anti-escalade ou autre refus : on ne laisse pas le
    // chauffeur sans dossier — repli en « en_attente » (revue manuelle).
    console.error('[api/verification] décision auto rejetée — repli manuel:', error.message);
    const fallback = await supabase
      .from('profiles')
      .update({ ...legacyUpdate, verification_status: 'en_attente', verification_note: null })
      .eq('id', user.id);
    if (fallback.error) {
      console.error('[api/verification]', fallback.error.message);
      await supabase.storage.from('driver-documents').remove([selfiePath, docPath]);
      return NextResponse.json(
        { error: 'Enregistrement impossible. Réessaie.' },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, decision: 'ambigu', fallback: true });
  }

  // Journal d'audit (ne bloque jamais la réponse).
  if (decision.decision === 'verifie') {
    await logAudit(supabase, 'verification_auto_verified', {
      actorId: user.id,
      driverName: profile.full_name ?? null,
    });
  } else if (decision.decision === 'refuse') {
    await logAudit(supabase, 'verification_auto_refused', {
      actorId: user.id,
      driverName: profile.full_name ?? null,
      reasons: decision.reasons,
    });
  }

  // Ticket (dossier ambigu ou doublon) + e-mail à l'admin.
  if (decision.ticket) {
    const details: Record<string, unknown> = {
      reasons: decision.reasons,
      checks: decision.stored as unknown as Record<string, unknown>,
    };
    const { data: ticket, error: ticketError } = await supabase
      .from('verification_tickets')
      .insert({
        driver_id: user.id,
        kind: decision.ticket.kind,
        summary: decision.ticket.summary,
        details,
        urgency: decision.ticket.urgency,
        status: 'ouvert',
      })
      .select('id')
      .single();
    if (ticketError || !ticket) {
      console.error('[api/verification] ticket impossible:', ticketError?.message);
    } else {
      await logAudit(supabase, 'verification_ticket_created', {
        actorId: user.id,
        driverName: profile.full_name ?? null,
        kind: decision.ticket.kind,
        urgency: decision.ticket.urgency,
      });
      const sent = await sendVerificationTicketEmail({
        to: ADMIN_EMAIL,
        urgency: decision.ticket.urgency,
        kindLabel: TICKET_KIND_LABELS[decision.ticket.kind] ?? decision.ticket.kind,
        driverName: profile.full_name ?? 'Chauffeur sans nom',
        driverEmail: profile.email ?? '',
        summary: decision.ticket.summary,
        reasons: decision.reasons,
        ticketId: ticket.id as string,
        adminUrl: 'https://stacks-drive.vercel.app/admin',
      });
      if (sent) {
        await supabase
          .from('verification_tickets')
          .update({ email_sent_at: new Date().toISOString() })
          .eq('id', ticket.id);
      } else if (isEmailConfigured()) {
        console.error('[api/verification] e-mail ticket non envoyé (Resend).');
      }
    }
  }

  return NextResponse.json({
    ok: true,
    decision: decision.decision,
    note: decision.note,
  });
}
