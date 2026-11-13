'use client';

import { useState } from 'react';
import { BadgeCheck, Camera, FileCheck, Loader2, ShieldAlert, Upload } from 'lucide-react';
import { VerificationStatusBadge } from '@/components/shared/StatusBadge';
import { PremiumButton } from '@/components/shared/PremiumButton';
import type { IdDocumentType, VerificationStatus } from '@/types';
import { cn } from '@/lib/utils';
import {
  runClientVerificationChecks,
  type CheckProgress,
} from '@/lib/verification-client';

const CHECK_STEP_LABELS: Record<CheckProgress['step'], string> = {
  photos: 'Contrôle de tes photos…',
  visage: 'Vérification du visage sur le selfie…',
  lecture: 'Lecture de ta pièce…',
  envoi: 'Envoi de ton dossier…',
};

const DOC_LABELS: Record<IdDocumentType, string> = {
  cni: 'Carte nationale d’identité (CNI)',
  passeport: 'Passeport',
  permis: 'Permis de conduire',
};

/** Vérification d'identité du chauffeur (obligatoire avant de se mettre
 *  en ligne) : selfie + pièce d'identité ou permis, contrôlés
 *  AUTOMATIQUEMENT dès l'envoi (v2.4) — visage, lecture de la pièce
 *  (OCR), doublons. Si un point demande un regard humain, le dossier
 *  part en ticket pour l'admin. */
