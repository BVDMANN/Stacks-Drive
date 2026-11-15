'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DriveCheck, DriveClock, DriveFlame, DriveShieldAlert, DriveWallet } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { DriveCarMini } from '@/components/icons/DriveCar';
import type { SessionProfile } from '@/lib/supabase/server';
import type { PassengerRating, Ride, RideProposal } from '@/types';
import { RequestPopup } from './RequestPopup';
import { SeatsPopup } from './SeatsPopup';
import { DriverStatusBadge } from './DriverStatusBadge';
import type { DriverStatus } from '@/types';
import { PinEntry } from './PinEntry';
import { CelebrationPopup, type CelebrationData } from './CelebrationPopup';
import { DriverEarnings } from './DriverEarnings';
import { DriverNotices } from './DriverNotices';
import { DriverReferralCard } from './DriverReferralCard';
import { DriverBeyondPanel } from './DriverBeyondPanel';
import { TrafficReport } from './TrafficReport';
import { DriverTutorial } from '@/components/tuto/DriverTutorial';
import { SelfieRecheckCard } from '@/components/driver/SelfieRecheckCard';
import { DemandHeatmap } from '@/components/driver/DemandHeatmap';
import { isSelfieRecheckDue } from '@/lib/selfie-recheck';
import { ToastStack, useToastStack } from '@/components/shared/Toast';
import { detectProposalEvents, type ProposalSnapshot } from '@/lib/proposal-events';
import { pollingIntervalMs, useRealtimeSubscription } from '@/lib/realtime';
import { VerificationStatusBadge } from '@/components/shared/StatusBadge';
import { SELECTABLE_NEIGHBORHOODS, PAYMENT_LABELS, type Neighborhood } from '@/lib/neighborhoods';
import { formatFcfa } from '@/lib/commission';
import { computeReliability } from '@/lib/cancellations';
import { estimateTrip } from '@/lib/pricing';
import { formatDepartureTime, timeAgo } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface IncomingRide {
  ride: Ride;
  passenger: { name: string | null; phone: string | null } | null;
  /** Note moyenne du passager (v2.30) — jointe par /api/rides. */
  passengerRating?: PassengerRating | null;
}

interface MyProposal extends RideProposal {
  ride?: { pickup: string; destination: string; rideType: string; status: string } | null;
}

/** Tableau de bord chauffeur : en ligne, demandes entrantes (pop-up +
 *  proposition), mes propositions, course en cours, gains, historique.
 *  Le chauffeur ne publie RIEN : il se met en ligne et il propose. */
