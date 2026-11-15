"use client";

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AuthCard } from '@/components/auth/AuthCard';
import { PremiumButton } from '@/components/shared/PremiumButton';

function translateError(message: string): string {
  if (/invalid login credentials/i.test(message))
    return 'E-mail ou mot de passe incorrect.';
  if (/email not confirmed/i.test(message))
    return 'Ton e-mail n’est pas encore vérifié — clique sur le lien reçu par e-mail.';
  return 'Connexion impossible. Réessaie dans un instant.';
}

export default function ConnexionPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Connexion" subtitle="Content de te revoir sur Stacks Drive.">
          <p className="text-sm text-slate-400 text-center">Chargement…</p>
        </AuthCard>
      }
    >
      <ConnexionForm />
    </Suspense>
  );
}

function ConnexionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    errorParam === 'lien-invalide'
      ? 'Ce lien est invalide ou a expiré. Recommence la vérification.'
      : errorParam === 'verification-impossible'
        ? 'La vérification de ton e-mail a échoué. Essaie de te connecter ou redemande un lien.'
        : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getBrowserClient();
    if (!supabase) {
      setError('Supabase n’est pas configuré sur ce déploiement.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(translateError(error.message));
      return;
    }
    router.push(next);
    router.refresh();
  }

  if (!isSupabaseConfigured()) {
    return (
      <AuthCard title="Connexion" subtitle="Accède à ton compte Stacks Drive.">
        <p className="text-sm text-corail bg-corail/10 border border-corail/30 rounded-xl p-4">
          La connexion n’est pas encore configurée sur ce déploiement : les
          clés Supabase manquent. Voir SETUP.md.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Connexion" subtitle="Content de te revoir sur Stacks Drive.">
      {error && (
        <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-slate-400">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-sarcelle focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-black uppercase tracking-widest text-slate-400">
            Mot de passe
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-sarcelle focus:outline-none"
          />
        </div>
        <PremiumButton variant="rose" type="submit" isLoading={loading} className="w-full justify-center py-4">
          Se connecter
        </PremiumButton>
      </form>
      <div className="flex justify-between text-sm">
        <Link href="/mot-de-passe-oublie" className="text-slate-400 hover:text-sarcelle font-semibold">
          Mot de passe oublié ?
        </Link>
        <Link href={`/inscription${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-sarcelle hover:underline font-bold">
          Créer un compte
        </Link>
      </div>
    </AuthCard>
  );
}
