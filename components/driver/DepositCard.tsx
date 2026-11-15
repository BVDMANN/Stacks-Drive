'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { DriveCreditCard, DriveShield } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { formatFcfa } from '@/lib/commission';
import { DEPOSIT_FCFA } from '@/lib/gamification';

type DepositStatus = {
  status: string;
  amount_fcfa: number;
  fees_fcfa: number;
  charged_fcfa: number;
  refund_amount_fcfa: number | null;
  refund_note: string | null;
  refunded_at: string | null;
  created_at: string;
} | null;

function DepositPayForm({
  depositFcfa,
  feesFcfa,
  chargedFcfa,
  onPaid,
  onCancel,
}: {
  depositFcfa: number;
  feesFcfa: number;
  chargedFcfa: number;
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
      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-1.5 text-sm">
        <div className="flex justify-between text-slate-300">
          <span>Caution (dépôt de garantie remboursable)</span>
          <span className="font-bold text-white">{formatFcfa(depositFcfa)}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Frais de paiement par carte</span>
          <span className="font-bold text-white">{formatFcfa(feesFcfa)}</span>
        </div>
        <div className="flex justify-between border-t border-white/10 pt-2 text-base">
          <span className="font-black text-white">Total débité</span>
          <span className="font-black text-rose-300">{formatFcfa(chargedFcfa)}</span>
        </div>
        <p className="text-xs text-slate-400 pt-1">
          Ta caution de {formatFcfa(depositFcfa)} te sera remboursée
          automatiquement quand tu quitteras la plateforme proprement
          (dette déduite s’il y en a une, sauf fraude confirmée).
        </p>
      </div>
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <p role="alert" className="text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
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
            <DriveCreditCard size={16} /> Payer {formatFcfa(chargedFcfa)}
          </>
        )}
      </button>
      <p className="text-xs text-center text-slate-400 flex items-center justify-center gap-1.5">
        <DriveShield size={13} className="text-sarcelle" />
        Paiement sécurisé par Stripe — 3-D Secure. Stacks Drive ne voit jamais ton numéro de carte.
      </p>
      <button type="button" onClick={onCancel} className="w-full text-sm font-bold text-slate-400 hover:underline">
        Pas maintenant
      </button>
    </div>
  );
}

/** Caution chauffeur par carte (v2.55) : payer les 5 000 FCFA
 *  de dépôt par carte, voir son statut, et quitter la plateforme
 *  (remboursement automatique). */
