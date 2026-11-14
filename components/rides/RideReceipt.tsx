'use client';

import { Printer, ReceiptText } from 'lucide-react';
import type { RideReceipt } from '@/lib/receipt';

/** Reçu détaillé après chaque course (v2.23, plancher P0a) : prix,
 *  distance, durée, chauffeur, commission. Montants figés à
 *  l'acceptation — jamais recalculés ici. Export / impression (v2.30,
 *  P1) : `window.print` + CSS print (`styles/globals.css`, zone
 *  `.print-receipt` seule imprimée) — aucune dépendance, aucun
 *  service payant, aucun compte. */
export function RideReceiptCard({ receipt }: { receipt: RideReceipt }) {
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Trajet', value: `${receipt.pickup} → ${receipt.destination}` },
    { label: 'Type', value: receipt.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier' },
    { label: 'Distance', value: receipt.distanceLabel },
    { label: 'Durée', value: receipt.durationLabel },
    { label: 'Chauffeur', value: receipt.driverName ?? '—' },
    ...(receipt.vehicleLabel
      ? [{ label: 'Véhicule', value: `${receipt.vehicleLabel}${receipt.plate ? ` · ${receipt.plate}` : ''}` }]
      : []),
    { label: 'Paiement', value: receipt.paymentLabel },
    {
      label: 'Commission Stacks Drive',
      value:
        receipt.commissionRatePct !== null
          ? `${receipt.commissionLabel} (${receipt.commissionRatePct} %)`
          : receipt.commissionLabel,
    },
    { label: 'Part du chauffeur', value: receipt.driverShareLabel },
  ];
  return (
    <div className="space-y-3 print-receipt">
      <div className="flex items-start justify-between gap-3 print:hidden">
        <h2 className="font-black text-slate-900 flex items-center gap-1.5">
          <ReceiptText size={18} className="text-stacks-green" /> Reçu de la course
        </h2>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-black bg-stacks-navy text-white hover:bg-slate-800 active:scale-95 transition-all shrink-0"
        >
          <Printer size={14} /> Imprimer / Exporter le reçu
        </button>
      </div>
      <h2 className="hidden print:block font-black text-slate-900 text-lg">
        Reçu Stacks Drive
      </h2>
      <div className="bg-night-900 rounded-2xl p-5 text-center">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Montant payé</p>
        <p className="font-black text-3xl text-gold mt-1">{receipt.priceLabel}</p>
        <p className="text-xs text-slate-400 mt-1">
          Prix convenu et figé à l’acceptation — aucun supplément ajouté en route.
        </p>
      </div>
      <dl className="divide-y divide-slate-100 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="py-2 flex items-start justify-between gap-3">
            <dt className="text-slate-500">{r.label}</dt>
            <dd className="font-bold text-slate-900 text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
