'use client';

import { useEffect, useRef, useState } from 'react';
import { DriveCamera, DriveTrash } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { cn } from '@/lib/utils';

/** Photo de profil passager (v2.49) : optionnelle, montrée au
 *  chauffeur assigné UNIQUEMENT pendant la course (règle v2.20).
 *  Le composant lit son état depuis GET /api/profile/photo
 *  (hasPhoto + URL signée 1 h) et signale chaque changement au
 *  parent via onPhotoChange (indicateur de complétion du profil).
 *  Sans la migration v2.49a, l'API répond baseOutdated : le
 *  formulaire se désactive avec un message honnête. */

export function PassengerPhotoForm({
  name,
  onPhotoChange,
}: {
  /** Nom affiché dans l'avatar de secours (initiales). */
  name: string | null;
  onPhotoChange?: (hasPhoto: boolean) => void;
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const res = await fetch('/api/profile/photo');
    const data = (await res.json().catch(() => null)) as {
      hasPhoto?: boolean;
      url?: string | null;
      baseOutdated?: boolean;
    } | null;
    if (!res.ok || !data) {
      setState('unavailable');
      return;
    }
    if (data.baseOutdated) {
      setState('unavailable');
      return;
    }
    setState('ready');
    setPhotoUrl(data.hasPhoto ? (data.url ?? null) : null);
    onPhotoChange?.(data.hasPhoto === true);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload(file: File) {
    setSending(true);
    setError(null);
    const form = new FormData();
    form.append('photo', file);
    const res = await fetch('/api/profile/photo', { method: 'POST', body: form });
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    setSending(false);
    if (!res.ok) {
      setError(data?.error ?? 'Envoi impossible. Réessaie.');
      return;
    }
    await refresh();
  }

  async function remove() {
    setSending(true);
    setError(null);
    const res = await fetch('/api/profile/photo', { method: 'DELETE' });
    setSending(false);
    if (!res.ok) {
      setError('Retrait impossible. Réessaie.');
      return;
    }
    await refresh();
  }

  const initials = (name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

  if (state === 'loading') {
    return (
      <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center" aria-label="Chargement de la photo…">
        <LogoLoader size={40} />
      </div>
    );
  }
  if (state === 'unavailable') {
    return (
      <div className="flex items-center gap-3">
        <div className="w-24 h-24 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-black text-2xl">
          {initials}
        </div>
        <p className="text-sm text-slate-500 max-w-[220px]">
          La photo de profil arrive avec la prochaine mise à jour.
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-4">
      <div className="relative shrink-0">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Ta photo de profil"
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-2xl">
            {initials}
          </div>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={sending}
          aria-label={photoUrl ? 'Changer de photo' : 'Ajouter une photo'}
          className={cn(
            'absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-rose-500 text-white',
            'flex items-center justify-center shadow hover:bg-rose-600 transition-colors',
            'disabled:opacity-50'
          )}
        >
          {sending ? <LogoLoader size={18} /> : <DriveCamera size={15} />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </div>
      <div className="space-y-1 pt-1">
        <p className="font-black text-slate-900">
          {photoUrl ? 'Ta photo' : 'Ajouter une photo'}
        </p>
        <p className="text-xs text-slate-500 leading-relaxed">
          Optionnelle — visible par le chauffeur uniquement pendant tes courses.
        </p>
        {photoUrl && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={sending}
            className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline disabled:opacity-50"
          >
            <DriveTrash size={12} /> Retirer ma photo
          </button>
        )}
        {error && <p className="text-xs font-bold text-red-600">{error}</p>}
      </div>
    </div>
  );
}