export function DepositCard() {
  const [deposit, setDeposit] = useState<DepositStatus>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [charged, setCharged] = useState<{ fees: number; charged: number } | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const fetchDeposit = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stripe/deposit');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? 'Caution indisponible pour le moment.');
        return;
      }
      setDeposit(data.deposit as DepositStatus);
    } catch {
      setError('Connexion impossible — vérifie ton réseau et réessaie.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeposit();
  }, [fetchDeposit]);

  async function openPay() {
    setPayLoading(true);
    setPayError(null);
    try {
      const [configRes, depositRes] = await Promise.all([
        fetch('/api/stripe/config'),
        fetch('/api/stripe/deposit', { method: 'POST' }),
      ]);
      const config = await configRes.json().catch(() => null);
      const dep = await depositRes.json().catch(() => null);
      if (!config?.configured || !config?.publishableKey) {
        setPayError('Le paiement par carte n’est pas encore activé.');
        return;
      }
      if (!depositRes.ok || !dep?.clientSecret) {
        setPayError(dep?.error ?? 'Paiement de la caution impossible pour le moment.');
        return;
      }
      setStripePromise(loadStripe(config.publishableKey));
      setClientSecret(dep.clientSecret);
      setCharged({ fees: dep.feesFcfa ?? 0, charged: dep.chargedFcfa ?? DEPOSIT_FCFA });
      setPayOpen(true);
    } catch {
      setPayError('Connexion impossible — vérifie ton réseau et réessaie.');
    } finally {
      setPayLoading(false);
    }
  }

  async function leave() {
    setLeaving(true);
    setLeaveMessage(null);
    try {
      const res = await fetch('/api/driver/leave', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setLeaveMessage(data?.error ?? 'Départ impossible pour le moment.');
        return;
      }
      setLeaveMessage(data.message as string);
      setLeaveConfirm(false);
      await fetchDeposit();
    } catch {
      setLeaveMessage('Connexion impossible — vérifie ton réseau et réessaie.');
    } finally {
      setLeaving(false);
    }
  }

  if (loading) {
    return (
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm">
        <LogoLoader size={32} label="Chargement de ta caution…" />
      </section>
    );
  }

  const paid = deposit?.status === 'paye';
  const refunded = deposit?.status === 'rembourse' || deposit?.status === 'rembourse_partiel';
  const forfeited = deposit?.status === 'confisque';

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
      <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
        <DriveShield size={20} className="text-stacks-green" /> Ta caution
      </h2>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>
      )}

      {!deposit && !error && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Pour rouler avec Stacks Drive, verse un dépôt de garantie
            remboursable de <strong>{formatFcfa(DEPOSIT_FCFA)}</strong>.
            Tu peux le payer par carte ici — les frais ({formatFcfa(450)})
            sont à ta charge, le dépôt te sera remboursé quand tu
            quitteras la plateforme proprement.
          </p>
          {payError && (
            <p role="alert" className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">{payError}</p>
          )}
          <button
            type="button"
            onClick={openPay}
            disabled={payLoading}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-black bg-rose-500 text-night-900 hover:bg-rose-300 transition-colors disabled:opacity-50"
          >
            {payLoading ? (
              <>
                <LogoLoader size={18} /> Préparation…
              </>
            ) : (
              <>
                <DriveCreditCard size={16} /> Payer ma caution par carte
              </>
            )}
          </button>
        </div>
      )}

      {deposit && paid && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            <span className="inline-block text-xs font-black px-3 py-1.5 rounded-full bg-green-100 text-green-800 border border-green-300">
              Caution versée — {formatFcfa(deposit.amount_fcfa)}
            </span>
          </p>
          <p className="text-sm text-slate-500">
            Remboursée automatiquement quand tu quittes la plateforme
            proprement, après avoir soldé ce que tu dois (sauf fraude
            confirmée). Retour sur ta carte sous 5 à 10 jours ouvrés.
          </p>
        </div>
      )}

      {deposit && refunded && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
            Caution remboursée : {formatFcfa(deposit.refund_amount_fcfa ?? 0)}
            {deposit.refunded_at && ` — le ${new Date(deposit.refunded_at).toLocaleDateString('fr-FR')}`}.
          </p>
          {deposit.refund_note && <p className="text-sm text-slate-500">{deposit.refund_note}</p>}
        </div>
      )}

      {deposit && forfeited && (
        <div className="space-y-2">
          <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            Caution confisquée.
          </p>
          {deposit.refund_note && <p className="text-sm text-slate-500">{deposit.refund_note}</p>}
        </div>
      )}

      {deposit && deposit.status === 'en_attente' && (
        <div className="space-y-3">
          <p className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Paiement de la caution en cours — termine le paiement pour activer ton compte chauffeur.
          </p>
          <button
            type="button"
            onClick={openPay}
            disabled={payLoading}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-sm font-black bg-rose-500 text-night-900 hover:bg-rose-300 transition-colors disabled:opacity-50"
          >
            {payLoading ? <LogoLoader size={18} /> : <DriveCreditCard size={16} />} Reprendre le paiement
          </button>
        </div>
      )}

      {/* Quitter la plateforme (remboursement automatique) */}
      {paid && !leaveConfirm && (
        <button
          type="button"
          onClick={() => setLeaveConfirm(true)}
          className="text-sm font-bold text-red-600 hover:underline"
        >
          Quitter Stacks Drive (ma caution sera remboursée automatiquement)
        </button>
      )}
      {paid && leaveConfirm && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 space-y-3">
          <p className="text-sm font-bold text-red-800">
            Tu es sûr de vouloir quitter ? Ton compte chauffeur sera fermé
            et ta caution de {formatFcfa(DEPOSIT_FCFA)} remboursée
            automatiquement sur ta carte (dette déduite s’il y en a une).
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={leave}
              disabled={leaving}
              className="px-5 py-2.5 rounded-full text-sm font-black bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
            >
              {leaving ? <LogoLoader size={16} /> : 'Oui, quitter et me faire rembourser'}
            </button>
            <button
              type="button"
              onClick={() => setLeaveConfirm(false)}
              className="px-5 py-2.5 rounded-full text-sm font-black bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
      {leaveMessage && (
        <p role="status" className="text-sm font-bold text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          {leaveMessage}
        </p>
      )}

      {/* Feuille de paiement de la caution */}
      {payOpen && stripePromise && clientSecret && charged && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Payer la caution par carte">
          <div className="w-full max-w-md bg-night-900 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl max-h-[92dvh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <h2 className="font-black text-lg text-white flex items-center gap-2">
                <DriveCreditCard size={20} className="text-rose-300" /> Payer ma caution
              </h2>
              <button
                type="button"
                onClick={() => setPayOpen(false)}
                className="text-slate-400 hover:text-white text-xl leading-none px-2"
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'night' } }}>
              <DepositPayForm
                depositFcfa={DEPOSIT_FCFA}
                feesFcfa={charged.fees}
                chargedFcfa={charged.charged}
                onPaid={async () => {
                  setPayOpen(false);
                  await fetchDeposit();
                }}
                onCancel={() => setPayOpen(false)}
              />
            </Elements>
          </div>
        </div>
      )}
    </section>
  );
}
