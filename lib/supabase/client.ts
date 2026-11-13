import { createBrowserClient } from '@supabase/ssr';
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from './config';

/** Client Supabase côté navigateur (anon key uniquement — jamais de clé service_role).
 *  Retourne null si Supabase n'est pas configuré (variables d'environnement absentes). */
export function getBrowserClient() {
  if (!isSupabaseConfigured()) return null;
  return createBrowserClient(supabaseUrl(), supabaseAnonKey());
}
