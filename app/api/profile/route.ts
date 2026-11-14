import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient, hasDriverAccount } from '@/lib/supabase/server';
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
  /** v2.34 — climatisation déclarée (classe Confort : clim garantie). */
  hasAirConditioning: z.boolean().optional(),
  /** v2.19 — places libres déclarées (0 à 9, jamais au-dessus de la
   *  capacité du véhicule). */
  freeSeats: z.number().int().min(0).max(9).optional(),
  isOnline: z.boolean().optional(),
  /** Bascule de mode Passager / Chauffeur (même compte). */
  role: z.enum(['passager', 'chauffeur']).optional(),
  /** Quartier où se trouve le chauffeur quand il est en ligne. */
  currentArea: z.enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]]).optional(),
  /** Lieux favoris (v2.30) : domicile / travail — quartier + précision
   *  libre, effaçables (null = supprimer). */
  homeNeighborhood: z
    .enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]])
    .optional()
    .nullable(),
  homeDetail: z.string().trim().max(120).optional().nullable(),
  workNeighborhood: z
    .enum(NEIGHBORHOODS as unknown as [Neighborhood, ...Neighborhood[]])
    .optional()
    .nullable(),
  workDetail: z.string().trim().max(120).optional().nullable(),
  // Réservé à l'admin : vérification d'un chauffeur (driverId requis).
  driverId: z.string().uuid().optional(),
  verificationStatus: z.enum(['verifie', 'refuse']).optional(),
  verificationNote: z.string().trim().max(300).optional(),
});

/** GET /api/profile — son propre profil (lecture minimale, v2.34) :
 *  rôle + climatisation déclarée (classe Confort). */
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
    .select('role, has_air_conditioning')
    .eq('id', user.id)
    .single();
  if (!profile) return NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
  return NextResponse.json({
    ok: true,
    role: (profile as { role: string }).role,
    hasAirConditioning:
      (profile as { has_air_conditioning?: boolean | null }).has_air_conditioning ?? false,
  });
}

