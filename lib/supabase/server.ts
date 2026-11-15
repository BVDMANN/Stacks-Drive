import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config';

/** Client Supabase côté serveur (cookies — anon key uniquement). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Appelé depuis un Server Component : l'écriture des cookies est
          // gérée par le proxy (middleware) qui rafraîchit la session.
        }
      },
    },
  });
}

export type ProfileRole = 'passager' | 'chauffeur';

export interface SessionProfile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: ProfileRole;
  vehicle_type: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_color: string | null;
  plate: string | null;
  seats: number | null;
  /** v2.19 — places libres déclarées (NULL = jamais déclarées). */
  free_seats: number | null;
  is_online: boolean;
  is_verified: boolean;
  is_admin: boolean;
  is_demo: boolean;
  verification_status: string | null;
  selfie_url: string | null;
  id_document_url: string | null;
  id_document_type: string | null;
  verification_note: string | null;
  /** v2.30 — lieux favoris (quartier + précision libre, effaçables). */
  home_neighborhood: string | null;
  home_detail: string | null;
  work_neighborhood: string | null;
  work_detail: string | null;
  /** v2.30 — re-vérification selfie ponctuelle. */
  selfie_recheck_required: boolean;
  selfie_recheck_reason: string | null;
  last_selfie_check_at: string | null;
  current_area: string | null;
  last_lat: number | null;
  last_lng: number | null;
  created_at: string;
}

/** Règle 2 (v2.17) — « compte chauffeur créé » : le compte a un
 *  dossier chauffeur. C'est le cas quand le rôle est déjà chauffeur,
 *  ou quand un dossier de vérification existe (en attente, vérifié ou
 *  refusé — un tel dossier ne peut exister que via le parcours
 *  chauffeur, la vérification exigeant le rôle chauffeur), ou quand
 *  des documents de vérification sont enregistrés. Un passager sans
 *  aucun dossier chauffeur n'a PAS de compte chauffeur : le switch
 *  vers le mode Chauffeur lui est interdit (voir ModeToggle et
 *  PATCH /api/profile) — il doit d'abord créer son compte chauffeur
 *  via « Devenir chauffeur » (inscription chauffeur + vérification).
 *  À ne pas confondre avec « vérifié » (is_verified) : un chauffeur
 *  refusé ou en attente garde son compte chauffeur (il peut repasser
 *  en mode Chauffeur pour renvoyer ses documents) mais ne peut pas
 *  se mettre en ligne tant qu'il n'est pas vérifié. */
export function hasDriverAccount(
  profile:
    | Pick<SessionProfile, 'role' | 'verification_status' | 'selfie_url' | 'id_document_url'>
    | null
    | undefined
): boolean {
  if (!profile) return false;
  if (profile.role === 'chauffeur') return true;
  if ((profile.verification_status ?? 'non_verifie') !== 'non_verifie') return true;
  if (profile.selfie_url !== null || profile.id_document_url !== null) return true;
  return false;
}

/** v2.45 — « compte admin = admin uniquement » : le compte admin est
 *  un troisième rôle, séparé — ni chauffeur, ni passager. Un compte
 *  `is_admin` ne peut ni commander de course, ni devenir chauffeur,
 *  ni se mettre en ligne, ni recevoir de proposition, et n'apparaît
 *  dans aucune liste de chauffeurs ni dans aucun compteur de
 *  chauffeurs ou de passagers (/admin, /admin/live). Le drapeau
 *  `is_admin` est la seule source de vérité : aucun e-mail ni nom
 *  n'est jamais codé en dur. Les verrous vivent côté serveur (routes
 *  API + listes + compteurs) et dans l'interface (redirection vers
 *  /admin, bascule de rôle masquée) — même logique que la règle 2. */
export function isAdminAccount(
  profile: Pick<SessionProfile, 'is_admin'> | null | undefined
): boolean {
  return profile?.is_admin === true;
}

/** Utilisateur connecté + son profil public. Retourne null si non connecté
 *  ou si Supabase n'est pas configuré. */
export async function getSessionUser(): Promise<{
  id: string;
  email: string;
  profile: SessionProfile | null;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return {
    id: user.id,
    email: user.email ?? '',
    profile: (profile as SessionProfile | null) ?? null,
  };
}
