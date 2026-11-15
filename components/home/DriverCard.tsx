'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DriveCheck, DriveCheckBadge, DriveClock, DriveCopy, DriveGift, DriveKey, DriveLink, DriveMessage, DrivePhone, DrivePin, DriveShare, DriveShieldAlert, DriveStar, DriveX } from '@/components/icons/DriveUi';
import { DriveCarMini } from '@/components/icons/DriveCar';
import type { DriverProfile, Ride } from '@/types';
import { formatFcfa } from '@/lib/commission';
import type { TrustedContact } from '@/lib/trusted-contacts';

/** Carte du chauffeur assigné : photo (initiale), nom, note, véhicule,
 *  plaque bien visible AVANT la montée + SOS + partage de course.
 *  Confidentialité (v2.20) : le numéro de téléphone du chauffeur ne
 *  s'affiche JAMAIS — ni avant, ni pendant, ni après la course. Pour
 *  joindre ton chauffeur, la messagerie in-app uniquement (bouton
 *  « Message » ci-dessous, vers la conversation de la course). Le
 *  seul `tel:` restant est le 112 (urgences, dans la modale SOS).
 *
 *  Code PIN (v2.23) : dès le matching (course acceptée), le code est
 *  affiché EN GRAND sur cette carte — le passager le voit sans aller
 *  sur la page de la course. SOS enrichi (v2.23) : au moment de
 *  l'appel, la position GPS + les infos de la course (véhicule,
 *  plaque, chauffeur, passager, prix, lien de suivi) sont préparées
 *  pour le dispatcher et envoyées à l'autre partie de la course. */
