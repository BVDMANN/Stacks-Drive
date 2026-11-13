/** Configuration Supabase — lue uniquement depuis les variables d'environnement.
 *  Aucune clé n'est jamais écrite en dur. Sans ces variables, l'application
 *  démarre quand même (pages publiques vides + message de configuration). */

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return url.startsWith('https://') && key.length > 20;
}

export function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

export function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
}