/** PATCH /api/profile — modifier son propre profil (véhicule, mode,
 *  zone, en ligne) ; un admin peut valider ou refuser la vérification
 *  d'un chauffeur (driverId + verificationStatus + motif éventuel).
 *  Règle 2 (v2.17) : la bascule en mode Chauffeur exige un compte
 *  chauffeur créé (sinon 403 `driver_account_required`), et la mise en
 *  ligne exige un compte chauffeur vérifié (sinon 403
 *  `driver_verification_required`) — aucun contournement par appel
 *  API direct. Basculer en mode Passager met le compte hors ligne. */
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

  // Profil de l'appelant (rôle, vérification, dossier chauffeur) :
  // c'est lui qui décide des verrous de la règle 2 (v2.17) ci-dessous.
  const { data: caller } = await supabase
    .from('profiles')
    .select(
      'role, verification_status, selfie_url, id_document_url, is_verified, is_admin, seats, free_seats, fraud_blocked, selfie_recheck_required, last_selfie_check_at'
    )
    .eq('id', user.id)
    .single();

  // Vérification d'un chauffeur : admin uniquement.
  if (v.driverId !== undefined || v.verificationStatus !== undefined) {
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
        // Règle 2 (v2.17) : un chauffeur refusé ne reste pas en ligne —
        // il doit renvoyer ses documents et être vérifié à nouveau.
        ...(v.verificationStatus === 'refuse' ? { is_online: false } : {}),
      })
      .eq('id', v.driverId);
    if (error) {
      console.error('[api/profile]', error.message);
      return NextResponse.json(
        { error: 'Modification impossible pour le moment.' },
        { status: 500 }
      );
    }
    // v2.4 — une décision manuelle résout aussi les tickets ouverts du
    // chauffeur (sinon le ticket resterait ouvert après la décision).
    try {
      await supabase
        .from('verification_tickets')
        .update({
          status: 'resolu',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq('driver_id', v.driverId)
        .eq('status', 'ouvert');
    } catch {
      // Table v2.4 absente : rien à résoudre.
    }
    // Parrainage (v2.25, lot C) : une validation manuelle crée aussi le
    // code du chauffeur — meilleur effort, jamais bloquant.
    if (v.verificationStatus === 'verifie') {
      try {
        const { ensureReferralCode } = await import('@/lib/driver-lifecycle');
        const { data: target } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', v.driverId)
          .single();
        await ensureReferralCode(
          supabase,
          v.driverId,
          (target as { full_name?: string | null } | null)?.full_name ?? null
        );
      } catch {
        // Sans migration v2.25 : pas de code, rien de bloquant.
      }
    }
    return NextResponse.json({ ok: true });
  }

  // --- Règle 2 (v2.17) — verrouillage du switch Passager → Chauffeur,
  //  côté serveur (aucun contournement par appel API direct) ---
  // Bascule en mode Chauffeur : exige un compte chauffeur créé (voir
  // hasDriverAccount). Sans dossier chauffeur, le passager doit créer
  // son compte via « Devenir chauffeur » (inscription chauffeur +
  // vérification) — il ne peut pas se proclamer chauffeur.
  if (v.role === 'chauffeur' && caller?.role !== 'chauffeur' && !hasDriverAccount(caller)) {
    return NextResponse.json(
      {
        error:
          'Crée d’abord ton compte chauffeur (inscription chauffeur + vérification selfie et pièce d’identité) pour passer en mode Chauffeur.',
        code: 'driver_account_required',
      },
      { status: 403 }
    );
  }
  // Mise en ligne : exige un compte chauffeur VÉRIFIÉ (is_verified).
  // Le rôle résultant compte : une bascule + mise en ligne dans la
  // même requête n'ouvre rien si le compte n'est pas vérifié.
  const resultingRole = v.role ?? caller?.role ?? 'passager';
  if (v.isOnline === true && (resultingRole !== 'chauffeur' || !caller?.is_verified)) {
    return NextResponse.json(
      {
        error:
          'Fais vérifier ton compte chauffeur (selfie + pièce d’identité) avant de te mettre en ligne.',
        code: 'driver_verification_required',
      },
      { status: 403 }
    );
  }
  // Blocage temporaire pour fraude (v2.26) : le compte « à vérifier »
  // ne peut pas se remettre en ligne tant que l'administrateur ne
  // l'a pas débloqué dans /admin. Le paiement et la dette ne sont
  // pas touchés — seule la mise en ligne est coupée. Sans la
  // migration v2.26, `fraud_blocked` est absent (undefined) : le
  // verrou est inactif, rien d'autre ne change.
  if (v.isOnline === true && (caller as { fraud_blocked?: boolean } | null)?.fraud_blocked === true) {
    return NextResponse.json(
      {
        error:
          'Ton compte est à vérifier : contacte l’administrateur pour le débloquer avant de te remettre en ligne.',
        code: 'fraud_blocked',
      },
      { status: 403 }
    );
  }
  // Re-vérification selfie ponctuelle (v2.30) : drapeau posé par
  // l'admin (après un signalement) ou par le balayage hebdo (dernier
  // contrôle vieux de plus de 30 jours) — le chauffeur doit refaire
  // un selfie (contrôle de présence d'un visage, jamais de
  // reconnaissance faciale) avant de se remettre en ligne. Sans la
  // migration v2.30, les champs sont absents : le verrou est inactif.
  if (v.isOnline === true) {
    const { isSelfieRecheckDue } = await import('@/lib/selfie-recheck');
    if (
      isSelfieRecheckDue(
        caller as {
          selfie_recheck_required?: boolean | null;
          last_selfie_check_at?: string | null;
        } | null
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Refais un selfie de vérification avant de te mettre en ligne (contrôle ponctuel — un visage suffit, aucune reconnaissance faciale).',
          code: 'selfie_recheck_required',
        },
        { status: 403 }
      );
    }
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
  if (v.hasAirConditioning !== undefined) patch.has_air_conditioning = v.hasAirConditioning;
  // v2.19 — places libres : jamais au-dessus de la capacité du
  // véhicule (capacité de la requête, sinon celle du profil).
  const capacity = v.seats ?? (caller as { seats?: number | null } | null)?.seats ?? null;
  if (v.freeSeats !== undefined) {
    if (capacity !== null && v.freeSeats > capacity) {
      return NextResponse.json(
        { error: `Ton véhicule a ${capacity} place${capacity > 1 ? 's' : ''} : tu ne peux pas déclarer plus de places libres.` },
        { status: 400 }
      );
    }
    patch.free_seats = v.freeSeats;
  }
  // Capacité réduite sous les places libres actuelles : on borne les
  // places libres à la nouvelle capacité (jamais de places fantômes).
  if (
    v.seats !== undefined &&
    v.freeSeats === undefined &&
    (caller as { free_seats?: number | null } | null)?.free_seats !== null &&
    (caller as { free_seats?: number | null } | null)?.free_seats !== undefined &&
    ((caller as { free_seats: number }).free_seats as number) > v.seats
  ) {
    patch.free_seats = v.seats;
  }
  if (v.isOnline !== undefined) patch.is_online = v.isOnline;
  if (v.role !== undefined) patch.role = v.role;
  // Lieux favoris (v2.30) : quartier + précision libre, effaçables
  // (null = supprimer le lieu). La colonne manquante (migration
  // v2.30 non appliquée) est retirée en repli ci-dessous.
  if (v.homeNeighborhood !== undefined) patch.home_neighborhood = v.homeNeighborhood;
  if (v.homeDetail !== undefined) patch.home_detail = v.homeDetail || null;
  if (v.workNeighborhood !== undefined) patch.work_neighborhood = v.workNeighborhood;
  if (v.workDetail !== undefined) patch.work_detail = v.workDetail || null;
  // Bascule en mode Passager : le compte n'est plus en ligne — un
  // compte en mode passager ne doit jamais rester « en ligne ».
  if (v.role === 'passager') patch.is_online = false;
  // v2.19 — mise en ligne avec des places jamais déclarées : on part
  // de la capacité entière libre (même règle que le trigger
  // sync_free_seats de la migration v2.19 — l'API couvre le cas où
  // la migration n'est pas encore appliquée).
  if (
    v.isOnline === true &&
    v.freeSeats === undefined &&
    patch.free_seats === undefined &&
    ((caller as { free_seats?: number | null } | null)?.free_seats ?? null) === null &&
    capacity !== null
  ) {
    patch.free_seats = capacity;
  }
  if (v.currentArea !== undefined) {
    patch.current_area = v.currentArea;
    // Position approximative = centre du quartier (carte + radar).
    const { NEIGHBORHOOD_COORDS } = await import('@/lib/neighborhoods');
    const coords = NEIGHBORHOOD_COORDS[v.currentArea];
    patch.last_lat = coords.lat;
    patch.last_lng = coords.lng;
  }

  let { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id);
  // Migration v2.19 pas encore appliquée : on enregistre le profil
  // sans les places libres (la mise en ligne reste valable, les
  // places sont alors déduites des courses en cours).
  if (error && error.code === '42703' && 'free_seats' in patch) {
    delete patch.free_seats;
    ({ error } = await supabase.from('profiles').update(patch).eq('id', user.id));
  }
  // Migration v2.30 pas encore appliquée : on enregistre le profil
  // sans les lieux favoris (le reste — véhicule, mode, en ligne —
  // est conservé).
  if (error && error.code === '42703') {
    const favKeys = ['home_neighborhood', 'home_detail', 'work_neighborhood', 'work_detail'];
    if (favKeys.some((k) => k in patch)) {
      favKeys.forEach((k) => delete patch[k]);
      ({ error } = await supabase.from('profiles').update(patch).eq('id', user.id));
    }
  }
  if (error) {
    console.error('[api/profile]', error.message);
    return NextResponse.json(
      { error: 'Modification impossible pour le moment.' },
      { status: 500 }
    );
  }
  // Dernière mise en ligne (v2.25, lot C) : posée ici aussi, au cas
  // où le trigger `track_last_online` ne serait pas encore appliqué —
  // c'est elle qui définit l'inactivité (7 jours sans mise en ligne).
  // Meilleur effort : colonne absente = abandon silencieux.
  if (v.isOnline === true) {
    try {
      await supabase
        .from('profiles')
        .update({ last_online_at: new Date().toISOString() })
        .eq('id', user.id);
    } catch {
      // Migration v2.25 non appliquée : rien de bloquant.
    }
  }
  return NextResponse.json({ ok: true });
}
