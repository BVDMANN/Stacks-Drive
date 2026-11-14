'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Car,
  Flame,
  Gift,
  Loader2,
  MapPin,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { SessionProfile } from '@/lib/supabase/server';
import type { DriverEarningsSummary } from '@/lib/earnings';
import type { PassengerRating, Ride, RideProposal } from '@/types';
import { SELECTABLE_NEIGHBORHOODS, type Neighborhood } from '@/lib/neighborhoods';
import { POINTS_REDEEM_TARGET } from '@/lib/gamification';
import { formatFcfa } from '@/lib/commission';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { RequestPopup } from './RequestPopup';
import { SelfieRecheckCard } from './SelfieRecheckCard';
import { isSelfieRecheckDue } from '@/lib/selfie-recheck';
import { DriverNotices } from './DriverNotices';
import { SeatsPopup } from './SeatsPopup';
import { DriverStatusBadge } from './DriverStatusBadge';
import type { DriverStatus } from '@/types';
import { ToastStack, useToastStack } from '@/components/shared/Toast';
import { detectProposalEvents, type ProposalSnapshot } from '@/lib/proposal-events';
import { pollingIntervalMs, useRealtimeSubscription } from '@/lib/realtime';

interface IncomingRide {
  ride: Ride;
  passenger: { name: string | null; phone: string | null } | null;
  /** Note moyenne du passager (v2.30) — jointe par /api/rides. */
  passengerRating?: PassengerRating | null;
}

/** Accueil chauffeur (v2.3) — l'écran d'accueil vu par un chauffeur
 *  connecté n'est PLUS celui du passager : pas de formulaire de
 *  commande, pas de pastilles de tarifs, pas d'autres chauffeurs sur
 *  la carte. Hiérarchie propre au chauffeur : statut (en ligne /
 *  hors ligne) → argent (gains du jour, montant dû, points) →
 *  demandes entrantes. Le tableau de bord complet (/tableau-de-bord)
 *  garde l'historique, les quêtes et les badges.
 *
 *  La bascule en ligne réutilise la logique du tableau de bord :
 *  même endpoint (PATCH /api/profile), même garde de vérification
 *  (selfie + pièce d'identité obligatoires), même nudge de quête
 *  quand on se déconnecte presque à temps. */