export function DriverDashboard({ profile }: { profile: SessionProfile }) {
  const [isOnline, setIsOnline] = useState(profile.is_online);
  const [area, setArea] = useState<Neighborhood | ''>(
    (profile.current_area as Neighborhood | '') ?? ''
  );
  const [incoming, setIncoming] = useState<IncomingRide[]>([]);
  const [myProposals, setMyProposals] = useState<MyProposal[]>([]);
  const [myRides, setMyRides] = useState<Ride[]>([]);
  const [ridePassengers, setRidePassengers] = useState<Record<string, string>>({});
  const [rideEarnings, setRideEarnings] = useState<
    Record<string, { fare: number; commission: number; kept: number }>
  >({});
  const [popupRide, setPopupRide] = useState<IncomingRide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [offlineConfirm, setOfflineConfirm] = useState<{ remaining: number; bonus: number } | null>(null);
  const [debtBlocked, setDebtBlocked] = useState<{ amount: number; cap: number } | null>(null);
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
  // Contre-propositions (v2.11) : nouveau prix tapé par le chauffeur
  // pour répondre à une contre-proposition du passager.
  const [repriceValues, setRepriceValues] = useState<Record<string, string>>({});
  const [proposalBusy, setProposalBusy] = useState<string | null>(null);

  // Notifications pop-up de négociation (v2.12) : le chauffeur est
  // alerté quand un passager contre-propose et quand son prix est
  // accepté (figé). Auto-fermeture ~6 s.
  const { toasts, push: pushToast, dismiss: dismissToast } = useToastStack();
  const myProposalsSnapshotRef = useRef<ProposalSnapshot>(new Map());

  const verified = profile.is_verified;
  const verificationStatus = (profile.verification_status ?? 'non_verifie') as string;

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

  const fetchMine = useCallback(async () => {
    try {
      const [propRes, ridesRes] = await Promise.all([
        fetch('/api/proposals?scope=mine'),
        fetch('/api/rides?scope=driver'),
      ]);
      const propData = await propRes.json();
      if (propData?.ok) {
        const list = (propData.proposals ?? []) as MyProposal[];
        setMyProposals(list);
        list.forEach((p) => proposedRef.current.add(p.rideId));
        // Notifications pop-up de négociation (v2.12) : contre-proposition
        // du passager (avec actions Accepter / Répondre) et prix accepté.
        // Les événements « new » / « repriced » concernent le passager
        // (c'est lui qui reçoit mes propositions), pas le chauffeur.
        const { events, snapshot } = detectProposalEvents(myProposalsSnapshotRef.current, list);
        myProposalsSnapshotRef.current = snapshot;
        for (const ev of events) {
          if (ev.kind === 'counter') {
            const price = ev.proposal.counterPrice as number;
            pushToast({
              id: `counter-${ev.proposal.id}-${price}`,
              title: `Contre-proposition : ${formatFcfa(price)}`,
              message: ev.proposal.ride
                ? `${ev.proposal.ride.pickup} → ${ev.proposal.ride.destination} — le passager propose ce prix.`
                : 'Le passager propose ce prix.',
              variant: 'offer',
              actions: [
                {
                  label: `Accepter ${formatFcfa(price)}`,
                  primary: true,
                  onClick: () => acceptCounter(ev.proposal.id),
                },
                {
                  label: 'Répondre',
                  onClick: () => {
                    const el = document.getElementById(`proposal-${ev.proposal.id}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (el?.querySelector('input[type="number"]') as HTMLInputElement | null)?.focus();
                  },
                },
              ],
            });
          } else if (ev.kind === 'accepted') {
            const price = ev.proposal.counterPrice ?? ev.proposal.proposedPrice;
            pushToast({
              id: `accepted-${ev.proposal.id}`,
              title: `Prix accepté : ${formatFcfa(price)} — prix figé`,
              message: ev.proposal.ride
                ? `${ev.proposal.ride.pickup} → ${ev.proposal.ride.destination} — va récupérer ton passager.`
                : 'Va récupérer ton passager.',
              variant: 'success',
            });
          }
        }
      }
      const ridesData = await ridesRes.json();
      if (ridesData?.ok) {
        setMyRides((ridesData.rides ?? []) as Ride[]);
        // Noms des passagers + gains par course (v2.10) : l'historique
        // affiche qui, combien, et la commission / le gain net.
        setRidePassengers((ridesData.passengers ?? {}) as Record<string, string>);
        setRideEarnings(
          (ridesData.earnings ?? {}) as Record<string, { fare: number; commission: number; kept: number }>
        );
      }
    } catch {
      // Réessaie au prochain tour.
    }
  }, [pushToast]);

  useEffect(() => {
    fetchMine();
    fetchSeats();
  }, [fetchMine, fetchSeats]);

  // Temps réel (v2.24) : nouvelles demandes et changements de mes
  // propositions arrivent instantanément ; les sondages (10 s / 15 s)
  // ne restent qu'en repli, plus un rafraîchissement de sécurité
  // toutes les 60 s.
  const { live: incomingLive } = useRealtimeSubscription({
    table: 'rides',
    enabled: isOnline && verified,
    onChange: fetchIncoming,
  });
  const { live: mineLive } = useRealtimeSubscription({
    table: 'ride_proposals',
    filter: `driver_id=eq.${profile.id}`,
    enabled: true,
    onChange: fetchMine,
  });

  useEffect(() => {
    if (!isOnline || !verified) return;
    fetchIncoming();
    const t = window.setInterval(fetchIncoming, pollingIntervalMs(incomingLive, 10000));
    return () => window.clearInterval(t);
  }, [isOnline, verified, fetchIncoming, incomingLive]);

  useEffect(() => {
    fetchMine();
    const t = window.setInterval(fetchMine, pollingIntervalMs(mineLive, 15000));
    return () => window.clearInterval(t);
  }, [fetchMine, mineLive]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  async function toggleOnline(next: boolean) {
    if (!verified) {
      setError('Fais vérifier ton compte (selfie + pièce d’identité) pour te mettre en ligne.');
      return;
    }
    if (next && !area) {
      setError('Choisis le quartier où tu te trouves pour apparaître sur la carte.');
      return;
    }
    // Nudge (v2.2) : la quête du jour est presque finie — on prévient
    // le chauffeur avant qu'il se déconnecte.
    // Règle 1 (v2.17) : la barre de chargement couvre TOUTE l'attente,
    // y compris la vérification du nudge avant la déconnexion.
    if (!next) {
      setSaving(true);
      try {
        const res = await fetch('/api/driver/earnings');
        const data = await res.json().catch(() => null);
        const nudge = data?.summary?.nudge as { show: boolean; remaining: number; bonus: number } | null;
        if (nudge?.show) {
          setSaving(false);
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

  /** Contre-propositions (v2.11) : le passager a proposé un prix sur
   *  ma proposition. L'accepter fige ce prix comme prix de la course ;
   *  proposer un autre prix relance le compteur de 60 s. */
  async function acceptCounter(proposalId: string) {
    setProposalBusy(proposalId);
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept_counter' }),
    });
    const data = await res.json().catch(() => null);
    setProposalBusy(null);
    if (!res.ok) {
      setError(data?.error ?? 'Acceptation impossible.');
      return;
    }
    fetchMine();
  }

  async function reprice(proposalId: string) {
    const price = Math.round(Number(repriceValues[proposalId] ?? ''));
    if (!Number.isFinite(price) || price < 400 || price > 50000) {
      setError('Ton prix doit être entre 400 et 50 000 FCFA.');
      return;
    }
    setProposalBusy(proposalId);
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reprice', proposedPrice: price }),
    });
    const data = await res.json().catch(() => null);
    setProposalBusy(null);
    if (!res.ok) {
      setError(data?.error ?? 'Nouveau prix impossible.');
      return;
    }
    setRepriceValues((prev) => {
      const next = { ...prev };
      delete next[proposalId];
      return next;
    });
    fetchMine();
  }

  async function rideAction(rideId: string, action: 'complete') {
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? 'Action impossible.');
      return;
    }
    // Célébration (v2.2) : confettis + montant gardé après chaque course.
    if (data?.celebration) setCelebration(data.celebration as CelebrationData);
    fetchMine();
    fetchSeats();
  }

  const activeRide = myRides.find((r) => r.status === 'acceptee' || r.status === 'en_cours') ?? null;
  const pastRides = myRides.filter((r) => ['terminee', 'annulee'].includes(r.status));
  // Fiabilité (v2.23) : annulations comptées, même règle que l'admin.
  const reliability = computeReliability(
    pastRides.filter((r) => r.status === 'terminee').length,
    pastRides.filter((r) => r.status === 'annulee').length,
    pastRides.filter((r) => r.status === 'annulee' && r.cancelledBy === 'chauffeur').length
  );
  const paidRides = myRides.filter((r) => ['acceptee', 'en_cours', 'terminee'].includes(r.status));
  const earnings = paidRides.reduce((s, r) => s + (r.driverShare ?? 0), 0);
  const fees = paidRides.reduce((s, r) => s + (r.platformFee ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Messages in-app chauffeur (v2.25, lot C) : bienvenue, dossier
          incomplet, inactivité, dette au plafond (« régularise pour
          reprendre »). */}
      <DriverNotices />
      {/* Formation chauffeur (v2.21) : après la création du compte, au
          premier passage ici ; rejouable avec « Revoir la formation ». */}
      <DriverTutorial />
      {/* Re-vérification selfie ponctuelle (v2.30) : selfie à refaire
          avant la mise en ligne quand le contrôle est dû (drapeau
          admin / signalement, ou dernier contrôle vieux de plus de
          30 jours). */}
      <SelfieRecheckCard required={isSelfieRecheckDue(profile)} />
      {/* Notifications pop-up de négociation (v2.12). */}
      <ToastStack toasts={toasts} onClose={dismissToast} />

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Plafond de dette atteint : plus de nouvelles demandes. */}
      {debtBlocked && (
        <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
          Plafond de dette atteint ({formatFcfa(debtBlocked.amount)} dus, plafond{' '}
          {formatFcfa(debtBlocked.cap)}) : règle tes commissions par transfert
          Mobile Money pour recevoir de nouvelles demandes.
        </p>
      )}

      {/* Vérification */}
      {!verified && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-wrap items-start gap-4">
          <DriveShieldAlert size={24} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[220px]">
            <p className="font-black text-amber-800 flex flex-wrap items-center gap-2">
              Vérification obligatoire <VerificationStatusBadge status={verificationStatus} />
            </p>
            <p className="text-sm text-amber-700 mt-1">
              Envoie ton selfie et ta pièce d’identité (ou ton permis) : sans
              vérification, tu ne peux pas te mettre en ligne ni proposer de courses.
            </p>
          </div>
          <Link
            href="/compte#verification"
            className="inline-flex items-center gap-2 bg-stacks-green text-white text-sm font-black px-5 py-3 rounded-full shadow-md hover:bg-stacks-greenLight transition-colors"
          >
            Me faire vérifier
          </Link>
        </div>
      )}

      {/* En ligne */}
      <section id="mise-en-ligne" className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-black text-lg text-slate-900">
              {isOnline ? 'En ligne — visible pour les passagers' : 'Hors ligne'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {isOnline
                ? 'Tu apparais sur la carte. Les demandes autour de toi arrivent en pop-up.'
                : 'Mets-toi en ligne quand tu es disponible pour prendre des courses.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOnline}
            aria-busy={saving}
            disabled={saving || !verified}
            onClick={() => toggleOnline(!isOnline)}
            className={cn(
              'shrink-0 w-16 h-9 rounded-full p-1 transition-colors disabled:opacity-50',
              isOnline ? 'bg-stacks-green' : 'bg-slate-300'
            )}
          >
            <span
              className={cn(
                'block w-7 h-7 rounded-full bg-white shadow transition-transform',
                isOnline && 'translate-x-7'
              )}
            />
          </button>
        </div>
        {/* Règle 1 (v2.17) : pendant l'enregistrement du statut en
            ligne, un indicateur visible (comme sur l'accueil chauffeur)
            — plus de toggle juste grisé sans explication. */}
        {saving && (
          <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
            <LogoLoader size={16} /> Mise à jour…
          </p>
        )}
        {/* Places libres + statut (v2.19) : le statut décide quelles
            demandes arrivent — Groupe avec des places libres, Solo
            seulement si le véhicule est totalement vide. */}
        {verified && seatsInfo && seatsInfo.capacity !== null && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <DriverStatusBadge
              status={seatsInfo.status}
              freeSeats={seatsInfo.freeSeats}
              capacity={seatsInfo.capacity}
            />
            <button
              type="button"
              onClick={() => setSeatsPopupOpen(true)}
              className="text-xs font-black text-stacks-green hover:underline"
            >
              Mes places →
            </button>
          </div>
        )}
        {verified && (profile.seats ?? null) === null && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Déclare ton véhicule (capacité) dans{' '}
            <Link href="/compte" className="font-bold underline">Mon compte</Link>{' '}
            pour indiquer tes places libres.
          </p>
        )}
        <label className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-slate-500">
            Quartier où tu te trouves
          </span>
          <select
            value={area}
            onChange={(e) => changeArea(e.target.value as Neighborhood)}
            className="flex-1 min-w-[200px] px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
          >
            <option value="">Choisir un quartier…</option>
            {SELECTABLE_NEIGHBORHOODS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        {profile.vehicle_brand || profile.plate ? (
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <DriveCarMini variant="sedan" size={15} tone="dark" />
            {[profile.vehicle_brand, profile.vehicle_model, profile.vehicle_color].filter(Boolean).join(' ')}
            {profile.plate ? ` · ${profile.plate}` : ''} ·{' '}
            <Link href="/compte" className="text-stacks-green font-bold hover:underline">
              Modifier mon véhicule
            </Link>
          </p>
        ) : (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
            Complète ton véhicule dans{' '}
            <Link href="/compte" className="font-bold underline">Mon compte</Link>{' '}
            (marque, modèle, couleur, plaque) — les passagers le voient avant de monter.
          </p>
        )}
      </section>

      {/* Statistiques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { value: myRides.length, label: 'Courses (assignées)' },
          { value: formatFcfa(earnings), label: 'Tes gains (confirmées)' },
          { value: formatFcfa(fees), label: 'Frais Stacks Drive (5 %)' },
          { value: `${myProposals.filter((p) => p.status === 'accepted').length} acceptée${myProposals.filter((p) => p.status === 'accepted').length > 1 ? 's' : ''}`, label: 'Propositions acceptées' },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <p className="text-2xl font-black text-stacks-navy break-words">{s.value}</p>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        Commission de lancement : 5 %, puis 8 % — plafonnée à 10 % pour toujours.
        Les concurrents prennent 15 à 30 %.
      </p>

      {/* Gains, dette, quête, niveau (v2.2) */}
      <div id="gains" className="scroll-mt-24">
        <DriverEarnings />
      </div>

      {/* Heatmap de demande (v2.30) : zones chaudes des 7 derniers
          jours — info seulement, sans surge ni promesse de gain. */}
      <DemandHeatmap />

      {/* Parrainage chauffeurs (v2.25, lot C) — visible uniquement ici
          et côté admin, jamais sur les pages publiques. */}
      <DriverReferralCard />

      {/* Options chauffeur « Au-delà » (v2.34) : climatisation
          (Confort), destination de retour, file aéroport. */}
      <DriverBeyondPanel />

      {/* Course en cours — vue chauffeur (v2.2) : trajet, temps estimé,
          distance, prix, mode de paiement, code PIN pour démarrer. */}
      {activeRide && (
        <section className="bg-white border-2 border-stacks-green rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <h2 className="font-black text-lg text-slate-900">
            {activeRide.status === 'acceptee' ? 'Course confirmée — va récupérer ton passager' : 'Course en cours'}
          </h2>
          <p className="font-black text-slate-900 text-lg">
            {activeRide.pickup} → {activeRide.destination}
          </p>
          {/* Route non bitumée (v2.6) : où s'arrête vraiment la course. */}
          {activeRide.dropOffPoint && activeRide.unpavedAccepted === false && (
            <p className="text-sm font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Arrêt au point de dépôt : {activeRide.dropOffPoint} — route non bitumée non prise.
            </p>
          )}
          {activeRide.dropOffPoint && activeRide.unpavedAccepted === true && (
            <p className="text-sm font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              Route non bitumée acceptée : tu continues jusqu’à {activeRide.destination}.
            </p>
          )}
          {(() => {
            const est =
              activeRide.distanceKm !== null && activeRide.durationMin !== null
                ? { distanceKm: activeRide.distanceKm, durationMin: activeRide.durationMin }
                : estimateTrip(activeRide.pickup as Neighborhood, activeRide.destination as Neighborhood);
            return (
              <p className="text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <DriveClock size={14} /> ~{est.durationMin} min
                </span>
                <span>· ~{Math.max(1, Math.round(est.distanceKm))} km</span>
                <span className="inline-flex items-center gap-1">
                  <DriveWallet size={14} /> {PAYMENT_LABELS[activeRide.paymentMethod]}
                </span>
              </p>
            );
          })()}
          <p className="text-sm text-slate-500">
            {activeRide.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'} ·{' '}
            {formatFcfa(activeRide.proposedPrice ?? activeRide.estimatedPrice)}
            {activeRide.loyaltyFree ? ' · course offerte (fidélité — tu touches tout le tarif)' : ` · dont ${formatFcfa(activeRide.driverShare)} pour toi`}
            {activeRide.firstStop ? ` · 1er arrêt : ${activeRide.firstStop}` : ''}
            {activeRide.isDoubleRide ? ' · COURSE DOUBLE — points doublés' : ''}
          </p>
          {activeRide.status === 'acceptee' && (
            <PinEntry rideId={activeRide.id} onStarted={() => fetchMine()} />
          )}
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/courses/${activeRide.id}`}
              className="px-5 py-3 rounded-full text-sm font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              Voir la course complète
            </Link>
            {/* Messagerie (v2.10) : écrire au passager, en cours de course. */}
            <Link
              href={`/courses/${activeRide.id}#messages`}
              className="px-5 py-3 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors"
            >
              Écrire au passager
            </Link>
            {activeRide.status === 'en_cours' && (
              <button
                type="button"
                onClick={() => rideAction(activeRide.id, 'complete')}
                className="px-5 py-3 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors"
              >
                Course terminée
              </button>
            )}
          </div>
          {/* Trafic communautaire (v2.27) : signalement pendant la
              course + signalements actifs autour (à confirmer). */}
          <TrafficReport
            rideId={activeRide.id}
            fallbackLat={profile.last_lat ?? null}
            fallbackLng={profile.last_lng ?? null}
          />
        </section>
      )}

      {/* Demandes entrantes */}
      {isOnline && verified && (
        <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
          <h2 className="font-black text-lg text-slate-900">
            Demandes autour de toi ({incoming.length})
          </h2>
          {incoming.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucune demande pour l’instant — reste en ligne, la pop-up s’ouvrira
              dès qu’un passager près de toi commande.
            </p>
          ) : (
            <ul className="space-y-3">
              {incoming.map(({ ride, passenger }) => (
                <li key={ride.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">
                      {ride.pickup} → {ride.destination}
                    </p>
                    <p className="text-sm text-slate-500">
                      {passenger?.name ?? 'Passager'} · {passenger?.phone ?? ''} ·{' '}
                      {ride.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'} ·{' '}
                      estimation {formatFcfa(ride.estimatedPrice)} · {timeAgo(ride.createdAt)}
                      {ride.offeredPrice !== null && (
                        <> · le passager propose <strong className="text-stacks-green">{formatFcfa(ride.offeredPrice)}</strong></>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPopupRide({ ride, passenger })}
                    className="px-5 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors"
                  >
                    Proposer un prix
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Mes propositions */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Mes propositions ({myProposals.length})</h2>
        {myProposals.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune proposition envoyée pour le moment.
          </p>
        ) : (
          <ul className="space-y-3">
            {myProposals.map((p) => {
              const secondsLeft = Math.max(0, Math.round((new Date(p.expiresAt).getTime() - now) / 1000));
              const hasCounter = p.status === 'pending' && p.counterPrice !== null && secondsLeft > 0;
              return (
                <li
                  key={p.id}
                  id={`proposal-${p.id}`}
                  className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-3 scroll-mt-24"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-900">
                        {p.ride ? `${p.ride.pickup} → ${p.ride.destination}` : 'Course'}
                      </p>
                      <p className="text-sm text-slate-500">
                        {formatFcfa(p.proposedPrice)} · {p.ride?.rideType === 'solo' ? 'véhicule entier' : `${p.seatsLeft} place${p.seatsLeft > 1 ? 's' : ''}`} · 1er arrêt : {p.firstStop}
                      </p>
                    </div>
                    <span className="text-xs font-black px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">
                      {p.status === 'pending'
                        ? secondsLeft > 0
                          ? `En attente · ${secondsLeft} s`
                          : 'Expirée'
                        : p.status === 'accepted'
                          ? (<>Acceptée <DriveCheck size={12} className="inline-block" /></>)
                          : p.status === 'declined'
                            ? 'Refusée'
                            : 'Expirée'}
                    </span>
                  </div>
                  {/* Contre-proposition du passager (v2.11) : accepte son
                      prix (il devient le prix figé de la course) ou
                      propose un autre prix. */}
                  {hasCounter && (
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-3.5 space-y-2.5">
                      <p className="text-sm font-bold text-green-800">
                        Le passager contre-propose {formatFcfa(p.counterPrice as number)} — à toi de répondre :
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={proposalBusy === p.id}
                          onClick={() => acceptCounter(p.id)}
                          className="px-4 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
                        >
                          Accepter {formatFcfa(p.counterPrice as number)}
                        </button>
                        <span className="inline-flex items-center gap-1.5">
                          <input
                            type="number"
                            min={400}
                            max={50000}
                            step={50}
                            inputMode="numeric"
                            value={repriceValues[p.id] ?? String(p.proposedPrice)}
                            onChange={(e) =>
                              setRepriceValues((prev) => ({ ...prev, [p.id]: e.target.value }))
                            }
                            aria-label="Autre prix proposé en FCFA"
                            className="w-28 px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-black text-slate-900 focus:border-stacks-green focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={proposalBusy === p.id}
                            onClick={() => reprice(p.id)}
                            className="px-4 py-2.5 rounded-full text-sm font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50"
                          >
                            Proposer ce prix
                          </button>
                        </span>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Historique (v2.10) : date, trajet, type, prix, passager, statut,
          commission et gain net de chaque course. Que tes courses. */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Historique ({pastRides.length})</h2>
        {/* Fiabilité (v2.23) : tes annulations comptent — l'admin voit
            le même indicateur ; les annulations répétées sont
            signalées. */}
        {pastRides.length > 0 && (
          <p className="text-sm text-slate-600">
            Fiabilité :{' '}
            <strong className="text-slate-900">
              {reliability.completed} course{reliability.completed > 1 ? 's' : ''} terminée
              {reliability.completed > 1 ? 's' : ''}
            </strong>
            {' · '}
            {reliability.cancelled} annulée{reliability.cancelled > 1 ? 's' : ''}
            {reliability.flagged && (
              <span className="ml-2 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black bg-red-100 text-red-700">
                À surveiller — annulations répétées
              </span>
            )}
          </p>
        )}
        {pastRides.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune course terminée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pastRides.map((r) => {
              const { date, time } = formatDepartureTime(r.createdAt);
              const earning = rideEarnings[r.id];
              const fare = earning?.fare ?? r.proposedPrice ?? r.estimatedPrice;
              const commission = earning?.commission ?? r.platformFee ?? 0;
              const kept = earning?.kept ?? r.driverShare ?? 0;
              const typeLabel =
                r.vehiclePreference === 'moto'
                  ? 'Moto'
                  : r.rideType === 'groupe'
                    ? 'Groupe · 1 place'
                    : 'Solo · véhicule entier';
              return (
                <li key={r.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href={`/courses/${r.id}`} className="text-sm font-bold text-slate-900 hover:text-stacks-green">
                      {r.pickup} → {r.destination}
                    </Link>
                    <span className="text-sm font-black text-slate-900">
                      {r.status === 'annulee' ? 'Annulée' : formatFcfa(fare)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {date} · {time} · {typeLabel}
                    {ridePassengers[r.id] ? ` · Passager : ${ridePassengers[r.id]}` : ''}
                    {r.ratingPassenger ? ` · Ta note : ${r.ratingPassenger}/5` : ''}
                    {r.status === 'annulee' && r.cancelReason ? ` · Annulée — ${r.cancelReason}` : ''}
                    {r.status === 'terminee' && (
                      <>
                        {r.distanceKm !== null ? ` · ~${Math.max(1, Math.round(r.distanceKm))} km` : ''}
                        {r.durationMin !== null ? ` · ~${r.durationMin} min` : ''}
                      </>
                    )}
                  </p>
                  {r.status !== 'annulee' && (
                    <p className="text-xs text-slate-500">
                      {formatFcfa(kept)} pour toi · dont {formatFcfa(commission)} de frais Stacks Drive
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

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
            fetchMine();
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

      {/* Célébration après course terminée (v2.2) */}
      {celebration && (
        <CelebrationPopup
          celebration={celebration}
          onClose={() => setCelebration(null)}
        />
      )}

      {/* Nudge : quête presque finie quand on veut se déconnecter (v2.2) */}
      {offlineConfirm && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
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
              <DriveFlame size={20} className="text-rose-300" />
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
                className="flex-1 py-3.5 rounded-full bg-sarcelle text-night-950 text-sm font-black hover:bg-sarcelle/90 transition-colors"
              >
                Rester en ligne
              </button>
              <button
                type="button"
                onClick={() => applyOnline(false)}
                className="px-5 py-3.5 rounded-full text-sm font-black bg-white/10 text-slate-200 hover:bg-white/20 transition-colors"
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
