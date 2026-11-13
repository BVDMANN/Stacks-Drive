'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Car, Clock, Flame, MapPin, Phone, ShieldAlert, Users, Wallet } from 'lucide-react';
import type { SessionProfile } from '@/lib/supabase/server';
import type { Ride, RideProposal } from '@/types';
import { RequestPopup } from './RequestPopup';
import { PinEntry } from './PinEntry';
import { CelebrationPopup, type CelebrationData } from './CelebrationPopup';
import { DriverEarnings } from './DriverEarnings';
import { VerificationStatusBadge } from '@/components/shared/StatusBadge';
import { NEIGHBORHOODS, PAYMENT_LABELS, type Neighborhood } from '@/lib/neighborhoods';
import { formatFcfa } from '@/lib/commission';
import { estimateFare } from '@/lib/pricing';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface IncomingRide {
  ride: Ride;
  passenger: { name: string | null; phone: string | null } | null;
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
  const [popupRide, setPopupRide] = useState<IncomingRide | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [offlineConfirm, setOfflineConfirm] = useState<{ remaining: number; bonus: number } | null>(null);
  const [debtBlocked, setDebtBlocked] = useState<{ amount: number; cap: number } | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const proposedRef = useRef<Set<string>>(new Set());

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
      }
      const ridesData = await ridesRes.json();
      if (ridesData?.ok) setMyRides((ridesData.rides ?? []) as Ride[]);
    } catch {
      // Réessaie au prochain tour.
    }
  }, []);

  useEffect(() => {
    fetchMine();
  }, [fetchMine]);

  useEffect(() => {
    if (!isOnline || !verified) return;
    fetchIncoming();
    const t = window.setInterval(fetchIncoming, 10000);
    return () => window.clearInterval(t);
  }, [isOnline, verified, fetchIncoming]);

  useEffect(() => {
    const t = window.setInterval(fetchMine, 15000);
    return () => window.clearInterval(t);
  }, [fetchMine]);

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
    if (next) fetchIncoming();
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
  }

  const activeRide = myRides.find((r) => r.status === 'acceptee' || r.status === 'en_cours') ?? null;
  const pastRides = myRides.filter((r) => ['terminee', 'annulee'].includes(r.status));
  const paidRides = myRides.filter((r) => ['acceptee', 'en_cours', 'terminee'].includes(r.status));
  const earnings = paidRides.reduce((s, r) => s + (r.driverShare ?? 0), 0);
  const fees = paidRides.reduce((s, r) => s + (r.platformFee ?? 0), 0);

  return (
    <div className="space-y-6">
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
          <ShieldAlert size={24} className="text-amber-700 shrink-0 mt-0.5" />
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
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
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
            {NEIGHBORHOODS.filter((n) => n !== 'Autre').map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        {profile.vehicle_brand || profile.plate ? (
          <p className="text-sm text-slate-500 flex items-center gap-1.5">
            <Car size={15} className="text-slate-400" />
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
      <DriverEarnings />

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
          {(() => {
            const est =
              activeRide.distanceKm !== null && activeRide.durationMin !== null
                ? { distanceKm: activeRide.distanceKm, durationMin: activeRide.durationMin }
                : estimateFare(
                    activeRide.pickup as Neighborhood,
                    activeRide.destination as Neighborhood,
                    activeRide.rideType,
                    activeRide.vehiclePreference
                  );
            return (
              <p className="text-sm text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1">
                  <Clock size={14} /> ~{est.durationMin} min
                </span>
                <span>· ~{Math.max(1, Math.round(est.distanceKm))} km</span>
                <span className="inline-flex items-center gap-1">
                  <Wallet size={14} /> {PAYMENT_LABELS[activeRide.paymentMethod]}
                </span>
              </p>
            );
          })()}
          <p className="text-sm text-slate-500">
            {activeRide.rideType === 'groupe' ? `Groupe · ${activeRide.seats} passager${activeRide.seats > 1 ? 's' : ''}` : 'Solo'} ·{' '}
            {formatFcfa(activeRide.proposedPrice ?? activeRide.estimatedPrice)}
            {activeRide.loyaltyFree ? ' · course offerte (fidélité — tu touches tout le tarif)' : ` · dont ${formatFcfa(activeRide.driverShare)} pour toi`}
            {activeRide.firstStop ? ` · 1er arrêt : ${activeRide.firstStop}` : ''}
            {activeRide.isDoubleRide ? ' · COURSE DOUBLE — tu gardes 100 %' : ''}
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
                      {ride.rideType === 'groupe' ? `Groupe · ${ride.seats} pass.` : 'Solo'} ·{' '}
                      estimé {formatFcfa(ride.estimatedPrice)} · {timeAgo(ride.createdAt)}
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
              return (
                <li key={p.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">
                      {p.ride ? `${p.ride.pickup} → ${p.ride.destination}` : 'Course'}
                    </p>
                    <p className="text-sm text-slate-500">
                      {formatFcfa(p.proposedPrice)} · {p.seatsLeft} place{p.seatsLeft > 1 ? 's' : ''} · 1er arrêt : {p.firstStop}
                    </p>
                  </div>
                  <span className="text-xs font-black px-3 py-1.5 rounded-full bg-slate-100 text-slate-700">
                    {p.status === 'pending'
                      ? secondsLeft > 0
                        ? `En attente · ${secondsLeft} s`
                        : 'Expirée'
                      : p.status === 'accepted'
                        ? 'Acceptée ✓'
                        : p.status === 'declined'
                          ? 'Refusée'
                          : 'Expirée'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Historique */}
      <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <h2 className="font-black text-lg text-slate-900">Historique ({pastRides.length})</h2>
        {pastRides.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune course terminée pour le moment.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pastRides.map((r) => (
              <li key={r.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <Link href={`/courses/${r.id}`} className="text-sm font-bold text-slate-900 hover:text-stacks-green">
                  {r.pickup} → {r.destination} · {timeAgo(r.createdAt)}
                </Link>
                <span className="text-sm text-slate-600">
                  {formatFcfa(r.driverShare ?? 0)} pour toi
                  {r.status === 'annulee' ? ' · Annulée' : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Pop-up de demande */}
      {popupRide && (
        <RequestPopup
          ride={popupRide.ride}
          passenger={popupRide.passenger}
          onClose={() => setPopupRide(null)}
          onProposed={(rideId) => {
            proposedRef.current.add(rideId);
            setPopupRide(null);
            fetchMine();
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
              <Flame size={20} className="text-or" />
              Plus que {offlineConfirm.remaining} course{offlineConfirm.remaining > 1 ? 's' : ''} pour ton bonus !
            </p>
            <p className="text-sm text-slate-300">
              Encore {offlineConfirm.remaining} course{offlineConfirm.remaining > 1 ? 's' : ''} et tu
              gagnes {formatFcfa(offlineConfirm.bonus)} de bonus aujourd’hui. Tu restes en ligne ?
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
