'use client';

import { useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { DriveCreditCard } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { formatFcfa } from '@/lib/commission';

function DebtPayForm({
  amountFcfa,
  onPaid,
  onCancel,
}: {
  amountFcfa: number;
  onPaid: () => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Vérifie tes coordonnées bancaires.');
      setPaying(false);
      return;
    }
    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });
    if (confirmError) {
      setError(confirmError.message ?? 'Paiement refusé — vérifie ta carte ou essaie une autre carte.');
      setPaying(false);
      return;
    }
    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
      onPaid();
      return;
    }
    setError('Paiement non confirmé — réessaie.');
    setPaying(false);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Tu rembourses <strong>{formatFcfa(amountFcfa)}</strong> de ta dette
        par carte. Le montant est déduit de ta dette immédiatement,
        sans attendre une validation admin — et sans frais
        supplémentaires pour toi.
      </p>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={pay}
        disabled={!stripe || !elements || paying}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-full text-sm font-black bg-rose-500 text-night-900 hover:bg-rose-300 transition-colors disabled:opacity-50"
      >
        {paying ? (
          <>
            <LogoLoader size={18} /> Paiement en cours…
          </>
        ) : (
          <>
            <DriveCreditCard size={16} /> Payer {formatFcfa(amountFcfa)}
          </>
        )}
      </button>
      <button type="button" onClick={onCancel} className="w-full text-sm font-bold text-slate-400 hover:underline">
        Pas maintenant
      </button>
    </div>
  );
}

/** Remboursement de dette par carte (v2.55) : le chauffeur paie
 *  tout ou partie de sa dette de commission par carte — le
 *  règlement est appliqué automatiquement au grand livre dès la
 *  confirmation Stripe (aucune action admin). */
export function DebtCardPayment({ owed, onPaid }: { owed: number; onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidMessage, setPaidMessage] = useState<string | null>(null);

  const amountValue = Number(amount);

  async function startPayment() {
    if (!Number.isFinite(amountValue) || amountValue < 50 || amountValue > owed) return;
    setLoading(true);
    setError(null);
    try {
      const [configRes, debtRes] = await Promise.all([
        fetch('/api/stripe/config'),
        fetch('/api/stripe/debt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amountFcfa: amountValue }),
        }),
      ]);
      const config = await configRes.json().catch(() => null);
      const debt = await debtRes.json().catch(() => null);
      if (!config?.configured || !config?.publishableKey) {
        setError('Le paiement par carte n’est pas encore activé.');
        return;
      }
      if (!debtRes.ok || !debt?.clientSecret) {
        setError(debt?.error ?? 'Paiement impossible pour le moment.');
        return;
      }
      setStripePromise(loadStripe(config.publishableKey));
      setClientSecret(debt.clientSecret);
      setOpen(true);
    } catch {
      setError('Connexion impossible — vérifie ton réseau et réessaie.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 border border-slate-200 p-4">
      <p className="text-sm font-bold text-slate-900">Rembourser par carte</p>
      <p className="text-sm text-slate-500">
        Paie tout ou partie de tes {formatFcfa(owed)} de dette par carte —
        déduit immédiatement, sans attendre une validation.
      </p>
      {paidMessage && (
        <p role="status" className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          {paidMessage}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          min={50}
          max={owed}
          step={50}
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Montant (max ${owed})`}
          className="flex-1 min-w-[140px] px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-bold text-slate-900 focus:border-sarcelle focus:outline-none"
          aria-label="Montant à rembourser par carte"
        />
        <button
          type="button"
          onClick={() => setAmount(String(owed))}
          className="px-4 py-2.5 rounded-full text-xs font-black bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Tout rembourser
        </button>
        <button
          type="button"
          onClick={startPayment}
          disabled={loading || !Number.isFinite(amountValue) || amountValue < 50 || amountValue > owed}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black bg-rose-500 text-night-900 hover:bg-rose-300 transition-colors disabled:opacity-50"
        >
          {loading ? <LogoLoader size={16} /> : <DriveCreditCard size={15} />} Payer par carte
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {open && stripePromise && clientSecret && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Rembourser ma dette par carte">
          <div className="w-full max-w-md bg-night-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="font-black text-lg text-white flex items-center gap-2">
                <DriveCreditCard size={20} className="text-rose-300" /> Rembourser par carte
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none px-2"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' } }}>
              <DebtPayForm
                amountFcfa={amountValue}
                onPaid={() => {
                  setOpen(false);
                  setPaidMessage(`${formatFcfa(amountValue)} remboursés par carte — ta dette est à jour.`);
                  setAmount('');
                  onPaid();
                }}
                onCancel={() => setOpen(false)}
              />
            </Elements>
          </div>
        </div>
      )}
    </div>
  );
}