export function VerificationForm({
  verificationStatus,
  verificationNote,
  accountName,
}: {
  verificationStatus: VerificationStatus;
  verificationNote: string | null;
  accountName?: string | null;
}) {
  const [documentType, setDocumentType] = useState<IdDocumentType>('cni');
  const [selfie, setSelfie] = useState<File | null>(null);
  const [document, setDocument] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [docPreview, setDocPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<CheckProgress | null>(null);
  /** Décision automatique renvoyée par le serveur (v2.4). */
  const [decision, setDecision] = useState<'verifie' | 'refuse' | 'ambigu' | null>(null);
  const [decisionNote, setDecisionNote] = useState<string | null>(null);

  function pickFile(file: File | null, kind: 'selfie' | 'document') {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Le fichier doit être une photo (image).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Le fichier dépasse 5 Mo.');
      return;
    }
    setError(null);
    const url = URL.createObjectURL(file);
    if (kind === 'selfie') {
      setSelfie(file);
      setSelfiePreview(url);
    } else {
      setDocument(file);
      setDocPreview(url);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selfie || !document) {
      setError('Envoie ton selfie ET ta pièce d’identité.');
      return;
    }
    setLoading(true);
    // 1. Contrôles automatiques sur ton téléphone (visage, lecture de
    // la pièce, empreintes). Si un contrôle technique échoue, le dossier
    // part quand même — c'est le serveur qui tranche.
    let checks = null;
    try {
      checks = await runClientVerificationChecks(selfie, document, accountName ?? null, setProgress);
    } catch {
      checks = null;
    }
    setProgress({ step: 'envoi', ocrProgress: 100 });
    const form = new FormData();
    form.append('selfie', selfie);
    form.append('document', document);
    form.append('documentType', documentType);
    if (checks) form.append('checks', JSON.stringify(checks));
    const res = await fetch('/api/verification', { method: 'POST', body: form });
    const data = await res.json().catch(() => null);
    setLoading(false);
    setProgress(null);
    if (!res.ok) {
      setError(data?.error ?? 'Envoi impossible. Réessaie.');
      return;
    }
    setDecision(data?.decision === 'verifie' || data?.decision === 'refuse' ? data.decision : 'ambigu');
    setDecisionNote(typeof data?.note === 'string' ? data.note : null);
    setDone(true);
  }

  if (verificationStatus === 'verifie') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
        <BadgeCheck size={22} className="text-stacks-green shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-green-800">Compte vérifié</p>
          <p className="text-sm text-green-700 mt-0.5">
            Ton selfie et ta pièce ont été contrôlés. Tu peux te mettre en ligne
            et recevoir des demandes de course.
          </p>
        </div>
      </div>
    );
  }

  if (verificationStatus === 'en_attente' && !done) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <ShieldAlert size={22} className="text-amber-700 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-amber-800">Vérification en cours</p>
          <p className="text-sm text-amber-700 mt-0.5">
            Tes documents sont en cours de contrôle par l’équipe Stacks Drive.
            Tu seras notifié dès que ton compte est vérifié — en général sous 24 h.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    if (decision === 'verifie') {
      return (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
          <BadgeCheck size={22} className="text-stacks-green shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-green-800">Compte vérifié !</p>
            <p className="text-sm text-green-700 mt-0.5">
              Ton selfie et ta pièce ont été contrôlés automatiquement. Tu peux
              te mettre en ligne et recevoir des demandes de course.
            </p>
          </div>
        </div>
      );
    }
    if (decision === 'refuse') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <ShieldAlert size={22} className="text-red-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-black text-red-800">Vérification refusée</p>
            <p className="text-sm text-red-700 mt-0.5">
              {decisionNote ?? 'Tes documents n’ont pas pu être validés.'} Tu
              peux renvoyer des documents en rechargeant cette page.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
        <FileCheck size={22} className="text-stacks-green shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-green-800">Documents envoyés !</p>
          <p className="text-sm text-green-700 mt-0.5">
            Ton dossier demande un regard humain : l’équipe Stacks Drive le
            revoit. Dès qu’il est validé, tu pourras te mettre en ligne et
            proposer des courses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-black text-slate-900">Vérification d’identité</h3>
        <VerificationStatusBadge status={verificationStatus} />
      </div>
      <p className="text-sm text-slate-500 leading-relaxed">
        Pour la sécurité des passagers, chaque chauffeur est vérifié avant de
        conduire : un selfie et une pièce d’identité (ou ton permis). Tes
        documents sont contrôlés automatiquement dès l’envoi — dans la
        plupart des cas, la décision est immédiate. Si un point demande un
        regard humain, l’équipe Stacks Drive revoit ton dossier. Tes
        documents restent privés — seul l’administrateur les voit.
      </p>
      {verificationStatus === 'refuse' && verificationNote && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          Vérification refusée : {verificationNote} — renvoie des documents
          lisibles et valides.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Type de pièce */}
      <div className="space-y-1.5">
        <label htmlFor="doc-type" className="text-xs font-black uppercase tracking-widest text-slate-500">
          Ta pièce d’identité
        </label>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type de pièce">
          {(Object.keys(DOC_LABELS) as IdDocumentType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={documentType === t}
              onClick={() => setDocumentType(t)}
              className={cn(
                'px-2 py-3 rounded-2xl border-2 text-xs font-black transition-colors',
                documentType === t
                  ? 'border-stacks-green bg-green-50/60 text-stacks-green'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              )}
            >
              {t === 'cni' ? 'CNI' : t === 'passeport' ? 'Passeport' : 'Permis'}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">{DOC_LABELS[documentType]}</p>
      </div>

      {/* Selfie */}
      <div className="space-y-1.5">
        <label className="text-xs font-black uppercase tracking-widest text-slate-500">
          1 · Ton selfie
        </label>
        <label className="flex items-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-4 cursor-pointer hover:border-stacks-green transition-colors">
          <Camera size={22} className="text-stacks-green shrink-0" />
          <span className="text-sm text-slate-600">
            {selfie ? (
              <strong className="text-slate-900">{selfie.name}</strong>
            ) : (
              <>Prends ton selfie avec l’appareil photo — visage bien visible, sans lunettes de soleil.</>
            )}
          </span>
          <input
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null, 'selfie')}
          />
        </label>
        {selfiePreview && (
          <img src={selfiePreview} alt="Aperçu du selfie" className="w-28 h-28 object-cover rounded-2xl border border-slate-200" />
        )}
      </div>

      {/* Pièce */}
      <div className="space-y-1.5">
        <label className="text-xs font-black uppercase tracking-widest text-slate-500">
          2 · Ta pièce ({documentType === 'cni' ? 'CNI' : documentType === 'passeport' ? 'passeport' : 'permis'})
        </label>
        <label className="flex items-center gap-3 border-2 border-dashed border-slate-300 rounded-2xl p-4 cursor-pointer hover:border-stacks-green transition-colors">
          <Upload size={22} className="text-stacks-green shrink-0" />
          <span className="text-sm text-slate-600">
            {document ? (
              <strong className="text-slate-900">{document.name}</strong>
            ) : (
              <>Photographie ta pièce bien à plat, tous les textes lisibles.</>
            )}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null, 'document')}
          />
        </label>
        {docPreview && (
          <img src={docPreview} alt="Aperçu de la pièce" className="w-40 h-28 object-cover rounded-2xl border border-slate-200" />
        )}
      </div>

      {progress && (
        <div
          role="status"
          className="flex items-center gap-3 bg-night-900 text-slate-100 rounded-2xl p-4"
        >
          <Loader2 size={20} className="animate-spin text-or shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold">{CHECK_STEP_LABELS[progress.step]}</p>
            <p className="text-xs text-slate-300 mt-0.5">
              {progress.step === 'lecture'
                ? progress.ocrProgress >= 0
                  ? `Lecture en cours… ${progress.ocrProgress} % (ça peut prendre quelques secondes)`
                  : 'Préparation de la lecture…'
                : 'Merci de patienter, ne ferme pas cette page.'}
            </p>
          </div>
        </div>
      )}

      <PremiumButton type="submit" isLoading={loading} className="w-full sm:w-auto justify-center px-8">
        Envoyer pour vérification
      </PremiumButton>
    </form>
  );
}
