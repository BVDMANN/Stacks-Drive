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
        <p className="text-sm text-corail bg-corail/10 border border-corail/30 rounded-xl p-4">
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
          <div className="w-16 h-16 mx-auto rounded-full bg-sarcelle/15 flex items-center justify-center text-sarcelle">
            <Mail size={32} />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Clique sur le lien dans l’e-mail pour choisir un nouveau mot de passe.
            Vérifie aussi tes spams.
          </p>
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <CheckCircle2 size={14} /> Le lien expire après un certain délai.
          </p>
          <Link href="/connexion" className="inline-block text-sarcelle font-bold text-sm hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Mot de passe oublié" subtitle="On t’envoie un lien pour le réinitialiser.">
      {error && (
        <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-xs font-black uppercase tracking-widest text-slate-400">
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
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-sarcelle focus:outline-none"
          />
        </div>
        <PremiumButton variant="rose" type="submit" isLoading={loading} className="w-full justify-center py-4">
          Envoyer le lien
        </PremiumButton>
      </form>
      <p className="text-sm text-center text-slate-400">
        <Link href="/connexion" className="text-sarcelle font-bold hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </AuthCard>
  );
}
