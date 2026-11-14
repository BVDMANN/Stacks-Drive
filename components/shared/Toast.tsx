'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle2, Handshake, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Notifications pop-up (toasts) in-app — v2.12. Pas de notification
 *  push navigateur, pas de son : des cartes discrètes qui apparaissent
 *  en haut de l'écran pendant la négociation du prix, puis se ferment
 *  toutes seules (~6 s). Style « Nuit dorée » (or/cyan), jamais de
 *  numéro de téléphone affiché — prénom et prix uniquement. */

export interface ToastAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

export type ToastVariant = 'offer' | 'info' | 'success';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
  actions?: ToastAction[];
}

const VARIANT_STYLES: Record<ToastVariant, { border: string; icon: string; Icon: typeof Bell }> = {
  offer: { border: 'border-gold/60', icon: 'text-gold', Icon: Handshake },
  info: { border: 'border-cyan/60', icon: 'text-cyan', Icon: Bell },
  success: { border: 'border-gold/60', icon: 'text-gold', Icon: CheckCircle2 },
};

/** Pile de toasts : un seul composant partagé par le passager
 *  (HomeScreen) et le chauffeur (DriverHome, DriverDashboard). */
export function ToastStack({
  toasts,
  onClose,
}: {
  toasts: ToastItem[];
  onClose: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="fixed top-16 inset-x-0 z-[70] flex flex-col items-center gap-2 px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const { border, icon, Icon } = VARIANT_STYLES[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              'toast-in pointer-events-auto w-full max-w-sm rounded-2xl border bg-night-900/95 backdrop-blur shadow-2xl shadow-black/50 p-3.5',
              border
            )}
          >
            <div className="flex items-start gap-2.5">
              <span className="shrink-0 mt-0.5">
                <Icon size={18} className={icon} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-sm leading-snug">{t.title}</p>
                {t.message && (
                  <p className="text-xs text-slate-300 mt-0.5 leading-snug">{t.message}</p>
                )}
                {t.actions && t.actions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {t.actions.map((a) => (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => {
                          a.onClick();
                          onClose(t.id);
                        }}
                        className={cn(
                          'px-3.5 py-2 rounded-full text-xs font-black transition-all active:scale-95',
                          a.primary
                            ? 'bg-or text-night-900 shadow-md shadow-or/30 hover:bg-or-light'
                            : 'bg-white/10 text-white hover:bg-white/20'
                        )}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => onClose(t.id)}
                aria-label="Fermer la notification"
                className="shrink-0 text-slate-400 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const AUTO_DISMISS_MS = 6000;

/** File de toasts : `push` déduplique par id (jamais deux fois la même
 *  alerte) et programme la fermeture automatique (~6 s). */
export function useToastStack() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastItem) => {
      setToasts((prev) => {
        if (prev.some((t) => t.id === toast.id)) return prev;
        return [...prev.slice(-2), toast];
      });
      const existing = timersRef.current.get(toast.id);
      if (existing) clearTimeout(existing);
      timersRef.current.set(
        toast.id,
        setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  return { toasts, push, dismiss };
}
