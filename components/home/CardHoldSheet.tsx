'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { DriveCreditCard, DriveShield } from '@/components/icons/DriveUi';
import { formatFcfa } from '@/lib/commission';

/** Feuille « Paiement par carte » (v2.55) : l'empreinte (pré-
 *  autorisation) d'une course acceptée.
 *
 *  Ce qui s'affiche : le prix convenu, les frais Stripe (payés
 *  par le passager, décision du 15/11/2026), le TOTAL autorisé —
 *  et la promesse claire : RIEN n'est débité maintenant, c'est
 *  une empreinte ; le prix convenu est débité à la fin de la
 *  course. La course ne démarre que quand l'empreinte est
 *  confirmée (le chauffeur ne roule jamais sans garantie).
 *  3DS gérée par le Payment Element (Stripe).
 *
 *  Si Stripe n'est pas configuré (pas de clé), la feuille dit
 *  honnêtement que le paiement par carte n'est pas encore
 *  activé et propose les autres moyens — jamais un écran vide.
 */
function HoldForm({
  rideId,
  fareFcfa,
  feesFcfa,
  chargedFcfa,
  onConfirmed,
  onClose,
}: {
  rideId: string;
  fareFcfa: number;
  feesFcfa: number;
  chargedFcfa: number;
  onConfirmed: () => void;
  onClose: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!stripe || !elements) return;
    setConfirming(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Vérifie tes coordonnées bancaires.');
      setConfirming(false);
      return;
    }
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/courses/${rideId}?paiement=carte`,
      },
      redirect: 'if_required',
    });
    if (confirmError) {
      setError(
        confirmError.message ??
          'Paiement refusé — vérifie ta carte ou essaie une autre carte.'
      );
      setConfirming(false);
      return;
    }
    // Empreinte confirmée : l'autorisation est retenue
    // (requires_capture) — rien n'est débité maintenant.
    if (paymentIntent && paymentIntent.status === 'requires_capture') {
      onConfirmed();
      return;
    }
    if (paymentIntent && paymentIntent.status === 'succeeded') {
      onConfirmed();
      return;
    }
    setError('Empreinte non confirmée — réessaie.');
    setConfirming(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-slate-300">
          <span>Prix convenu de la course</span>
          <span className="font-bold text-white">{formatFcfa(fareFcfa)}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Frais de paiement par carte</span>
          <span className="font-bold text-white">{formatFcfa(feesFcfa)}</span>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-2 text-base">
          <span className="font-black text-white">Total autorisé</span>
          <span className="font-black text-rose-300">{formatFcfa(chargedFcfa)}</span>
        </div>
        <p className="text-xs text-slate-400 pt-1">
          Rien n’est débité maintenant : c’est une empreinte sur ta carte.
          Le prix convenu ({formatFcfa(fareFcfa)}) est débité à la fin de la
          course. Si la course est annulée, l’empreinte est annulée — rien
          n’est débité.
        </p>
      </div>

      <PaymentElement
        options={{
          layout: 'tabs',
          fields: { billingDetails: { address: { country: 'never', postalCode: 'never' } } },
        }}
      />

      {error && (
        <p role="alert" className="text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={confirm}
        disabled={!stripe || !elements || confirming}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-black bg-rose-500 text-night-900 hover:bg-rose-300 transition-colors disabled:opacity-50"
      >
        {confirming ? (
          <>
            <LogoLoader size={18} /> Confirmation en cours…
          </>
        ) : (
          <>
            <DriveCreditCard size={16} /> Autoriser {formatFcfa(chargedFcfa)}
          </>
        )}
      </button>
      <p className="text-xs text-center text-slate-400 flex items-center justify-center gap-1.5">
        <DriveShield size={13} className="text-sarcelle" />
        Paiement sécurisé par Stripe — 3-D Secure. Stacks Drive ne voit jamais ton numéro de carte.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="w-full text-sm font-bold text-slate-400 hover:underline"
      >
        Pas maintenant
      </button>
    </div>
  );
}

export function CardHoldSheet({
  rideId,
  fareFcfa,
  onConfirmed,
  onClose,
}: {
  rideId: string;
  fareFcfa: number;
  onConfirmed: () => void;
  onClose: () => void;
}) {
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [charged, setCharged] = useState<{ fare: number; fees: number; charged: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configRes, holdRes] = await Promise.all([
        fetch('/api/stripe/config'),
        fetch('/api/stripe/hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rideId }),
        }),
      ]);
      const config = await configRes.json().catch(() => null);
      const hold = await holdRes.json().catch(() => null);
      if (!config?.configured || !config?.publishableKey) {
        setError('Le paiement par carte n’est pas encore activé — choisis Espèces, Airtel Money ou Moov Money pour cette course.');
        return;
      }
      if (!holdRes.ok || !hold?.clientSecret) {
        setError(hold?.error ?? 'Empreinte impossible pour le moment — réessaie.');
        return;
      }
      setStripePromise(loadStripe(config.publishableKey));
      setClientSecret(hold.clientSecret);
      setCharged({
        fare: hold.fareFcfa ?? fareFcfa,
        fees: hold.feesFcfa ?? 0,
        charged: hold.chargedFcfa ?? fareFcfa,
      });
    } catch {
      setError('Connexion impossible — vérifie ton réseau et réessaie.');
    } finally {
      setLoading(false);
    }
  }, [rideId, fareFcfa]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Paiement par carte">
      <div className="w-full max-w-md bg-night-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-black text-lg text-white flex items-center gap-2">
              <DriveCreditCard size={20} className="text-rose-300" /> Paiement par carte
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Confirme l’empreinte pour que ton chauffeur puisse démarrer.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xl leading-none px-2"
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        {loading && <LogoLoader size={32} label="Préparation du paiement…" />}
        {error && !loading && (
          <div className="space-y-3">
            <p role="alert" className="text-sm font-bold text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
              {error}
            </p>
            <button
              type="button"
              onClick={load}
              className="w-full px-5 py-3 rounded-full text-sm font-black bg-white/10 text-white hover:bg-white/15 transition-colors"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full text-sm font-bold text-slate-400 hover:underline"
            >
              Fermer
            </button>
          </div>
        )}
        {!loading && !error && stripePromise && clientSecret && charged && (
          <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' } }}>
            <HoldForm
              rideId={rideId}
              fareFcfa={charged.fare}
              feesFcfa={charged.fees}
              chargedFcfa={charged.charged}
              onConfirmed={onConfirmed}
              onClose={onClose}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}
