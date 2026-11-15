import { DriveWallet } from '@/components/icons/DriveUi';

/** Écran « À payer » à l'arrivée (v2.23, plancher P0a) : le montant
 *  exact, figé à l'acceptation — zéro négociation au moment de payer.
 *  Affiché pendant la course (en_cours) côté passager, et côté
 *  chauffeur en « À encaisser ». */
export function AmountToPay({
  amountLabel,
  paymentLabel,
  forDriver,
}: {
  amountLabel: string;
  paymentLabel: string;
  forDriver?: boolean;
}) {
  return (
    <div
      className="bg-night-900 border border-white/10 rounded-3xl p-6 shadow-sm text-slate-100 space-y-2"
      role="status"
    >
      <p className="font-black text-lg flex items-center gap-2">
        <DriveWallet size={20} className="text-corail" />
        {forDriver ? 'À encaisser' : 'À payer'}
      </p>
      <p className="font-black text-4xl sm:text-5xl text-corail tracking-tight">{amountLabel}</p>
      <p className="text-sm text-slate-300">
        {forDriver ? 'À recevoir du passager' : 'À remettre à ton chauffeur'} · {paymentLabel} · prix
        figé à l’acceptation — aucun supplément, aucune négociation au moment de payer.
      </p>
    </div>
  );
}
