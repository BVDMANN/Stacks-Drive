"use client";

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Mail } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AuthCard } from '@/components/auth/AuthCard';
import { PremiumButton } from '@/components/shared/PremiumButton';

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = getBrowserClient();
    if (!supabase) {
      setError('Supabase n’est pas configuré sur ce déploiement.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reinitialiser-mot-de-passe`,
    });
    setLoading(false);
    if (error) {
      setError('Envoi impossible. Vérifie ton e-mail et réessaie.');
      return;
    }
    setSent(true);
  }

  if (!isSupabaseConfigured()) {
    return (
      <AuthCard title="Mot de passe oublié" subtitle="On t’envoie un lien pour le réinitialiser.">
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
          La réinitialisation n’est pas encore configurée sur ce déploiement :
          les clés Supabase manquent. Voir SETUP.md.
        </p>
      </AuthCard>
    );
  }

  if (sent) {
    return (
      <AuthCard title="E-mail envoyé" subtitle={`Si un compte existe pour ${email}, tu vas recevoir un lien de réinitialisation.`}>
        <div className="text-center space-y-4 py-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center text-stacks-green">
            <Mail size={32} />
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            Clique sur le lien dans l’e-mail pour choisir un nouveau mot de passe.
            Vérifie aussi tes spams.
          </p>
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <CheckCircle2 size={14} /> Le lien expire après un certain délai.
          </p>
          <Link href="/connexion" className="inline-block text-stacks-green font-bold text-sm hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Mot de passe oublié" subtitle="On t’envoie un lien pour le réinitialiser.">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-slate-500">
            E-mail du compte
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ton@email.com"
            className="w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none"
          />
        </div>
        <PremiumButton type="submit" isLoading={loading} className="w-full justify-center py-4">
          Envoyer le lien
        </PremiumButton>
      </form>
      <p className="text-sm text-center text-slate-500">
        <Link href="/connexion" className="text-stacks-green font-bold hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  );
}
