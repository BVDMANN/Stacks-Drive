'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Car, Loader2, User } from 'lucide-react';
import type { ProfileRole } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

/** Bascule de mode Passager / Chauffeur (en-tête, une fois connecté).
 *  Un seul compte : le rôle change dans le profil, ce qui ouvre ou ferme
 *  les actions de chaque mode (commander une course / se mettre en ligne).
 *
 *  Règle 1 (v2.17) — barre de chargement : pendant la bascule, le bouton
 *  visé affiche un spinner et « Bascule… » s'affiche sous la bascule.
 *  Règle 2 (v2.17) — verrouillage du switch : passer en mode Chauffeur
 *  exige un compte chauffeur créé (`canSwitchToDriver`). Sans compte
 *  chauffeur, le clic ne bascule pas : l'utilisateur est dirigé vers
 *  « Devenir chauffeur » (création du compte chauffeur + vérification).
 *  Le sens inverse (chauffeur → passager) reste toujours libre. Le
 *  serveur (PATCH /api/profile) applique le même verrou : si sa réponse
 *  porte le code `driver_account_required`, on redirige aussi. */
export function ModeToggle({
  currentRole,
  canSwitchToDriver,
}: {
  currentRole: ProfileRole;
  /** Vrai si le compte a un dossier chauffeur (voir hasDriverAccount). */
  canSwitchToDriver: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<ProfileRole>(currentRole);
  const [loading, setLoading] = useState(false);
  const [pendingRole, setPendingRole] = useState<ProfileRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function switchRole(next: ProfileRole) {
    if (next === role || loading) return;
    // Règle 2 : sans compte chauffeur, pas de bascule — direction
    // « Devenir chauffeur » pour créer le compte + se faire vérifier.
    if (next === 'chauffeur' && !canSwitchToDriver) {
      setNotice('Crée d’abord ton compte chauffeur — direction « Devenir chauffeur »…');
      router.push('/devenir-chauffeur');
      return;
    }
    setError(null);
    setNotice(null);
    setLoading(true);
    setPendingRole(next);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: next }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    setPendingRole(null);
    if (!res.ok) {
      // Le serveur est la source de vérité : s'il refuse faute de
      // compte chauffeur (état local périmé), on redirige aussi.
      if (data?.code === 'driver_account_required') {
        setNotice('Crée d’abord ton compte chauffeur — direction « Devenir chauffeur »…');
        router.push('/devenir-chauffeur');
        return;
      }
      setError(data?.error ?? 'Changement impossible.');
      return;
    }
    setRole(next);
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className="inline-flex items-center rounded-full bg-white/5 border border-white/10 p-1"
        role="group"
        aria-label="Mode : passager ou chauffeur"
        aria-busy={loading}
      >
        {(
          [
            { value: 'passager', label: 'Passager', icon: User },
            { value: 'chauffeur', label: 'Chauffeur', icon: Car },
          ] as const
        ).map((m) => {
          const isPending = loading && pendingRole === m.value;
          return (
            <button
              key={m.value}
              type="button"
              disabled={loading}
              onClick={() => switchRole(m.value)}
              aria-pressed={role === m.value}
              title={
                m.value === 'chauffeur' && !canSwitchToDriver
                  ? 'Crée ton compte chauffeur pour passer en mode Chauffeur'
                  : undefined
              }
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black transition-all disabled:opacity-60',
                role === m.value
                  ? 'bg-or text-night-900 shadow-md shadow-or/40'
                  : 'text-slate-400 hover:text-white'
              )}
            >
              {isPending ? <Loader2 size={14} className="animate-spin" /> : <m.icon size={14} />}
              <span className="hidden xs:inline sm:inline">{m.label}</span>
            </button>
          );
        })}
      </span>
      {loading && pendingRole && (
        <span className="text-[11px] text-slate-300 font-bold px-1 inline-flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" />
          Bascule vers {pendingRole === 'chauffeur' ? 'Chauffeur' : 'Passager'}…
        </span>
      )}
      {notice && !loading && (
        <span className="text-[11px] text-cyan font-bold px-1">{notice}</span>
      )}
      {error && <span className="text-[11px] text-red-400 font-bold px-1">{error}</span>}
    </span>
  );
}
