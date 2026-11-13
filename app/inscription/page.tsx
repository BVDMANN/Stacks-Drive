"use client";

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Mail } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AuthCard } from '@/components/auth/AuthCard';
import { PremiumButton } from '@/components/shared/PremiumButton';
import { cn } from '@/lib/utils';

type Role = 'passager' | 'chauffeur';

function translateError(message: string): string {
  if (/already registered|already exists/i.test(message))
    return 'Un compte existe déjà avec cet e-mail. Essaie de te connecter.';
  if (/password/i.test(message))
    return 'Ton mot de passe doit faire au moins 6 caractères.';
  return 'Inscription impossible. Vérifie tes informations et réessaie.';
}

export default function InscriptionPage() {
  return (
    <Suspense
      fallback={
        <AuthCard title="Créer un compte" subtitle="Rejoins Stacks Drive, gratuitement.">
          <p className="text-sm text-slate-400 text-center">Chargement…</p>
        </AuthCard>
      }
    >
      <InscriptionForm />
    </Suspense>
  );
}

function InscriptionForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('passager');

  // Lien direct « Devenir chauffeur » (/inscription?role=chauffeur) :
  // on présélectionne le rôle chauffeur au montage. Défaut : passager.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('role') === 'chauffeur') setRole('chauffeur');
  }, []);
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim(), phone: phone.trim(), role },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setLoading(false);
    if (error) {
      setError(translateError(error.message));
      return;
    }
    // Si la confirmation e-mail est activée, il n'y a pas encore de session :
    // l'utilisateur doit cliquer sur le lien reçu par e-mail.
    if (data.user && !data.session) {
      setSent(true);
      return;
    }
    // Confirmation désactivée : session immédiate.
    window.location.href = next;
  }

  if (!isSupabaseConfigured()) {
    return (
      <AuthCard title="Créer un compte" subtitle="Rejoins Stacks Drive, gratuitement.">
        <p className="text-sm text-gold bg-gold/10 border border-gold/30 rounded-xl p-4">
          L’inscription n’est pas encore configurée sur ce déploiement : les
          clés Supabase manquent. Voir SETUP.md.
        </p>
      </AuthCard>
    );
  }

  if (sent) {
    return (
      <AuthCard title="Vérifie ta boîte mail" subtitle={`Un e-mail de vérification vient d’être envoyé à ${email}.`}>
        <div className="text-center space-y-4 py-2">
          <div className="w-16 h-16 mx-auto rounded-full bg-cyan/15 flex items-center justify-center text-cyan">
            <Mail size={32} />
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            Clique sur le lien dans l’e-mail pour activer ton compte{' '}
            {role === 'chauffeur' ? 'chauffeur' : 'passager'}.
            Vérifie aussi tes spams si tu ne vois rien arriver.
          </p>
          {role === 'chauffeur' && (
            <p className="text-sm text-slate-300 leading-relaxed">
              Ensuite, fais vérifier ton compte dans « Mon compte » (selfie +
              pièce d’identité ou permis) : c’est obligatoire avant de te mettre
              en ligne et de recevoir des demandes.
            </p>
          )}
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <CheckCircle2 size={14} /> Ton compte sera actif dès la vérification.
          </p>
          <Link href="/connexion" className="inline-block text-cyan font-bold text-sm hover:underline">
            Aller à la connexion
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Créer un compte" subtitle="Gratuit, en moins d’une minute.">
      {error && (
        <p role="alert" className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Choix du rôle */}
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Je m’inscris en tant que">
          {(
            [
              { value: 'passager', label: 'Passager', desc: 'Je commande des courses' },
              { value: 'chauffeur', label: 'Chauffeur', desc: 'Je reçois des demandes, je propose mes prix' },
            ] as const
          ).map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={role === r.value}
              onClick={() => setRole(r.value)}
              className={cn(
                'p-4 rounded-2xl border-2 text-left transition-colors',
                role === r.value
                  ? 'border-cyan bg-cyan/10'
                  : 'border-white/15 bg-night-900 hover:border-white/30'
              )}
            >
              <span className="block font-black text-white">{r.label}</span>
              <span className="block text-xs text-slate-400 mt-0.5">{r.desc}</span>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="full-name" className="text-xs font-black uppercase tracking-widest text-slate-400">
            Nom complet
          </label>
          <input
            id="full-name"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Ex : Jean Nguema"
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-cyan focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-xs font-black uppercase tracking-widest text-slate-400">
            Téléphone
          </label>
          <input
            id="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ex : 074 00 00 00"
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-cyan focus:outline-none"
          />
        </div>

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
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-cyan focus:outline-none"
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
            minLength={6}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6 caractères minimum"
            className="w-full px-4 py-3.5 rounded-xl bg-night-900 border border-white/15 text-white placeholder:text-slate-500 focus:border-cyan focus:outline-none"
          />
        </div>

        <PremiumButton variant="or" type="submit" isLoading={loading} className="w-full justify-center py-4">
          Créer mon compte
        </PremiumButton>
      </form>
      <p className="text-sm text-center text-slate-400">
        Déjà inscrit ?{' '}
        <Link href="/connexion" className="text-cyan font-bold hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthCard>
  );
}