export function DriverHome({ profile }: { profile: SessionProfile }) {
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(profile.is_online);
  const [area, setArea] = useState<Neighborhood | ''>(
    (profile.current_area as Neighborhood | '') ?? ''
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<DriverEarningsSummary | null>(null);
  const [incoming, setIncoming] = useState<IncomingRide[]>([]);
  const [popupRide, setPopupRide] = useState<IncomingRide | null>(null);
  // Demandes sans chauffeur près de moi (v2.27) : une demande sans
  // proposition depuis plus de 2 min — une seule alerte par demande,
  // sans spam (unicité en base).
  const [unanswered, setUnanswered] = useState<
    { rideId: string; pickup: string; destination: string; rideType: string; waitingMin: number }[]
  >([]);
  const [debtBlocked, setDebtBlocked] = useState<{ amount: number; cap: number } | null>(null);
  const [offlineConfirm, setOfflineConfirm] = useState<{ remaining: number; bonus: number } | null>(null);
  // Places libres + statut (v2.19) : déclarées à la mise en ligne
  // (pop-up) et modifiables à tout moment (« Mes places »).
  const [seatsInfo, setSeatsInfo] = useState<{
    capacity: number | null;
    freeSeats: number;
    status: DriverStatus;
    activeRideTypes: string[];
  } | null>(null);
  const [seatsPopupOpen, setSeatsPopupOpen] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());
  const proposedRef = useRef<Set<string>>(new Set());

  // Notifications pop-up de négociation (v2.12) : le chauffeur est
  // alerté quand un passager contre-propose et quand son prix est
  // accepté (figé). Auto-fermeture ~6 s.
  const { toasts, push: pushToast, dismiss: dismissToast } = useToastStack();
  const myProposalsSnapshotRef = useRef<ProposalSnapshot>(new Map());

  const verified = profile.is_verified;
  const verificationStatus = (profile.verification_status ?? 'non_verifie') as string;
  const vehicleLabel = [profile.vehicle_brand, profile.vehicle_model, profile.vehicle_color]
    .filter(Boolean)
    .join(' ');

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/earnings');
      const data = await res.json().catch(() => null);
      if (data?.ok) setSummary(data.summary as DriverEarningsSummary);
    } catch {
      // Réessaie au prochain tour.
    }
  }, []);

  // Places libres + statut (v2.19) : lus depuis le serveur — le
  // statut est dérivé des places libres et des courses en cours.
  const fetchSeats = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/seats');
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setSeatsInfo({
          capacity: data.capacity as number | null,
          freeSeats: data.freeSeats as number,
          status: data.status as DriverStatus,
          activeRideTypes: (data.activeRideTypes ?? []) as string[],
        });
      }
    } catch {
      // Réessaie au prochain tour.
    }
  }, []);

  const fetchIncoming = useCallback(async () => {
    try {
      const res = await fetch('/api/rides?scope=incoming');
      const data = await res.json();
      if (!data?.ok) return;
      // Plafond de dette atteint : plus de nouvelles demandes.
      if (data.debtBlocked) {
        setDebtBlocked({ amount: data.debtAmount ?? 0, cap: data.debtCap ?? 5000 });
        setIncoming([]);
        return;
      }
      setDebtBlocked(null);
      const list = (data.rides ?? []) as IncomingRide[];
      setIncoming(list);
      // Nouvelle demande jamais vue et sans proposition de ma part :
      // la pop-up s'ouvre toute seule.
      const fresh = list.find(
        (i) => !seenRef.current.has(i.ride.id) && !proposedRef.current.has(i.ride.id)
      );
      if (fresh) {
        seenRef.current.add(fresh.ride.id);
        setPopupRide(fresh);
      }
      list.forEach((i) => seenRef.current.add(i.ride.id));
    } catch {
      // Réseau instable : prochain sondage.
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchSeats();
  }, [fetchSummary, fetchSeats]);

  // Temps réel (v2.24) : nouvelles demandes et contre-propositions
  // arrivent instantanément ; les sondages (10 s / 15 s) ne restent
  // qu'en repli, plus un rafraîchissement de sécurité toutes les 60 s.
  const { live: incomingLive } = useRealtimeSubscription({
    table: 'rides',
    enabled: isOnline && verified,
    onChange: fetchIncoming,
  });
  useEffect(() => {
    if (!isOnline || !verified) return;
    fetchIncoming();
    const t = window.setInterval(fetchIncoming, pollingIntervalMs(incomingLive, 10000));
    return () => window.clearInterval(t);
  }, [isOnline, verified, fetchIncoming, incomingLive]);

  // Demandes sans chauffeur près de moi (v2.27) : sondage toutes les
  // 30 s, en ligne seulement. La liste exclut les demandes déjà dans
  // mes entrantes (un chauffeur qui peut proposer l'a déjà reçue).
  const fetchUnanswered = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/unanswered');
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        const incomingIds = new Set(incoming.map((i) => i.ride.id));
        setUnanswered(
          ((data.zones ?? []) as {
            rideId: string;
            pickup: string;
            destination: string;
            rideType: string;
            waitingMin: number;
          }[]).filter((z) => !incomingIds.has(z.rideId))
        );
      }
    } catch {
      // Bannière absente ce tour-ci : prochain sondage.
    }
  }, [incoming]);
  useEffect(() => {
    if (!isOnline || !verified) {
      setUnanswered([]);
      return;
    }
    fetchUnanswered();
    const t = window.setInterval(fetchUnanswered, 30000);
    return () => window.clearInterval(t);
  }, [isOnline, verified, fetchUnanswered]);

  /** Sondage de mes propositions (v2.12, toutes les 15 s, en ligne
   *  seulement) : détecte les contre-propositions des passagers et les
   *  acceptations — le chauffeur est alerté par une pop-up, avec
   *  « Accepter » directement dedans. */
  const fetchMyProposals = useCallback(async () => {
    try {
      const res = await fetch('/api/proposals?scope=mine');
      const data = await res.json();
      if (!data?.ok) return;
      const list = (data.proposals ?? []) as (RideProposal & {
        ride?: { pickup: string; destination: string } | null;
      })[];
      const { events, snapshot } = detectProposalEvents(myProposalsSnapshotRef.current, list);
      myProposalsSnapshotRef.current = snapshot;
      for (const ev of events) {
        if (ev.kind === 'counter') {
          const price = ev.proposal.counterPrice as number;
          const ride = ev.proposal.ride;
          pushToast({
            id: `counter-${ev.proposal.id}-${price}`,
            title: `Contre-proposition : ${formatFcfa(price)}`,
            message: ride
              ? `${ride.pickup} → ${ride.destination} — le passager propose ce prix.`
              : 'Le passager propose ce prix.',
            variant: 'offer',
            actions: [
              {
                label: `Accepter ${formatFcfa(price)}`,
                primary: true,
                onClick: () => acceptCounterFromToast(ev.proposal.id),
              },
              { label: 'Voir', onClick: () => router.push('/tableau-de-bord') },
            ],
          });
        } else if (ev.kind === 'accepted') {
          const price = ev.proposal.counterPrice ?? ev.proposal.proposedPrice;
          const ride = ev.proposal.ride;
          pushToast({
            id: `accepted-${ev.proposal.id}`,
            title: `Prix accepté : ${formatFcfa(price)} — prix figé`,
            message: ride
              ? `${ride.pickup} → ${ride.destination} — va récupérer ton passager.`
              : 'Va récupérer ton passager.',
            variant: 'success',
          });
        }
      }
    } catch {
      // Réessaie au prochain tour.
    }
  }, [pushToast, router]);

  /** Accepter une contre-proposition directement depuis le toast (v2.12). */
  async function acceptCounterFromToast(proposalId: string) {
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept_counter' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Acceptation impossible.');
        return;
      }
      fetchMyProposals();
      fetchIncoming();
    } catch {
      setError('Acceptation impossible pour le moment.');
    }
  }

  // Temps réel (v2.24) : les contre-propositions des passagers et
  // les acceptations arrivent instantanément (voir aussi le sondage
  // de repli ci-dessous).
  const { live: proposalsLive } = useRealtimeSubscription({
    table: 'ride_proposals',
    filter: `driver_id=eq.${profile.id}`,
    enabled: isOnline && verified,
    onChange: fetchMyProposals,
  });

  useEffect(() => {
    if (!isOnline || !verified) return;
    fetchMyProposals();
    const t = window.setInterval(fetchMyProposals, pollingIntervalMs(proposalsLive, 15000));
    return () => window.clearInterval(t);
  }, [isOnline, verified, fetchMyProposals, proposalsLive]);

  async function toggleOnline(next: boolean) {
    if (!verified) {
      setError('Fais vérifier ton compte (selfie + pièce d’identité) pour te mettre en ligne.');
      return;
    }
    if (next && !area) {
      setError('Choisis le quartier où tu te trouves pour apparaître sur la carte.');
      return;
    }
    // Nudge : la quête du jour est presque finie — on prévient le
    // chauffeur avant qu'il se déconnecte.
    if (!next) {
      try {
        const res = await fetch('/api/driver/earnings');
        const data = await res.json().catch(() => null);
        const nudge = data?.summary?.nudge as { show: boolean; remaining: number; bonus: number } | null;
        if (nudge?.show) {
          setOfflineConfirm({ remaining: nudge.remaining, bonus: nudge.bonus });
          return;
        }
      } catch {
        // Pas de nudge si les gains ne chargent pas : on déconnecte.
      }
    }
    setError(null);
    await applyOnline(next);
  }

  async function applyOnline(next: boolean) {
    setOfflineConfirm(null);
    setError(null);
    setSaving(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isOnline: next, ...(area ? { currentArea: area } : {}) }),
    });
    const data = await res.json().catch(() => null);
    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? 'Changement impossible.');
      return;
    }
    setIsOnline(next);
    if (next) {
      fetchIncoming();
      // Pop-up places libres (v2.19) : à chaque mise en ligne, le
      // chauffeur déclare combien de places libres il propose — ce
      // nombre décide quelles demandes il reçoit (Groupe / Solo).
      await fetchSeats();
      if ((profile.seats ?? null) !== null) setSeatsPopupOpen(true);
    }
  }

  async function changeArea(next: Neighborhood) {
    setArea(next);
    if (!isOnline) return;
    await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentArea: next }),
    }).catch(() => undefined);
  }

  return (
    <div className="p-4 sm:p-5 pt-1 space-y-4">
      {/* Notifications pop-up de négociation (v2.12). */}
      <ToastStack toasts={toasts} onClose={dismissToast} />

      {/* Messages in-app chauffeur (v2.25, lot C) : bienvenue, dossier
          incomplet, inactivité, dette au plafond (« régularise pour
          reprendre ») — aussi sur le tableau de bord. */}
      <DriverNotices settleHref="/tableau-de-bord#gains" />

      {/* Re-vérification selfie ponctuelle (v2.30) : selfie à refaire
          avant la mise en ligne quand le contrôle est dû. */}
      <SelfieRecheckCard required={isSelfieRecheckDue(profile)} />

      {/* Statut */}
      <div>
        <h1 className="text-xl font-black text-white leading-tight">
          Bonjour{profile.full_name ? ` ${profile.full_name.split(' ')[0]}` : ''} — mode Chauffeur
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          {vehicleLabel || 'Ta voiture'}
          {profile.plate ? ` · ${profile.plate}` : ''} — mets-toi en ligne pour recevoir des demandes.
        </p>
      </div>

      {!verified && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-sm">
          <p className="font-black text-amber-300">
            {verificationStatus === 'en_attente'
              ? 'Vérification en cours'
              : 'Compte à vérifier'}
          </p>
          <p className="text-slate-300 mt-0.5">
            {verificationStatus === 'en_attente'
              ? 'Ton selfie et ta pièce d’identité sont en cours de vérification par Stacks Drive.'
              : 'Envoie ton selfie et ta pièce d’identité depuis ton tableau de bord pour te mettre en ligne.'}
          </p>
          <Link href="/tableau-de-bord" className="inline-block mt-2 font-black text-white underline">
            Voir mon tableau de bord →
          </Link>
        </div>
      )}

      <div id="mise-en-ligne" className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3 scroll-mt-24">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-black text-white">
              {isOnline ? 'En ligne — visible pour les passagers' : 'Hors ligne'}
            </p>
            <p className="text-xs text-slate-400">
              {isOnline
                ? 'Les demandes autour de toi arrivent ici.'
                : 'Passe en ligne pour recevoir des demandes.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOnline}
            aria-busy={saving}
            aria-label={isOnline ? 'Passer hors ligne' : 'Passer en ligne'}
            disabled={saving}
            onClick={() => toggleOnline(!isOnline)}
            className={cn(
              'relative w-16 h-9 rounded-full transition-colors shrink-0 disabled:opacity-50',
              isOnline ? 'bg-cyan' : 'bg-white/15'
            )}
          >
            <span
              className={cn(
                'absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow transition-transform',
                isOnline && 'translate-x-7'
              )}
            />
          </button>
        </div>
        <label className="flex items-center gap-3">
          <MapPin size={16} className="text-cyan shrink-0" />
          <span className="text-xs font-black uppercase tracking-widest text-slate-400 shrink-0">
            Quartier
          </span>
          <select
            value={area}
            onChange={(e) => changeArea(e.target.value as Neighborhood)}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white focus:border-cyan focus:outline-none"
            aria-label="Quartier où tu te trouves"
          >
            <option value="">Où es-tu ?</option>
            {SELECTABLE_NEIGHBORHOODS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        {saving && (
          <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
            <Loader2 size={13} className="animate-spin" /> Mise à jour…
          </p>
        )}
        {/* Places libres + statut (v2.19) : le statut décide quelles
            demandes arrivent — Groupe avec des places libres, Solo
            seulement si le véhicule est totalement vide. */}
        {verified && seatsInfo && seatsInfo.capacity !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/10">
            <DriverStatusBadge
              status={seatsInfo.status}
              freeSeats={seatsInfo.freeSeats}
              capacity={seatsInfo.capacity}
            />
            <button
              type="button"
              onClick={() => setSeatsPopupOpen(true)}
              className="text-xs font-black text-cyan hover:underline"
            >
              Mes places →
            </button>
          </div>
        )}
        {verified && (profile.seats ?? null) === null && (
          <p className="text-xs text-amber-300">
            Déclare ton véhicule (capacité) dans{' '}
            <Link href="/compte" className="font-black underline">Mon compte</Link>{' '}
            pour indiquer tes places libres.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          {error}
        </p>
      )}

      {debtBlocked && (
        <p role="alert" className="text-sm font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl p-3">
          Plafond de dette atteint ({formatFcfa(debtBlocked.amount)} / {formatFcfa(debtBlocked.cap)}) : tu ne reçois
          plus de nouvelles demandes tant que tes commissions ne sont pas réglées.
        </p>
      )}

      {/* Argent du jour + points */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-night-900 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
            <TrendingUp size={12} className="text-cyan" /> Aujourd’hui
          </p>
          <p className="text-xl font-black text-cyan mt-1.5">
            {summary ? formatFcfa(summary.today.kept) : '…'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {summary ? `${summary.today.rides} course${summary.today.rides > 1 ? 's' : ''} terminée${summary.today.rides > 1 ? 's' : ''}` : 'Chargement…'}
          </p>
        </div>
        <div className="bg-night-900 border border-white/10 rounded-2xl p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
            <Wallet size={12} className="text-gold" /> À régler
          </p>
          <p className="text-xl font-black text-white mt-1.5">
            {summary ? formatFcfa(summary.owed) : '…'}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Commissions non réglées</p>
        </div>
        <div className="bg-night-900 border border-white/10 rounded-2xl p-4 col-span-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
            <Gift size={12} className="text-gold" /> Tes points
          </p>
          <div className="flex items-end justify-between gap-3 mt-1.5">
            <p className="text-xl font-black text-gold">
              {summary ? summary.points.balance.toLocaleString('fr-FR') : '…'} points
            </p>
            <p className="text-xs font-bold text-slate-400">
              {summary
                ? `${summary.points.balance.toLocaleString('fr-FR')} / ${POINTS_REDEEM_TARGET.toLocaleString('fr-FR')} — ${summary.points.freeRides} course${summary.points.freeRides > 1 ? 's' : ''} sans commission`
                : ''}
            </p>
          </div>
          <div className="h-2.5 rounded-full bg-white/10 overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-or via-gold to-cyan transition-all"
              style={{ width: `${Math.round((summary?.points.progress ?? 0) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Demande sans chauffeur près de toi (v2.27) : un passager
          attend depuis plus de 2 min sans proposition — une seule
          alerte par demande, sans spam. */}
      {isOnline && verified && unanswered.length > 0 && (
        <div
          role="status"
          className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-sm space-y-1"
        >
          <p className="font-black text-amber-300">
            ⚠ {unanswered.length} demande{unanswered.length > 1 ? 's' : ''} sans chauffeur près de toi
          </p>
          {unanswered.slice(0, 3).map((z) => (
            <p key={z.rideId} className="text-slate-300">
              {z.pickup} → {z.destination} · {z.rideType === 'groupe' ? 'Groupe' : 'Solo'} · attend
              depuis {z.waitingMin} min
            </p>
          ))}
          <p className="text-xs text-slate-400">
            Personne n’a encore proposé — si tu es dans le coin, regarde tes demandes entrantes.
          </p>
        </div>
      )}

      {/* Demandes entrantes */}
      <div className="space-y-2.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
          <Users size={13} className="text-cyan" /> Demandes entrantes
        </p>
        {!isOnline || !verified ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-slate-400 text-center">
            Mets-toi en ligne pour voir les demandes des passagers autour de toi.
          </div>
        ) : incoming.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-slate-400 text-center">
            Aucune demande pour le moment — on te prévient dès qu’un passager cherche une course près de toi.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {incoming.map((i) => (
              <li key={i.ride.id}>
                <button
                  type="button"
                  onClick={() => setPopupRide(i)}
                  className="w-full text-left bg-white/5 border border-white/10 hover:border-cyan/50 rounded-2xl p-3.5 transition-colors"
                >
                  <p className="font-black text-white text-sm flex items-center gap-1.5">
                    <Car size={15} className="text-cyan shrink-0" />
                    {i.ride.pickup} → {i.ride.destination}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {i.ride.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'} ·{' '}
                    estimation {formatFcfa(i.ride.estimatedPrice)} · {timeAgo(i.ride.createdAt)}
                    {i.ride.offeredPrice !== null ? ` · le passager propose ${formatFcfa(i.ride.offeredPrice)}` : ''}
                    {i.passenger?.name ? ` · ${i.passenger.name}` : ''}
                    {i.passengerRating
                      ? ` · ★ ${i.passengerRating.average}/5`
                      : ' · nouveau passager'}
                  </p>
                  <span className="inline-block mt-2 text-xs font-black text-cyan">Proposer mon prix →</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/tableau-de-bord"
        className="block text-center w-full py-3.5 rounded-full bg-white/5 border border-white/15 text-sm font-black text-white hover:border-cyan/60 transition-colors"
      >
        Voir le tableau de bord complet →
      </Link>
      <p className="text-[11px] text-slate-500 text-center">
        Historique, quêtes, niveaux et badges — dans ton tableau de bord.
      </p>

      {/* Pop-up de demande */}
      {popupRide && (
        <RequestPopup
          ride={popupRide.ride}
          passenger={popupRide.passenger}
          passengerRating={popupRide.passengerRating ?? null}
          driverSeats={profile.seats}
          freeSeats={seatsInfo?.freeSeats ?? profile.seats}
          onClose={() => setPopupRide(null)}
          onProposed={(rideId) => {
            proposedRef.current.add(rideId);
            setPopupRide(null);
            fetchIncoming();
            fetchSummary();
            fetchSeats();
          }}
        />
      )}

      {/* Pop-up places libres (v2.19) : à la mise en ligne + « Mes places ». */}
      {seatsPopupOpen && (profile.seats ?? null) !== null && (
        <SeatsPopup
          capacity={profile.seats as number}
          freeSeats={seatsInfo?.freeSeats ?? null}
          onClose={() => setSeatsPopupOpen(false)}
          onSaved={() => {
            setSeatsPopupOpen(false);
            fetchSeats();
          }}
        />
      )}

      {/* Nudge : quête presque finie quand on veut se déconnecter */}
      {offlineConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-night-950/80 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Quête presque terminée"
          onClick={() => setOfflineConfirm(null)}
        >
          <div
            className="bg-night-900 border border-white/10 rounded-3xl p-6 w-full max-w-md space-y-4 text-slate-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-black text-lg flex items-center gap-2">
              <Flame size={20} className="text-or" />
              Plus que {offlineConfirm.remaining} course{offlineConfirm.remaining > 1 ? 's' : ''} pour ton bonus !
            </p>
            <p className="text-sm text-slate-300">
              Encore {offlineConfirm.remaining} course{offlineConfirm.remaining > 1 ? 's' : ''} et tu
              gagnes {offlineConfirm.bonus.toLocaleString('fr-FR')} points de bonus aujourd’hui. Tu restes en ligne ?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOfflineConfirm(null)}
                className="flex-1 py-3.5 rounded-full bg-cyan text-night-950 text-sm font-black hover:bg-cyan/90 transition-colors"
              >
                Rester en ligne
              </button>
              <button
                type="button"
                onClick={() => applyOnline(false)}
                className="flex-1 py-3.5 rounded-full bg-white/10 text-sm font-black hover:bg-white/20 transition-colors"
              >
                Me déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
