'use client';

import { useRef, useState } from 'react';
import { DriveCamera, DriveShieldAlert } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { detectSelfieFace } from '@/lib/verification-client';

/** Re-vérification selfie ponctuelle (v2.30) : le chauffeur refait
 *  un selfie avant de pouvoir se mettre en ligne (drapeau posé par
 *  l'admin après un signalement, ou par le balayage hebdo quand le
 *  dernier contrôle date de plus de 30 jours).
 *
 *  Contrôle = simple présence d'un visage (détection v2.4, FaceDetector
 *  natif) — JAMAIS de reconnaissance faciale ni d'identification : la
 *  photo n'est pas conservée (seule l'empreinte est calculée côté
 *  serveur, puis oubliée). En cas de doute (aucun visage), le dossier
 *  part dans la file des tickets admin — pas de blocage définitif
 *  automatique, un humain tranche. */
export function SelfieRecheckCard({ required }: { required: boolean }) {
  const [selfie, setSelfie] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  if (!required || done) return null;

  async function submit() {
    if (!selfie) {
      setError('Prends un selfie pour le contrôle.');
      return;
    }
    setError(null);
    setMessage(null);
    setChecking(true);
    // Contrôle de présence d'un visage, sur l'appareil (v2.4).
    const face = await detectSelfieFace(selfie);
    const form = new FormData();
    form.append('selfie', selfie);
    form.append('face', face);
    const res = await fetch('/api/driver/selfie-recheck', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    setChecking(false);
    if (!res.ok) {
      setError(data?.error ?? 'Envoi impossible. Réessaie.');
      return;
    }
    if (data?.recheck === 'ambiguous') {
      setMessage(
        data.message ??
          'Aucun visage détecté : ton dossier est transmis à l’administrateur. Reprends un selfie bien éclairé, visage visible.'
      );
      return;
    }
    setDone(true);
    setMessage('Selfie vérifié — tu peux te remettre en ligne.');
  }

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-3xl p-5 shadow-sm space-y-3">
      <h2 className="font-black text-amber-900 flex items-center gap-2">
        <DriveShieldAlert size={18} /> Vérification selfie à refaire
      </h2>
      <p className="text-sm text-amber-800 leading-relaxed">
        Contrôle ponctuel : refais un selfie avant de te mettre en ligne. On vérifie juste
        qu’un visage est bien visible sur la photo — aucune reconnaissance faciale, la photo
        n’est pas conservée.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm font-bold text-amber-900 bg-amber-100 border border-amber-300 rounded-xl p-3">
          {message}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setSelfie(f);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-black bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors"
        >
          <DriveCamera size={16} /> {selfie ? 'Changer le selfie' : 'Prendre un selfie'}
        </button>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Aperçu du selfie de contrôle" className="w-16 h-16 rounded-2xl object-cover border border-amber-300" />
        )}
        <button
          type="button"
          disabled={checking || !selfie}
          onClick={submit}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
        >
          {checking ? (
            <>
              <LogoLoader size={18} /> Vérification…
            </>
          ) : (
            'Envoyer mon selfie'
          )}
        </button>
      </div>
    </div>
  );
}
