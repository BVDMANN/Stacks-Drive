'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bike,
  Car,
  Clock,
  Crosshair,
  Gift,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  ShieldCheck,
  User,
  Users,
  X,
} from 'lucide-react';
import type { HeaderUser } from '@/components/shared/Header';
import type { DriverProfile, Ride, RideProposal } from '@/types';
import { ProposalCard } from './ProposalCard';
import { DriverCard } from './DriverCard';
import {
  LIBREVILLE_CENTER,
  NEIGHBORHOODS,
  NEIGHBORHOOD_COORDS,
  PAYMENT_LABELS,
  type Neighborhood,
  type PaymentMethod,
} from '@/lib/neighborhoods';
import { estimateFare, etaMinutes, type RideType, type VehiclePreference } from '@/lib/pricing';
import { haversineKm, nearestNeighborhood } from '@/lib/geo';
import {
  geoErrorMessage,
  getUserPosition,
  reverseGeocodeNominatim,
  type GeoErrorKind,
} from '@/lib/geolocation';
import { formatFcfa } from '@/lib/commission';
import { cn } from '@/lib/utils';
import type { FocusPoint } from '@/components/map/LibrevilleMap';

const LibrevilleMap = dynamic(
  () => import('@/components/map/LibrevilleMap').then((m) => m.LibrevilleMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-night-900 animate-pulse flex items-center justify-center">
        <p className="text-sm font-bold text-slate-400">Chargement de la carte de Libreville…</p>
      </div>
    ),
  }
);

type Phase = 'idle' | 'searching' | 'proposals' | 'confirmed' | 'done';

const DRAFT_KEY = 'stacks-drive-draft-v2';

/** Tarifs fixes mis en avant (trajets les plus demandés). */
const FIXED_FARES: { pickup: Neighborhood; destination: Neighborhood; label: string }[] = [
  { pickup: 'Centre-ville', destination: 'Aéroport Léon-Mba', label: 'Aéroport · 5 000 FCFA' },
  { pickup: 'Nzeng-Ayong', destination: 'Centre-ville', label: 'Nzeng-Ayong → Centre-ville · 900 FCFA' },
  { pickup: 'Glass', destination: 'Nzeng-Ayong', label: 'Glass → Nzeng-Ayong · 1 200 FCFA' },
];

const SELECTABLE = NEIGHBORHOODS.filter((n) => n !== 'Autre');

/** Hauteurs de la feuille (dvh) : réduite, mi-hauteur, pleine. */
const SHEET_SNAPS = [30, 58, 88];

interface Draft {
  pickup: Neighborhood | '';
  destination: Neighborhood | '';
  rideType: RideType;
  vehiclePreference: VehiclePreference;
  seats: number;
  paymentMethod: PaymentMethod;
}

function readDraft(): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d.pickup || !d.destination) return null;
    return d;
  } catch {
    return null;
  }
}

/** Prix animé : le chiffre glisse vers la nouvelle valeur (~450 ms) et
 *  fait un petit « pop » à chaque changement d'estimation. */
