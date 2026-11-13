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
  is_online: boolean;
  is_verified: boolean;
  is_admin: boolean;
  is_demo: boolean;
  verification_status: string | null;
  selfie_url: string | null;
  id_document_url: string | null;
  id_document_type: string | null;
  verification_note: string | null;
  current_area: string | null;
  last_lat: number | null;
  last_lng: number | null;
  created_at: string;
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