export function DriverCard({
  driver,
  ride,
  etaMin,
  shareUrl,
  detailUrl,
  pinCode,
  onCancel,
  cancelling,
}: {
  driver: DriverProfile;
  ride: Ride;
  etaMin: number | null;
  shareUrl: string;
  detailUrl: string;
  /** Code PIN du passager (v2.23) : visible dès le matching. */
  pinCode?: string | null;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const [sosOpen, setSosOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sosSummary, setSosSummary] = useState<string | null>(null);
  const [sosMapsUrl, setSosMapsUrl] = useState<string | null>(null);
  const [sosSending, setSosSending] = useState(false);
  const [sosCopied, setSosCopied] = useState(false);
  const [sosContacts, setSosContacts] = useState<TrustedContact[] | null>(null);

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

  /** SOS enrichi (v2.23) : à l'ouverture de la modale, on capture la
   *  position GPS et on l'envoie au serveur avec les infos de la
   *  course — l'autre partie de la course est alertée immédiatement,
   *  l'alerte est tracée (admin). Le résumé est copié dans le
   *  presse-papiers pour être lu au dispatcher du 112. L'appel 112
   *  lui-même reste un `tel:112` déclenché par l'utilisateur. */
  async function openSos() {
    setSosOpen(true);
    setSosSending(true);
    const position = await new Promise<{ lat: number; lng: number; accuracy: number } | null>(
      (resolve) => {
        if (!('geolocation' in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
        );
      }
    );
    const priceLabel = ride.loyaltyFree
      ? '0 FCFA — 10e course offerte'
      : ride.proposedPrice !== null
        ? formatFcfa(ride.proposedPrice)
        : `estimation ${formatFcfa(ride.estimatedPrice)}`;
    let summary =
      `SOS Stacks Drive — ${ride.pickup} → ${ride.destination}. ` +
      `Chauffeur : ${driver.name} — ${driver.vehicleLabel}${driver.plate ? ` (plaque ${driver.plate})` : ''}. ` +
      `Prix : ${priceLabel}. Suivi en direct : ${window.location.origin}${shareUrl}.`;
    let mapsUrl: string | null = null;
    try {
      const res = await fetch(`/api/rides/${ride.id}/sos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          position ? { lat: position.lat, lng: position.lng, accuracy: position.accuracy } : {}
        ),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.sos) {
        mapsUrl = data.sos.mapsUrl ?? null;
        summary =
          `SOS Stacks Drive — ${data.sos.pickup} → ${data.sos.destination}. ` +
          `Chauffeur : ${data.sos.driverName ?? '—'} — ${data.sos.vehicle ?? ''}${data.sos.plate ? ` (plaque ${data.sos.plate})` : ''}. ` +
          `Passager : ${data.sos.passengerName ?? '—'}. Prix : ${data.sos.priceLabel}. ` +
          (mapsUrl ? `Position : ${mapsUrl}. ` : 'Position GPS non disponible. ') +
          `Suivi en direct : ${window.location.origin}${data.sos.shareUrl}.`;
      } else if (position) {
        mapsUrl = `https://www.google.com/maps?q=${position.lat},${position.lng}`;
        summary += ` Position : ${mapsUrl}.`;
      }
    } catch {
      if (position) {
        mapsUrl = `https://www.google.com/maps?q=${position.lat},${position.lng}`;
        summary += ` Position : ${mapsUrl}.`;
      }
    }
    setSosSummary(summary);
    setSosMapsUrl(mapsUrl);
    setSosSending(false);
    try {
      await navigator.clipboard.writeText(summary);
      setSosCopied(true);
    } catch {
      // Presse-papiers indisponible : le résumé reste affiché.
    }
    // Contacts de confiance (urgence) : pour les prévenir en 1 tap.
    fetch('/api/trusted-contacts')
      .then((r) => r.json())
      .then((d) => setSosContacts((d?.contacts ?? []) as TrustedContact[]))
      .catch(() => setSosContacts([]));
  }

  async function copySosSummary() {
    if (!sosSummary) return;
    try {
      await navigator.clipboard.writeText(sosSummary);
      setSosCopied(true);
      window.setTimeout(() => setSosCopied(false), 2500);
    } catch {
      // Presse-papiers indisponible : le résumé reste affiché.
    }
  }

  return (
    <div className="rise-in bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <span className="w-14 h-14 rounded-full bg-rose-500 text-night-900 text-xl font-black flex items-center justify-center shrink-0">
          {driver.name.trim().charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-white text-lg leading-tight flex flex-wrap items-center gap-1.5">
            <span className="truncate">{driver.name}</span>
            {driver.isVerified && (
              <span className="inline-flex items-center gap-0.5 text-xs font-black text-sarcelle shrink-0">
                <DriveCheckBadge size={15} /> Vérifié
              </span>
            )}
          </p>
          <p className="text-sm text-slate-400 flex flex-wrap items-center gap-x-2">
            <span className="inline-flex items-center gap-1">
              <DriveStar size={14} className="text-corail fill-corail" />
              {driver.rating ? driver.rating.toFixed(1) : 'Nouveau'} · {driver.trips} courses
            </span>
            {etaMin !== null && (
              <span className="inline-flex items-center gap-1">
                <DriveClock size={14} /> arrive dans ~{etaMin} min
              </span>
            )}
          </p>
        </div>
        {/* Messagerie in-app (v2.20) : le téléphone du chauffeur ne
            s'affiche jamais — on le joint par la conversation de la
            course, pas par appel direct. */}
        <Link
          href={`/courses/${ride.id}#messages`}
          className="w-11 h-11 rounded-full bg-sarcelle/15 text-sarcelle flex items-center justify-center shrink-0 hover:bg-sarcelle/25 transition-colors"
          aria-label={`Écrire à ${driver.name} par messagerie`}
          title="Écrire à ton chauffeur (messagerie in-app)"
        >
          <DriveMessage size={20} />
        </Link>
      </div>

      {/* Véhicule + plaque : à vérifier AVANT de monter. */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <DriveCarMini variant="sedan" size={16} tone="light" />
          {driver.vehicleLabel} · {driver.vehicleType ?? ''}
        </p>
        <p className="font-black text-white tracking-widest bg-night-900 border border-white/15 rounded-lg px-3 py-1.5">
          {driver.plate ?? '—'}
        </p>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Vérifie la plaque avant de monter. Prix :{' '}
        <strong className="text-slate-200">
          {ride.loyaltyFree
            ? (<>0 FCFA — 10e course offerte <DriveGift size={12} className="inline-block" /></>)
            : ride.proposedPrice !== null
              ? formatFcfa(ride.proposedPrice)
              : `En attente des propositions (estimation : ${formatFcfa(ride.estimatedPrice)})`}
        </strong>
        {' '}· {ride.paymentMethod === 'especes' ? 'Espèces' : ride.paymentMethod === 'airtel' ? 'Airtel Money' : 'Moov Money'}
      </p>

      {/* Code PIN dès le matching (v2.23) : visible ici, sur l'écran
          où le chauffeur vient d'être confirmé — pas seulement sur la
          page de la course. */}
      {pinCode && ['acceptee', 'en_cours'].includes(ride.status) && (
        <div className="bg-night-900 border border-corail/40 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-black text-white flex items-center gap-2">
              <DriveKey size={18} className="text-corail" />
              Ton code de démarrage
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Donne ce code à ton chauffeur quand il arrive — c’est lui qui démarre le trajet avec.
            </p>
          </div>
          <p className="font-black text-4xl tracking-[0.3em] text-corail" aria-label={`Code : ${pinCode.split('').join(' ')}`}>
            {pinCode}
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={openSos}
          className="sos-pulse inline-flex items-center justify-center gap-1.5 bg-red-600 text-white text-sm font-black py-3 rounded-full hover:bg-red-700 transition-colors"
        >
          <DriveShieldAlert size={16} /> SOS
        </button>
        <button
          type="button"
          onClick={copyShareLink}
          className="inline-flex items-center justify-center gap-1.5 bg-white/10 text-slate-200 text-sm font-black py-3 rounded-full hover:bg-white/15 transition-colors"
        >
          <DriveShare size={16} /> {copied ? 'Lien copié !' : 'Partager'}
        </button>
        <Link
          href={detailUrl}
          className="inline-flex items-center justify-center gap-1.5 bg-rose-500 text-night-900 text-sm font-black py-3 rounded-full hover:bg-rose-300 transition-colors"
        >
          <DriveLink size={16} /> Suivi
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
                <DriveX size={16} />
              </button>
            </div>
            {/* Infos SOS préparées (v2.23) : position + course, copiées
                pour le dispatcher — l'autre partie de la course est
                déjà alertée. */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <DrivePin size={13} /> Infos transmises avec ton appel
              </p>
              {sosSending ? (
                <p className="text-sm text-slate-300">Récupération de ta position…</p>
              ) : sosSummary ? (
                <>
                  <p className="text-sm text-slate-200 leading-relaxed">{sosSummary}</p>
                  {sosMapsUrl && (
                    <a
                      href={sosMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-bold text-sarcelle hover:underline"
                    >
                      Voir ma position sur la carte →
                    </a>
                  )}
                  <p className="text-xs text-slate-500">
                    {sosCopied
                      ? '✓ Résumé copié — colle-le au dispatcher si besoin.'
                      : 'Le résumé est aussi dans ton presse-papiers.'}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-300">
                  {ride.pickup} → {ride.destination} · {driver.vehicleLabel}
                  {driver.plate ? ` · plaque ${driver.plate}` : ''} ·{' '}
                  {ride.proposedPrice !== null ? formatFcfa(ride.proposedPrice) : 'prix en attente'}.
                </p>
              )}
              <button
                type="button"
                onClick={copySosSummary}
                disabled={!sosSummary}
                className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-200 bg-white/10 px-3 py-2 rounded-full hover:bg-white/15 transition-colors disabled:opacity-50"
              >
                {sosCopied ? <DriveCheck size={15} /> : <DriveCopy size={15} />}
                {sosCopied ? 'Infos copiées !' : 'Copier les infos SOS'}
              </button>
            </div>
            {sosContacts !== null && sosContacts.length > 0 && sosSummary && (
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  Prévenir mes contacts de confiance
                </p>
                <div className="flex flex-wrap gap-2">
                  {sosContacts.map((c) => (
                    <a
                      key={c.id}
                      href={`https://wa.me/${c.phone.replace(/[^0-9]/g, '').replace(/^0/, '241')}?text=${encodeURIComponent(`[URGENCE] SOS Stacks Drive — ${sosSummary}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-green-600 px-3 py-2 rounded-full hover:bg-green-700 transition-colors"
                    >
                      <DriveMessage size={15} /> {c.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
            <a
              href="tel:112"
              className="flex items-center justify-center gap-2 bg-red-600 text-white font-black py-4 rounded-full hover:bg-red-700 transition-colors"
            >
              <DrivePhone size={18} /> Appeler les urgences — 112
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
