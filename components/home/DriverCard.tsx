'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  Car,
  Clock,
  Link2,
  Phone,
  Share2,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react';
import type { DriverProfile, Ride } from '@/types';
import { formatFcfa } from '@/lib/commission';

/** Carte du chauffeur assigné : photo (initiale), nom, note, véhicule,
 *  plaque bien visible AVANT la montée + SOS + partage de course. */
export function DriverCard({
  driver,
  ride,
  etaMin,
  shareUrl,
  detailUrl,
  onCancel,
  cancelling,
}: {
  driver: DriverProfile;
  ride: Ride;
  etaMin: number | null;
  shareUrl: string;
  detailUrl: string;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const [sosOpen, setSosOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const tel = (driver.phone ?? '').replace(/[^+0-9]/g, '');

  async function copyShareLink() {
    const url = `${window.location.origin}${shareUrl}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Presse-papiers indisponible : on ouvre quand même le lien.
      window.open(url, '_blank');
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="rise-in bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 rounded-full bg-or text-night-900 text-xl font-black flex items-center justify-center shrink-0">
          {driver.name.trim().charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-white text-lg leading-tight flex flex-wrap items-center gap-1.5">
            <span className="truncate">{driver.name}</span>
            {driver.isVerified && (
              <span className="inline-flex items-center gap-0.5 text-xs font-black text-cyan shrink-0">
                <BadgeCheck size={15} /> Vérifié
              </span>
            )}
          </p>
          <p className="text-sm text-slate-400 flex flex-wrap items-center gap-x-2">
            <span className="inline-flex items-center gap-1">
              <Star size={14} className="text-gold fill-gold" />
              {driver.rating ? driver.rating.toFixed(1) : 'Nouveau'} · {driver.trips} courses
            </span>
            {etaMin !== null && (
              <span className="inline-flex items-center gap-1">
                <Clock size={14} /> arrive dans ~{etaMin} min
              </span>
            )}
          </p>
        </div>
        {driver.phone && (
          <a
            href={`tel:${tel}`}
            className="w-11 h-11 rounded-full bg-cyan/15 text-cyan flex items-center justify-center shrink-0 hover:bg-cyan/25 transition-colors"
            aria-label={`Appeler ${driver.name}`}
          >
            <Phone size={20} />
          </a>
        )}
      </div>

      {/* Véhicule + plaque : à vérifier AVANT de monter. */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <Car size={16} className="text-slate-400" />
          {driver.vehicleLabel} · {driver.vehicleType ?? ''}
        </p>
        <p className="font-black text-white tracking-widest bg-night-900 border border-white/15 rounded-lg px-3 py-1.5">
          {driver.plate ?? '—'}
        </p>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Vérifie la plaque avant de monter. Prix :{' '}
        <strong className="text-slate-200">
          {ride.loyaltyFree ? '0 FCFA — 10e course offerte 🎁' : formatFcfa(ride.proposedPrice ?? ride.estimatedPrice)}
        </strong>
        {' '}· {ride.paymentMethod === 'especes' ? 'Espèces' : ride.paymentMethod === 'airtel' ? 'Airtel Money' : 'Moov Money'}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => setSosOpen(true)}
          className="sos-pulse inline-flex items-center justify-center gap-1.5 bg-red-600 text-white text-sm font-black py-3 rounded-full hover:bg-red-700 transition-colors"
        >
          <ShieldAlert size={16} /> SOS
        </button>
        <button
          type="button"
          onClick={copyShareLink}
          className="inline-flex items-center justify-center gap-1.5 bg-white/10 text-slate-200 text-sm font-black py-3 rounded-full hover:bg-white/15 transition-colors"
        >
          <Share2 size={16} /> {copied ? 'Lien copié !' : 'Partager'}
        </button>
        <Link
          href={detailUrl}
          className="inline-flex items-center justify-center gap-1.5 bg-or text-night-900 text-sm font-black py-3 rounded-full hover:bg-or-light transition-colors"
        >
          <Link2 size={16} /> Suivi
        </Link>
      </div>

      {onCancel && (
        <button
          type="button"
          disabled={cancelling}
          onClick={onCancel}
          className="w-full text-sm font-bold text-red-400 hover:underline disabled:opacity-50"
        >
          Annuler la course
        </button>
      )}

      {/* Modale SOS */}
      {sosOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="SOS — urgence"
          onClick={() => setSosOpen(false)}
        >
          <div
            className="bg-night-800 border border-white/10 rounded-3xl p-6 w-full max-w-sm space-y-4 sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-lg text-white">Besoin d’aide ?</h3>
                <p className="text-sm text-slate-400 mt-1">
                  Ta course en cours est partagée en direct via ton lien de suivi.
                  Appelle les urgences si tu te sens en danger.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSosOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300 shrink-0"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 bg-red-600 text-white font-black py-4 rounded-full hover:bg-red-700 transition-colors"
            >
              <Phone size={18} /> Appeler les urgences — 112
            </a>
            <button
              type="button"
              onClick={copyShareLink}
              className="w-full bg-white/10 text-white font-black py-4 rounded-full hover:bg-white/15 transition-colors"
            >
              {copied ? 'Lien de suivi copié !' : 'Partager ma course en direct'}
            </button>
            <p className="text-xs text-slate-500 text-center">
              Ton proche voit ton trajet, ton chauffeur et sa plaque en direct.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
