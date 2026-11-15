'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { TutoStep } from './steps';

/** Modale de tutoriel « Nuit violette » (v2.21) — étape par étape, courte
 *  et visuelle : chaque étape montre la capture du VRAI écran de
 *  l'app (voir `public/tuto/`), un titre, deux lignes de texte, pas
 *  de pavé. Fermable à tout moment (croix, « Passer », Échap) et
 *  rejouable depuis le compte / le tableau de bord. */
export function TutorialModal({
  open,
  steps,
  eyebrow,
  onClose,
}: {
  open: boolean;
  steps: TutoStep[];
  /** Petit sur-titre : « Tutoriel passager » / « Formation chauffeur ». */
  eyebrow: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const last = steps.length - 1;
  const step = steps[index];

  // Rouvrir = repartir de l'étape 1.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open ]);

  // Échap = fermer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && index < last) setIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, index, last, onClose]);

  if (!open || !step) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-night-950/85 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={eyebrow}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[420px] max-h-[92dvh] overflow-y-auto bg-night-900 border border-white/15 rounded-t-[28px] sm:rounded-[28px] shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le tutoriel"
          className="absolute top-3 right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-night-950/80 backdrop-blur border border-white/20 text-white hover:border-corail/60 active:scale-90 transition-all"
        >
          <X size={18} />
        </button>

        <p className="px-5 pt-5 text-[10px] font-black uppercase tracking-widest text-corail">
          {eyebrow} · Étape {index + 1}/{steps.length}
        </p>

        {/* Capture du vrai écran — jamais une illustration.
            `cover` : plein écran cadré en haut (le contenu utile est
            dans le haut de la capture) ; `contain` : composant seul,
            affiché en entier. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={step.image}
          alt={step.alt}
          className={
            step.fit === 'contain'
              ? 'mt-3 w-full h-[58dvh] object-contain border-y border-white/10 bg-night-950'
              : 'mt-3 w-full h-[58dvh] object-cover object-top border-y border-white/10 bg-night-950'
          }
        />

        <div className="p-5 space-y-2">
          <h2 className="text-xl font-black text-white leading-tight">{step.title}</h2>
          <p className="text-sm text-slate-300 leading-relaxed">{step.text}</p>

          {/* Points de progression */}
          <div className="flex items-center justify-center gap-1.5 pt-1" aria-label={`Étape ${index + 1} sur ${steps.length}`}>
            {steps.map((s, i) => (
              <button
                key={s.image}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Aller à l'étape ${i + 1} : ${s.title}`}
                className={`h-2 rounded-full transition-all ${
                  i === index ? 'w-6 bg-corail' : 'w-2 bg-white/25 hover:bg-white/40'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="inline-flex items-center gap-1 px-4 py-3 rounded-full border border-white/15 text-sm font-black text-slate-200 hover:border-white/40 active:scale-95 transition-all disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Précédent
            </button>
            {index < last ? (
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(last, i + 1))}
                className="flex-1 inline-flex items-center justify-center gap-1 px-4 py-3 rounded-full bg-rose-500 text-night-900 text-sm font-black shadow-lg shadow-rose-500/30 hover:bg-rose-300 active:scale-[0.98] transition-all"
              >
                Suivant <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-1 px-4 py-3 rounded-full bg-rose-500 text-night-900 text-sm font-black shadow-lg shadow-rose-500/30 hover:bg-rose-300 active:scale-[0.98] transition-all"
              >
                C&apos;est parti !
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-300 py-1"
          >
            Passer le tutoriel
          </button>
        </div>
      </div>
    </div>
  );
}
