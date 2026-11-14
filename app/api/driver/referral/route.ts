import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  REFERRAL_BONUS_REFEREE_POINTS,
  REFERRAL_BONUS_REFERRER_POINTS,
  REFERRAL_MILESTONE_RIDES,
  ensureReferralCode,
  generateReferralCode,
} from '@/lib/driver-lifecycle';

export const dynamic = 'force-dynamic';

/** Parrainage chauffeurs (v2.25, lot C) — SILENCIEUX : jamais annoncé
 *  sur les pages publiques. Visible uniquement ici (tableau de bord
 *  chauffeur) et côté admin.
 *
 *  Règle : chaque chauffeur VÉRIFIÉ a un code unique. Quand son filleul
 *  est vérifié ET a terminé 5 courses, le parrain gagne 1 000 points
 *  et le filleul 500 points (système existant : 100 points/course,
 *  10 000 points = 5 courses sans commission). Les bonus sont crédités
 *  par le cron hebdo (`/api/cron/weekly-report`, fonction SQL
 *  `credit_referral_bonus`) — jamais depuis le client.
 *
 *  GET : mon code + mes filleuls (nom, vérifié, courses terminées,
 *  bonus versé ou non). POST { code } : enregistrer un parrainage
 *  (code saisi après l'inscription — à l'inscription, le code passe
 *  par les métadonnées, voir `handle_new_user` v2.25). */

interface ReferralRow {
  referee_id: string;
  referral_code: string;
  created_at: string;
  rewarded_at: string | null;
}

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, is_verified, referral_code, referred_by')
    .eq('id', user.id)
    .single();
  if (!profile || (profile as { role?: string }).role !== 'chauffeur') {
    return NextResponse.json({ error: 'Réservé aux chauffeurs.' }, { status: 403 });
  }
  const p = profile as {
    full_name: string | null;
    is_verified: boolean;
    referral_code: string | null;
    referred_by: string | null;
  };

  // Code garanti pour un chauffeur vérifié (fonction SQL, sinon calcul
  // local). Un chauffeur non vérifié n'a pas encore de code à partager :
  // on lui montre quand même son futur code en lecture seule, grisé
  // côté client (il ne parraine qu'une fois vérifié).
  let code: string | null = p.referral_code ?? null;
  if (p.is_verified && !code) {
    code = await ensureReferralCode(supabase, user.id, p.full_name);
  }
  if (!code) code = generateReferralCode(p.full_name, user.id);

  // Mes filleuls (table v2.25 absente = liste vide, jamais de crash).
  let referrals: {
    refereeName: string | null;
    verified: boolean;
    completedRides: number;
    rewarded: boolean;
    createdAt: string;
  }[] = [];
  try {
    const { data, error } = await supabase
      .from('driver_referrals')
      .select('referee_id, referral_code, created_at, rewarded_at')
      .eq('referrer_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      const rows = data as ReferralRow[];
      const refereeIds = rows.map((r) => r.referee_id);
      let profilesById = new Map<string, { full_name: string | null; is_verified: boolean }>();
      let ridesByDriver = new Map<string, number>();
      if (refereeIds.length > 0) {
        const [{ data: profs }, { data: earnings }] = await Promise.all([
          supabase.from('profiles').select('id, full_name, is_verified').in('id', refereeIds),
          supabase.from('driver_earnings').select('driver_id').in('driver_id', refereeIds),
        ]);
        (profs ?? []).forEach((row: { id: string; full_name: string | null; is_verified: boolean }) =>
          profilesById.set(row.id, { full_name: row.full_name, is_verified: row.is_verified })
        );
        (earnings ?? []).forEach((row: { driver_id: string }) =>
          ridesByDriver.set(row.driver_id, (ridesByDriver.get(row.driver_id) ?? 0) + 1)
        );
      }
      referrals = rows.map((r) => ({
        refereeName: profilesById.get(r.referee_id)?.full_name ?? null,
        verified: profilesById.get(r.referee_id)?.is_verified ?? false,
        completedRides: ridesByDriver.get(r.referee_id) ?? 0,
        rewarded: r.rewarded_at !== null,
        createdAt: r.created_at,
      }));
    }
  } catch {
    // Table absente (migration non appliquée) : liste vide.
  }

  return NextResponse.json({
    ok: true,
    code,
    verified: p.is_verified,
    hasReferrer: p.referred_by !== null,
    milestoneRides: REFERRAL_MILESTONE_RIDES,
    referrerBonusPoints: REFERRAL_BONUS_REFERRER_POINTS,
    refereeBonusPoints: REFERRAL_BONUS_REFEREE_POINTS,
    referrals,
  });
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, error: 'Supabase n’est pas configuré.' }, { status: 503 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });
  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code || !/^SD-[A-Z]+-[A-F0-9]{4,8}$/.test(code)) {
    return NextResponse.json({ error: 'Code de parrainage invalide.' }, { status: 400 });
  }
  // Sécurité : on ne peut pas se parrainer soi-même (le code calculé
  // localement est vérifié aussi côté SQL — `record_referral` refuse
  // id = parrain).
  const { data: me } = await supabase
    .from('profiles')
    .select('full_name, referral_code, referred_by')
    .eq('id', user.id)
    .single();
  const myCode =
    (me as { referral_code?: string | null } | null)?.referral_code ??
    generateReferralCode(
      (me as { full_name?: string | null } | null)?.full_name ?? null,
      user.id
    );
  if (code === myCode) {
    return NextResponse.json({ error: 'Tu ne peux pas utiliser ton propre code.' }, { status: 400 });
  }
  if ((me as { referred_by?: string | null } | null)?.referred_by) {
    return NextResponse.json({ error: 'Tu as déjà un parrain.' }, { status: 400 });
  }
  try {
    const { data, error } = await supabase.rpc('record_referral', { p_code: code });
    if (error) {
      console.error('[api/driver/referral]', error.message);
      return NextResponse.json({ error: 'Parrainage impossible pour le moment.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json(
        { error: 'Code inconnu ou parrain non vérifié.' },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, referrerId: data as string });
  } catch (err) {
    console.error('[api/driver/referral]', err);
    return NextResponse.json({ error: 'Parrainage impossible pour le moment.' }, { status: 500 });
  }
}
