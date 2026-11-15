"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase/client';
import { AuthCard } from '@/components/auth/AuthCard';
import { PremiumButton } from '@/components/shared/PremiumButton';

export default function ReinitialiserMotDePassePage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  // Le lien de réinitialisation passe par /auth/callback qui échange le code
  // contre une session : on vérifie ici que la session existe bien.
  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) {
      setHasSession(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setError(null);
    const supabase = getBrowserClient();
    if (!supabase) {
      setError('Supabase n’est pas configuré sur ce déploiement.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError('Réinitialisation impossible. Le lien a peut-être expiré : redemande-en un.');
      return;
    }
    router.push('/connexion?reset=ok');
  }

  if (hasSession === false) {
    return (
      <AuthCard title="Lien invalide ou expiré" subtitle="Ce lien de réinitialisation ne fonctionne plus.">
        <p className="text-sm text-slate-300 leading-relaxed">
          Les liens de réinitialisation expirent après un certain délai et ne
          peuvent servir qu’une fois. Redemande un nouveau lien.
        </p>
        <Link href="/mot-de-passe-oublie" className="block text-center text-sarcelle font-bold text-sm hover:underline">
          Redemander un lien
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nouveau mot de passe" subtitle="Choisis un mot de passe solide.">
      {error && (
        <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="password" className="text-xs font-black uppercase tracking-widest text-slate-400">
            Nouveau mot de passe
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 caractères minimum"
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-sarcelle focus:outline-none"
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirm" className="text-xs font-black uppercase tracking-widest text-slate-400">
            Confirmer le mot de passe
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Retape ton mot de passe"
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-sarcelle focus:outline-none"
          />
        </div>
        <PremiumButton variant="rose" type="submit" isLoading={loading || hasSession === null} className="w-full justify-center py-4">
          Enregistrer le nouveau mot de passe
        </PremiumButton>
      </form>
    </AuthCard>
  );
}