function AnimatedPrice({
  value,
  className,
  suffix,
}: {
  value: number | null;
  className?: string;
  suffix?: React.ReactNode;
}) {
  const [display, setDisplay] = useState(value ?? 0);
  const prevRef = useRef(value ?? 0);
  const [popKey, setPopKey] = useState(0);
  useEffect(() => {
    if (value === null) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    setPopKey((k) => k + 1);
    const start = performance.now();
    const dur = 450;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value === null) return <span className={className}>—</span>;
  return (
    <span key={popKey} className={cn('price-pop', className)}>
      {formatFcfa(display)}
      {suffix}
    </span>
  );
}

/** Écran d'accueil map-first « Libreville la nuit » : carte sombre plein
 *  écran + feuille de demande draggable en bas (départ géolocalisable,
 *  destination, type de course, prix fixe, commander). */
export function HomeScreen({
  user,
  realDrivers,
  demoDrivers,
}: {
  user: HeaderUser | null;
  realDrivers: DriverProfile[];
  demoDrivers: DriverProfile[];
}) {
  const router = useRouter();
  const [pickup, setPickup] = useState<Neighborhood | ''>('');
  const [destination, setDestination] = useState<Neighborhood | ''>('');
  const [rideType, setRideType] = useState<RideType>('groupe');
  const [vehiclePref, setVehiclePref] = useState<VehiclePreference>('tous');
  const [seats, setSeats] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('especes');
  const [phase, setPhase] = useState<Phase>('idle');
  const [rideId, setRideId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<RideProposal[]>([]);
  const [acceptedRide, setAcceptedRide] = useState<Ride | null>(null);
  const [acceptedDriver, setAcceptedDriver] = useState<DriverProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [searchStartedAt, setSearchStartedAt] = useState<number | null>(null);
  const [loyalty, setLoyalty] = useState<{ completedRides: number; ridesUntilFree: number } | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);

  // --- Géolocalisation du départ (« Me localiser ») ---
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [pickupExact, setPickupExact] = useState<{ lat: number; lng: number } | null>(null);
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const focusNonceRef = useRef(0);

  // --- Feuille draggable ---
  const [sheetH, setSheetH] = useState(SHEET_SNAPS[1]);
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean; pointerId: number } | null>(null);

  // Restaurer le brouillon après connexion.
  useEffect(() => {
    const d = readDraft();
    if (d) {
      setPickup(d.pickup);
      setDestination(d.destination);
      setRideType(d.rideType);
      setVehiclePref(d.vehiclePreference);
      setSeats(d.seats);
      setPaymentMethod(d.paymentMethod);
      window.localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  // Fidélité : progression vers la 10e course offerte.
  useEffect(() => {
    if (!user || user.role !== 'passager') return;
    fetch('/api/loyalty')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setLoyalty({ completedRides: d.completedRides, ridesUntilFree: d.ridesUntilFree });
      })
      .catch(() => undefined);
  }, [user]);

  const validTrip = pickup !== '' && destination !== '' && pickup !== destination;
  const estimate = useMemo(
    () =>
      validTrip
        ? estimateFare(pickup as Neighborhood, destination as Neighborhood, rideType, vehiclePref)
        : null,
    [pickup, destination, rideType, vehiclePref, validTrip]
  );
  const estimateSolo = useMemo(
    () =>
      validTrip
        ? estimateFare(pickup as Neighborhood, destination as Neighborhood, 'solo', vehiclePref)
        : null,
    [pickup, destination, vehiclePref, validTrip]
  );
  const estimateGroupe = useMemo(
    () =>
      validTrip
        ? estimateFare(pickup as Neighborhood, destination as Neighborhood, 'groupe', 'tous')
        : null,
    [pickup, destination, validTrip]
  );

  // Tous les chauffeurs en ligne : réels + démos. La carte et le compteur
  // « chauffeurs autour de toi » les montrent TOUS, Moto comprise : la
  // carte est une vitrine de l'offre, pas un filtre de mise en relation.
  const allDrivers = useMemo(() => [...realDrivers, ...demoDrivers], [realDrivers, demoDrivers]);
  // Chauffeurs éligibles à la mise en relation pour le trajet choisi :
  // la Moto est Solo uniquement (jamais en Groupe) et la préférence de
  // véhicule s'applique aussi. Utilisé uniquement pour l'ETA — jamais
  // pour la carte ni le compteur.
  const matchableDrivers = useMemo(() => {
    return allDrivers.filter((d) => {
      if (rideType === 'groupe' && d.vehicleType === 'Moto') return false;
      if (vehiclePref === 'moto') return d.vehicleType === 'Moto';
      if (vehiclePref === 'voiture') return d.vehicleType !== 'Moto';
      return true;
    });
  }, [allDrivers, rideType, vehiclePref]);

  // Coordonnées du départ : position exacte si géolocalisée, sinon centre du quartier.
  const pickupCoords = pickup !== ''
    ? (pickupExact ?? NEIGHBORHOOD_COORDS[pickup as Neighborhood])
    : null;
  const destCoords = destination !== '' ? NEIGHBORHOOD_COORDS[destination as Neighborhood] : null;

  // ETA du chauffeur le plus proche du point de départ.
  const nearestEta = useMemo(() => {
    if (!pickupCoords || matchableDrivers.length === 0) return null;
    let best: number | null = null;
    matchableDrivers.forEach((d) => {
      if (d.lat === null || d.lng === null) return;
      const dist = haversineKm(pickupCoords.lat, pickupCoords.lng, d.lat, d.lng);
      const eta = etaMinutes(dist);
      if (best === null || eta < best) best = eta;
    });
    return best;
  }, [pickupCoords, matchableDrivers]);

  const driversNearPickup = useMemo(() => {
    if (!pickupCoords) return allDrivers.length;
    // Rayon « autour de toi » : 10 km, comme le premier rayon de
    // recherche. Compte TOUS les chauffeurs en ligne, Moto comprise :
    // la Moto était exclue en Groupe et le compteur n'affichait que 5/6.
    return allDrivers.filter(
      (d) =>
        d.lat !== null &&
        d.lng !== null &&
        haversineKm(pickupCoords.lat, pickupCoords.lng, d.lat, d.lng) <= 10
    ).length;
  }, [pickupCoords, allDrivers]);

  // Horloge (comptes à rebours des propositions + élargissement).
  useEffect(() => {
    if (phase !== 'searching' && phase !== 'proposals') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // Sondage des propositions (toutes les 5 s pendant la recherche).
  useEffect(() => {
    if (!rideId || (phase !== 'searching' && phase !== 'proposals')) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/proposals?rideId=${rideId}`);
        const data = await res.json();
        if (cancelled || !data?.ok) return;
        const list = (data.proposals ?? []) as RideProposal[];
        setProposals(list);
        if (list.some((p) => p.status === 'pending')) setPhase('proposals');
      } catch {
        // Réseau instable : on réessaie au prochain tour.
      }
    }
    poll();
    const t = window.setInterval(poll, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [rideId, phase]);

  // Suivi de la course confirmée (toutes les 10 s).
  useEffect(() => {
    if (!rideId || phase !== 'confirmed') return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/rides/${rideId}`);
        const data = await res.json();
        if (cancelled || !data?.ok) return;
        setAcceptedRide(data.ride as Ride);
        if (data.driver) setAcceptedDriver(data.driver as DriverProfile);
        if ((data.ride as Ride).status === 'terminee') setPhase('done');
        if ((data.ride as Ride).status === 'annulee') {
          setPhase('idle');
          setRideId(null);
          setAcceptedRide(null);
          setAcceptedDriver(null);
        }
      } catch {
        // Réessaie au prochain tour.
      }
    }
    const t = window.setInterval(poll, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [rideId, phase]);

  const liveProposals = useMemo(() => {
    return proposals
      .filter((p) => p.status === 'pending')
      .map((p) => ({
        ...p,
        secondsLeft: Math.max(0, Math.round((new Date(p.expiresAt).getTime() - now) / 1000)),
      }))
      .filter((p) => p.secondsLeft > 0)
      .sort((a, b) => a.proposedPrice - b.proposedPrice);
  }, [proposals, now]);

  const widened =
    phase === 'searching' &&
    searchStartedAt !== null &&
    now - searchStartedAt > 30000 &&
    liveProposals.length === 0;

  // Marqueurs de la carte : TOUS les chauffeurs en ligne, découplés du
  // filtre de mise en relation (la Moto reste visible en Groupe — sa
  // bulle précise « Solo uniquement »).
  const mapDrivers = useMemo(
    () =>
      allDrivers
        .filter((d) => d.lat !== null && d.lng !== null)
        .map((d) => ({
          id: d.id,
          name: d.name,
          lat: d.lat as number,
          lng: d.lng as number,
          vehicleLabel: d.vehicleLabel,
          vehicleType: d.vehicleType ?? '',
          rating: d.rating,
          isDemo: d.isDemo,
        })),
    [allDrivers]
  );

  function saveDraft() {
    const draft: Draft = { pickup, destination, rideType, vehiclePreference: vehiclePref, seats, paymentMethod };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Stockage indisponible : l'utilisateur ressaisira son trajet.
    }
  }

  // --- « Me localiser » : GPS → quartier le plus proche → départ. ---
  async function handleLocate() {
    if (locating) return;
    setLocating(true);
    setGeoError(null);
    try {
      const pos = await getUserPosition();
      const nearest = nearestNeighborhood(pos.lat, pos.lng);
      if (nearest.distanceKm > 60) {
        // Hors de Libreville (ex. test depuis la France) : on ne place
        // pas un faux départ — message clair + sélection manuelle.
        setGeoError(
          `Tu es à ~${Math.round(nearest.distanceKm)} km de Libreville — la géolocalisation ne peut pas te placer ici. Choisis ton quartier dans la liste.`
        );
        return;
      }
      setPickup(nearest.neighborhood);
      setPickupExact({ lat: pos.lat, lng: pos.lng });
      setUserLocation({ lat: pos.lat, lng: pos.lng, label: nearest.neighborhood });
      setGeoLabel(null);
      focusNonceRef.current += 1;
      setFocusPoint({ lat: pos.lat, lng: pos.lng, zoom: 15, nonce: focusNonceRef.current });
      // Nom de rue en complément (best-effort, jamais bloquant).
      reverseGeocodeNominatim(pos.lat, pos.lng).then((label) => {
        if (label) setGeoLabel(label);
      });
    } catch (err) {
      setGeoError(geoErrorMessage(err as GeoErrorKind));
    } finally {
      setLocating(false);
    }
  }

  // Choix manuel du départ : on revient au centre du quartier.
  function handlePickupChange(value: Neighborhood | '') {
    setPickup(value);
    setPickupExact(null);
    setGeoLabel(null);
  }

  // Bouton « Recentrer » sur la carte : sur moi si localisé, sinon Libreville.
  function handleRecenter() {
    focusNonceRef.current += 1;
    if (userLocation) {
      setFocusPoint({ lat: userLocation.lat, lng: userLocation.lng, zoom: 15, nonce: focusNonceRef.current });
    } else {
      setFocusPoint({ lat: LIBREVILLE_CENTER.lat, lng: LIBREVILLE_CENTER.lng, zoom: 12, nonce: focusNonceRef.current });
    }
  }

  // --- Feuille draggable : glisser la poignée, relâcher = cran le plus proche. ---
  function onHandlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const vh = window.innerHeight;
    dragRef.current = {
      startY: e.clientY,
      startH: (sheetH / 100) * vh,
      moved: false,
      pointerId: e.pointerId,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onHandlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const vh = window.innerHeight;
    if (Math.abs(drag.startY - e.clientY) > 6) drag.moved = true;
    const px = Math.min(0.9 * vh, Math.max(0.26 * vh, drag.startH + (drag.startY - e.clientY)));
    setSheetH((px / vh) * 100);
  }
  function onHandlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (!drag.moved) {
      // Simple tap sur la poignée : bascule réduite ↔ mi-hauteur.
      setSheetH((h) => (h > 45 ? SHEET_SNAPS[0] : SHEET_SNAPS[1]));
      return;
    }
    setSheetH((h) => {
      let best = SHEET_SNAPS[0];
      let bestDist = Infinity;
      SHEET_SNAPS.forEach((s) => {
        const d = Math.abs(h - s);
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      });
      return best;
    });
  }

  async function commander() {
    setError(null);
    if (!validTrip || !estimate) return;
    if (!user) {
      saveDraft();
      router.push('/connexion?next=/');
      return;
    }
    if (user.role !== 'passager') {
      setError('Bascule en mode Passager (en haut) pour commander une course.');
      return;
    }
    setBusy(true);
    const res = await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup,
        destination,
        rideType,
        vehiclePreference: vehiclePref,
        seats: rideType === 'groupe' ? seats : 1,
        paymentMethod,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Demande impossible pour le moment. Réessaie.');
      return;
    }
    setRideId(data.rideId as string);
    setProposals([]);
    setSearchStartedAt(Date.now());
    setNow(Date.now());
    setPhase('searching');
  }

  async function accepter(proposalId: string) {
    setBusyProposalId(proposalId);
    setError(null);
    const res = await fetch(`/api/proposals/${proposalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept' }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setBusyProposalId(null);
      setError(data?.error ?? 'Acceptation impossible — la proposition a peut-être expiré.');
      return;
    }
    // Recharger la course confirmée (chauffeur assigné + prix figé).
    const rideRes = await fetch(`/api/rides/${rideId}`);
    const rideData = await rideRes.json().catch(() => null);
    setBusyProposalId(null);
    if (rideData?.ok) {
      setAcceptedRide(rideData.ride as Ride);
      setAcceptedDriver((rideData.driver as DriverProfile | null) ?? null);
      setPhase('confirmed');
    }
  }

  async function refuser(proposalId: string) {
    setBusyProposalId(proposalId);
    await fetch(`/api/proposals/${proposalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline' }),
    }).catch(() => undefined);
    setBusyProposalId(null);
    setProposals((prev) => prev.filter((p) => p.id !== proposalId));
  }

  async function annulerCourse() {
    if (!rideId) return;
    setBusy(true);
    await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    }).catch(() => undefined);
    setBusy(false);
    resetToIdle();
  }

  function resetToIdle() {
    setPhase('idle');
    setRideId(null);
    setProposals([]);
    setAcceptedRide(null);
    setAcceptedDriver(null);
    setSearchStartedAt(null);
    setError(null);
  }

  const isChauffeurMode = user?.role === 'chauffeur';
  const etaForProposal = (p: RideProposal): number | null => {
    if (!pickupCoords || !p.driver || p.driver.lat === null || p.driver.lng === null) return null;
    return etaMinutes(haversineKm(pickupCoords.lat, pickupCoords.lng, p.driver.lat, p.driver.lng));
  };
  const etaAccepted =
    acceptedDriver && pickupCoords && acceptedDriver.lat !== null && acceptedDriver.lng !== null
      ? etaMinutes(haversineKm(pickupCoords.lat, pickupCoords.lng, acceptedDriver.lat, acceptedDriver.lng))
      : null;

  return (
    <div className="relative flex-1 min-h-0">
      <LibrevilleMap
        className="absolute inset-0 h-full w-full"
        drivers={mapDrivers}
        pickup={pickupCoords && pickup ? { ...pickupCoords, label: pickup } : null}
        destination={destCoords && destination ? { ...destCoords, label: destination } : null}
        radarActive={phase === 'searching' || phase === 'proposals'}
        radarCenter={pickupCoords && pickup ? { ...pickupCoords, label: pickup } : null}
        selectedDriverId={selectedDriverId}
        assignedDriverId={acceptedDriver?.id ?? null}
        userLocation={userLocation}
        focusPoint={focusPoint}
        onDriverClick={(id) => setSelectedDriverId(id)}
      />

      {/* Compteur de chauffeurs autour */}
      {phase === 'idle' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/10 shadow-xl shadow-black/40 rounded-full px-4 py-2 text-xs font-black text-slate-100">
            <span className="w-2 h-2 rounded-full bg-volt animate-pulse shadow-[0_0_8px_rgba(46,255,139,0.9)]" />
            {driversNearPickup} chauffeur{driversNearPickup > 1 ? 's' : ''} autour de toi
          </span>
        </div>
      )}

      {/* Bouton « Recentrer » */}
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/15 text-white text-xs font-black px-3 py-2 rounded-full shadow-xl shadow-black/40 hover:border-volt/60 active:scale-95 transition-all"
        aria-label={userLocation ? 'Recentrer sur ma position' : 'Recentrer sur Libreville'}
      >
        <Crosshair size={15} className="text-volt" />
        {userLocation ? 'Moi' : 'Libreville'}
      </button>

      {/* Feuille du bas — draggable */}
      <div
        className="absolute inset-x-0 bottom-0 sm:left-4 sm:bottom-4 sm:right-auto sm:w-[440px] z-20"
        style={{ height: `${sheetH}dvh` }}
      >
        <div className="sheet-glass sheet-up h-full overflow-y-auto rounded-t-[28px] sm:rounded-[28px] shadow-2xl shadow-black/60">
          {/* Poignée draggable */}
          <button
            type="button"
            className="sheet-handle w-full pt-2.5 pb-1.5 flex justify-center"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={onHandlePointerUp}
            onPointerCancel={onHandlePointerUp}
            aria-label="Glisser pour agrandir ou réduire la feuille"
          >
            <span className="sheet-handle-bar w-10 h-1.5 rounded-full bg-white/30" />
          </button>

          {error && (
            <div className="mx-4 mt-2 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-2xl p-3">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Fermer le message">
                <X size={16} />
              </button>
            </div>
          )}

          {phase === 'idle' && (
            <div className="p-4 sm:p-5 pt-1 space-y-4">
              {isChauffeurMode && (
                <div className="bg-gold/10 border border-gold/30 rounded-2xl p-3 text-sm">
                  <p className="font-black text-gold">Tu es en mode Chauffeur.</p>
                  <p className="text-slate-300 mt-0.5">
                    Mets-toi en ligne depuis ton{' '}
                    <Link href="/tableau-de-bord" className="font-black underline text-white">
                      tableau de bord
                    </Link>{' '}
                    pour recevoir des demandes — ou bascule en mode Passager (en haut) pour commander.
                  </p>
                </div>
              )}

              <h1 className="text-xl font-black text-white leading-tight">
                Où allez-vous ?
              </h1>

              {/* Départ / Destination */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-1">
                  <Navigation size={18} className="text-volt shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Départ
                    </span>
                    <select
                      value={pickup}
                      onChange={(e) => handlePickupChange(e.target.value as Neighborhood | '')}
                      className="w-full bg-transparent font-bold text-white focus:outline-none py-0.5"
                      aria-label="Point de départ"
                    >
                      <option value="">Ton point de départ…</option>
                      {SELECTABLE.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </span>
                  <button
                    type="button"
                    onClick={handleLocate}
                    disabled={locating}
                    className="inline-flex items-center gap-1.5 shrink-0 text-xs font-black text-night-900 bg-volt px-3 py-2 rounded-full hover:bg-emerald-300 active:scale-95 transition-all disabled:opacity-60"
                  >
                    {locating ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <LocateFixed size={14} />
                    )}
                    {locating ? 'Localisation…' : 'Me localiser'}
                  </button>
                </div>
                {geoLabel && pickup !== '' && (
                  <p className="text-xs font-bold text-volt flex items-center gap-1 px-1">
                    <MapPin size={12} /> {geoLabel} · {pickup}
                  </p>
                )}
                {geoError && (
                  <p className="text-xs font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                    {geoError}
                  </p>
                )}
                <label className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-1">
                  <MapPin size={18} className="text-gold shrink-0" />
                  <span className="flex-1">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Destination
                    </span>
                    <select
                      value={destination}
                      onChange={(e) => setDestination(e.target.value as Neighborhood | '')}
                      className="w-full bg-transparent font-bold text-white focus:outline-none py-0.5"
                      aria-label="Destination"
                    >
                      <option value="">Où vas-tu ?</option>
                      {SELECTABLE.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </span>
                </label>
                {pickup !== '' && destination !== '' && pickup === destination && (
                  <p className="text-xs font-bold text-red-300">
                    Le départ et la destination doivent être différents.
                  </p>
                )}
              </div>

              {/* Tarifs fixes */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <ShieldCheck size={13} className="text-volt" /> Tarifs fixes — prix garanti, jamais de surge
                </p>
                <div className="flex flex-wrap gap-2">
                  {FIXED_FARES.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        setPickup(f.pickup);
                        setDestination(f.destination);
                        setPickupExact(null);
                        setGeoLabel(null);
                        setRideType('groupe');
                      }}
                      className="text-xs font-bold bg-volt/10 border border-volt/30 text-volt px-3 py-1.5 rounded-full hover:bg-volt/20 active:scale-95 transition-all"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Types de course */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Type de course
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setRideType('groupe')}
                    aria-pressed={rideType === 'groupe'}
                    className={cn(
                      'relative text-left rounded-3xl border-2 p-3.5 transition-all active:scale-[0.98]',
                      rideType === 'groupe'
                        ? 'border-ember bg-ember/10 shadow-lg shadow-ember/20'
                        : 'border-white/10 bg-white/5 hover:border-white/25'
                    )}
                  >
                    <span className="absolute -top-2.5 left-3 bg-gold text-night-900 text-[10px] font-black px-2 py-0.5 rounded-full">
                      LE MOINS CHER
                    </span>
                    <span className="flex items-center gap-1.5 font-black text-white">
                      <Users size={17} /> Groupe
                    </span>
                    <span className="block text-xs text-slate-400 mt-1 leading-snug">
                      Partagée, comme le taxi — prix divisé par passager, arrêts dans l’ordre.
                    </span>
                    <span className="block font-black text-lg text-white mt-2">
                      <AnimatedPrice
                        value={validTrip ? estimateGroupe?.price ?? null : null}
                        suffix={<span className="text-xs font-bold text-slate-400"> / passager</span>}
                      />
                    </span>
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                      <Clock size={12} />
                      {nearestEta !== null ? `chauffeur dans ~${nearestEta} min` : 'chauffeurs autour'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRideType('solo')}
                    aria-pressed={rideType === 'solo'}
                    className={cn(
                      'relative text-left rounded-3xl border-2 p-3.5 transition-all active:scale-[0.98]',
                      rideType === 'solo'
                        ? 'border-ember bg-ember/10 shadow-lg shadow-ember/20'
                        : 'border-white/10 bg-white/5 hover:border-white/25'
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-black text-white">
                      <User size={17} /> Solo
                    </span>
                    <span className="block text-xs text-slate-400 mt-1 leading-snug">
                      Privée et directe, sans arrêt — pour toi seul ou ton petit groupe.
                    </span>
                    <span className="block font-black text-lg text-white mt-2">
                      <AnimatedPrice
                        value={validTrip ? estimateSolo?.price ?? null : null}
                        suffix={<span className="text-xs font-bold text-slate-400"> la course</span>}
                      />
                    </span>
                    <span className="text-xs font-bold text-slate-400 flex items-center gap-1">
                      <Clock size={12} />
                      {nearestEta !== null ? `chauffeur dans ~${nearestEta} min` : 'chauffeurs autour'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Véhicule + places + paiement */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-full">
                  Véhicule
                </span>
                {(
                  [
                    { value: 'tous', label: 'Tous', icon: Car },
                    { value: 'voiture', label: 'Voiture', icon: Car },
                    { value: 'moto', label: 'Moto', icon: Bike },
                  ] as const
                ).map((v) => {
                  const disabled = v.value === 'moto' && rideType === 'groupe';
                  return (
                    <button
                      key={v.value}
                      type="button"
                      disabled={disabled}
                      title={disabled ? 'La moto ne prend qu’un passager : Solo uniquement.' : undefined}
                      onClick={() => setVehiclePref(v.value)}
                      aria-pressed={vehiclePref === v.value}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-black border-2 transition-all active:scale-95 disabled:opacity-40',
                        vehiclePref === v.value
                          ? 'border-volt bg-volt/10 text-volt'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25'
                      )}
                    >
                      <v.icon size={14} /> {v.label}
                    </button>
                  );
                })}
                {rideType === 'groupe' && (
                  <span className="inline-flex items-center gap-1 ml-1">
                    <span className="text-xs font-bold text-slate-400">Passagers :</span>
                    <span className="inline-flex items-center rounded-full bg-white/5 border border-white/10">
                      <button
                        type="button"
                        aria-label="Moins de passagers"
                        disabled={seats <= 1}
                        onClick={() => setSeats((s) => Math.max(1, s - 1))}
                        className="w-7 h-7 font-black text-slate-200 disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-black text-white">{seats}</span>
                      <button
                        type="button"
                        aria-label="Plus de passagers"
                        disabled={seats >= 4}
                        onClick={() => setSeats((s) => Math.min(4, s + 1))}
                        className="w-7 h-7 font-black text-slate-200 disabled:opacity-40"
                      >
                        +
                      </button>
                    </span>
                  </span>
                )}
              </div>

              <label className="flex items-center gap-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Paiement
                </span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white focus:border-volt focus:outline-none"
                  aria-label="Moyen de paiement"
                >
                  {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                  ))}
                </select>
              </label>

              {/* Estimation + Commander */}
              {estimate && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between gap-3 rise-in">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Prix estimé — fixe
                    </p>
                    <p className="text-2xl font-black text-white leading-tight">
                      <AnimatedPrice
                        value={estimate.price}
                        suffix={
                          rideType === 'groupe' ? (
                            <span className="text-sm font-bold text-slate-400"> / passager</span>
                          ) : undefined
                        }
                      />
                    </p>
                    <p className="text-xs text-slate-400">{estimate.breakdown}</p>
                  </div>
                  <span className="text-right text-xs font-bold text-volt">
                    Prix garanti
                    <span className="block text-slate-400 font-semibold">jamais de surge</span>
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={!validTrip || !estimate || busy || isChauffeurMode}
                onClick={commander}
                className="w-full bg-ember text-white font-black text-lg py-4 rounded-full shadow-lg shadow-ember/40 hover:bg-ember-light active:scale-[0.98] transition-all disabled:opacity-40"
              >
                {busy
                  ? 'Envoi…'
                  : !user
                    ? 'Se connecter pour commander'
                    : estimate
                      ? `Commander · ${formatFcfa(estimate.price)}`
                      : 'Commander'}
              </button>

              {loyalty && (
                <p className="text-xs font-bold text-slate-300 flex items-center gap-1.5 justify-center">
                  <Gift size={14} className="text-gold" />
                  {loyalty.ridesUntilFree === 1
                    ? 'Ta prochaine course est OFFERTE — la 10e !'
                    : `Plus que ${loyalty.ridesUntilFree} course${loyalty.ridesUntilFree > 1 ? 's' : ''} avant ta course offerte`}
                  <span className="text-slate-500">({loyalty.completedRides % 10}/10)</span>
                </p>
              )}

              <p className="text-[11px] text-slate-500 text-center">
                <Link href="/a-propos" className="underline hover:text-volt">
                  Comment ça marche
                </Link>
                {' · '}
                <Link href="/cgu" className="underline hover:text-volt">CGU</Link>
                {' · '}
                <span>© OpenStreetMap · Esri</span>
              </p>
            </div>
          )}

          {(phase === 'searching' || phase === 'proposals') && (
            <div className="p-4 sm:p-5 pt-1 space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white flex items-center justify-center gap-2">
                  Recherche de chauffeurs
                  <span aria-hidden className="inline-flex gap-1">
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-volt inline-block" />
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-volt inline-block" />
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-volt inline-block" />
                  </span>
                </h2>
                <p className="text-sm text-slate-400">
                  {pickup} → {destination} · {rideType === 'groupe' ? 'Groupe' : 'Solo'} ·{' '}
                  {estimate ? formatFcfa(estimate.price) : ''} · prix fixe
                </p>
                {widened && (
                  <p className="text-sm font-bold text-gold bg-gold/10 border border-gold/30 rounded-xl p-2.5 mt-2">
                    Aucun chauffeur pour l’instant — on élargit la recherche autour de toi…
                  </p>
                )}
              </div>

              {liveProposals.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm font-black text-white">
                    {liveProposals.length} proposition{liveProposals.length > 1 ? 's' : ''} reçue{liveProposals.length > 1 ? 's' : ''} — à toi de choisir :
                  </p>
                  {liveProposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      estimatePrice={estimate?.price ?? p.proposedPrice}
                      etaMin={etaForProposal(p)}
                      secondsLeft={p.secondsLeft ?? 0}
                      busy={busyProposalId !== null}
                      onAccept={accepter}
                      onDecline={refuser}
                    />
                  ))}
                  <p className="text-xs text-slate-500 text-center">
                    D’autres chauffeurs peuvent encore proposer — la meilleure offre gagne.
                  </p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-sm text-slate-400">
                  Les chauffeurs en ligne autour de {pickup} reçoivent ta demande…
                  <span className="block text-xs text-slate-500 mt-1">
                    Le radar cherche jusqu’à 10 km, puis élargit à 25 km.
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={annulerCourse}
                className="w-full text-sm font-bold text-red-400 hover:underline disabled:opacity-50"
              >
                Annuler la demande
              </button>
            </div>
          )}

          {phase === 'confirmed' && acceptedRide && acceptedDriver && (
            <div className="p-4 sm:p-5 pt-1 space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white">
                  {acceptedRide.status === 'en_cours' ? 'Course en cours — bon trajet !' : 'Ton chauffeur arrive !'}
                </h2>
                <p className="text-sm text-slate-400">
                  {acceptedRide.pickup} → {acceptedRide.destination} ·{' '}
                  {acceptedRide.rideType === 'groupe' ? 'Groupe' : 'Solo'}
                  {acceptedRide.firstStop ? ` · 1er arrêt : ${acceptedRide.firstStop}` : ''}
                </p>
              </div>
              <DriverCard
                driver={acceptedDriver}
                ride={acceptedRide}
                etaMin={etaAccepted}
                shareUrl={acceptedRide.shareToken ? `/suivi/${acceptedRide.shareToken}` : `/courses/${acceptedRide.id}`}
                detailUrl={`/courses/${acceptedRide.id}`}
                onCancel={acceptedRide.status === 'acceptee' ? annulerCourse : undefined}
                cancelling={busy}
              />
              <button
                type="button"
                onClick={resetToIdle}
                className="w-full text-sm font-bold text-volt hover:underline"
              >
                Nouvelle course
              </button>
            </div>
          )}

          {phase === 'done' && (
            <div className="p-4 sm:p-5 pt-1 space-y-4 text-center">
              <h2 className="text-lg font-black text-white">Course terminée — merci !</h2>
              <p className="text-sm text-slate-400">
                Dis-nous comment s’est passée ta course : ta note aide les autres passagers.
              </p>
              {acceptedRide && (
                <Link
                  href={`/courses/${acceptedRide.id}`}
                  className="inline-block bg-ember text-white font-black px-6 py-3.5 rounded-full shadow-md shadow-ember/30 hover:bg-ember-light transition-colors"
                >
                  Noter mon chauffeur
                </Link>
              )}
              <button
                type="button"
                onClick={resetToIdle}
                className="block w-full text-sm font-bold text-volt hover:underline"
              >
                Nouvelle course
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
