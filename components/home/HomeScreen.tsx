'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bike,
  Car,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
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
import type { SessionProfile } from '@/lib/supabase/server';
import { ProposalCard } from './ProposalCard';
import { DriverCard } from './DriverCard';
import { DriverHome } from '@/components/driver/DriverHome';
import {
  LIBREVILLE_CENTER,
  NEIGHBORHOODS,
  NEIGHBORHOOD_COORDS,
  PAYMENT_LABELS,
  dropOffPointFor,
  isDifficultAccess,
  type Neighborhood,
  type PaymentMethod,
} from '@/lib/neighborhoods';
import { UNPAVED_ROAD_SUPPLEMENT, estimateFare, etaMinutes, type RideType, type VehiclePreference } from '@/lib/pricing';
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

/** Tarifs fixes mis en avant (trajets les plus demandés) — v2.3, baisse de 24 %. */
const FIXED_FARES: { pickup: Neighborhood; destination: Neighborhood; label: string }[] = [
  { pickup: 'Centre-ville', destination: 'Aéroport Léon-Mba', label: 'Aéroport · 3 800 FCFA' },
  { pickup: 'Nzeng-Ayong', destination: 'Centre-ville', label: 'Nzeng-Ayong → Centre-ville · 700 FCFA' },
  { pickup: 'Glass', destination: 'Nzeng-Ayong', label: 'Glass → Nzeng-Ayong · 900 FCFA' },
];

const SELECTABLE = NEIGHBORHOODS.filter((n) => n !== 'Autre');

/** Hauteurs de la feuille (dvh), façon Uber / Bolt / Yango : trois crans
 *  nets — mini (15 : poignée + titre, la carte est quasi entièrement
 *  visible), aperçu (30) et pleine (58). Le cran mini n'existe qu'en
 *  phase idle : glisser la feuille vers le bas l'y range et libère la
 *  carte. Pas de cran 88 : la pleine hauteur suffit, même en course. */
const SHEET_SNAPS = [15, 30, 58];

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
  profile,
  realDrivers,
  demoDrivers,
}: {
  user: HeaderUser | null;
  /** Profil complet du compte connecté (v2.3) : l'accueil chauffeur
   *  a besoin de is_online / is_verified / current_area / véhicule.
   *  Null quand déconnecté ou profil manquant. */
  profile?: SessionProfile | null;
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
  // Route non bitumée (v2.6) : le passager demande la continuité
  // jusqu'à un quartier à accès difficile (+ supplément). Remis à zéro
  // à chaque changement de destination.
  const [unpavedRoad, setUnpavedRoad] = useState(false);
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
  // Pendant un glisser, pas de transition (la feuille suit le doigt 1:1) ;
  // au relâcher / au tap, la hauteur glisse vers le cran (ressort).
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean; pointerId: number } | null>(null);

  // Le cran mini n'existe qu'en phase idle : dès qu'une recherche ou une
  // course démarre, la feuille remonte à mi-hauteur pour rester lisible.
  useEffect(() => {
    if (phase !== 'idle') setSheetH(58);
  }, [phase]);
  const isMini = phase === 'idle' && sheetH <= 20;
  // Feuille dépliée : les pastilles du haut de la carte s'effacent
  // (elles glissent vers le haut au lieu de rester figées sur la carte).
  const sheetExpanded = sheetH >= 58;
  // Feuille à pleine hauteur : le chevron de la poignée pointe vers le
  // bas (replier), sinon vers le haut (déplier).
  const atFull = sheetH >= 58;

  // Crans autorisés selon la phase : en idle les trois, sinon aperçu et
  // pleine seulement (la feuille reste utilisable pendant une course).
  function allowedSnaps() {
    return phase === 'idle' ? SHEET_SNAPS : SHEET_SNAPS.filter((s) => s >= 30);
  }
  // Bascule entre crans, dans l'ordre : mini → aperçu → pleine → mini
  // (idle) ou aperçu ↔ pleine (recherche / course). Utilisée par le tap
  // sur la poignée et par le bouton chevron — jamais de saut direct.
  function cycleSheet() {
    const snaps = allowedSnaps();
    setSheetH((h) => {
      let idx = 0;
      let bestDist = Infinity;
      snaps.forEach((s, i) => {
        const d = Math.abs(h - s);
        if (d < bestDist) {
          bestDist = d;
          idx = i;
        }
      });
      return snaps[(idx + 1) % snaps.length];
    });
  }

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

  const validTrip = pickup !== '' && destination !== '' && pickup !== destination;
  // Destination à accès difficile ? La course s'arrête par défaut au
  // point de dépôt, sauf si le passager coche la route non bitumée.
  const destDifficult = destination !== '' && isDifficultAccess(destination as Neighborhood);
  const destDropOff =
    destination !== '' ? dropOffPointFor(destination as Neighborhood) : null;
  const estimate = useMemo(
    () =>
      validTrip
        ? estimateFare(pickup as Neighborhood, destination as Neighborhood, rideType, vehiclePref, {
            unpavedRoad,
          })
        : null,
    [pickup, destination, rideType, vehiclePref, unpavedRoad, validTrip]
  );
  const estimateSolo = useMemo(
    () =>
      validTrip
        ? estimateFare(pickup as Neighborhood, destination as Neighborhood, 'solo', vehiclePref, {
            unpavedRoad,
          })
        : null,
    [pickup, destination, vehiclePref, unpavedRoad, validTrip]
  );
  const estimateGroupe = useMemo(
    () =>
      validTrip
        ? estimateFare(pickup as Neighborhood, destination as Neighborhood, 'groupe', 'tous', {
            unpavedRoad,
          })
        : null,
    [pickup, destination, unpavedRoad, validTrip]
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

  // Choix de la destination : la demande de route non bitumée repart
  // de zéro (elle ne vaut que pour le quartier choisi).
  function handleDestinationChange(value: Neighborhood | '') {
    setDestination(value);
    setUnpavedRoad(false);
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
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onHandlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const vh = window.innerHeight;
    if (Math.abs(drag.startY - e.clientY) > 6) drag.moved = true;
    // En phase idle on peut descendre jusqu'au cran mini (12 dvh) ;
    // pendant une recherche / course, la feuille ne descend pas sous 30.
    const minPx = phase === 'idle' ? 0.1 * vh : 0.28 * vh;
    const px = Math.min(0.9 * vh, Math.max(minPx, drag.startH + (drag.startY - e.clientY)));
    setSheetH((px / vh) * 100);
  }
  function onHandlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag) return;
    if (!drag.moved) {
      // Simple tap sur la poignée : bascule au cran suivant (mini →
      // aperçu → pleine → mini en idle ; aperçu ↔ pleine sinon).
      cycleSheet();
      return;
    }
    // Glisser : on s'arrête au cran le plus proche. Hors phase idle, le
    // cran mini n'existe pas : le minimum est 30.
    const snaps = allowedSnaps();
    setSheetH((h) => {
      let best = snaps[0];
      let bestDist = Infinity;
      snaps.forEach((s) => {
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
        unpavedRoad,
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
        drivers={isChauffeurMode ? [] : mapDrivers}
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

      {/* Compteur de chauffeurs autour — passagers seulement, s'efface
          quand la feuille se déplie */}
      {phase === 'idle' && !isChauffeurMode && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none transition-all duration-500 ${
            sheetExpanded ? 'opacity-0 -translate-y-2' : 'opacity-100'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/10 shadow-xl shadow-black/40 rounded-full px-4 py-2 text-xs font-black text-slate-100">
            <span className="w-2 h-2 rounded-full bg-cyan animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
            {driversNearPickup} chauffeur{driversNearPickup > 1 ? 's' : ''} autour de toi
          </span>
        </div>
      )}

      {/* Bouton « Recentrer » — s'efface quand la feuille se déplie */}
      <button
        type="button"
        onClick={handleRecenter}
        className={`absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/15 text-white text-xs font-black px-3 py-2 rounded-full shadow-xl shadow-black/40 hover:border-cyan/60 active:scale-95 transition-all duration-500 ${
          sheetExpanded ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100'
        }`}
        aria-label={userLocation ? 'Recentrer sur ma position' : 'Recentrer sur Libreville'}
      >
        <Crosshair size={15} className="text-cyan" />
        {userLocation ? 'Moi' : 'Libreville'}
      </button>

      {/* Feuille du bas — draggable : glisse avec un ressort quand on
          relâche ou qu'on tape (pas de saut direct au cran). */}
      <div
        className="absolute inset-x-0 bottom-0 sm:left-4 sm:bottom-4 sm:right-auto sm:w-[440px] z-20"
        style={{
          height: `${sheetH}dvh`,
          transition: isDragging ? 'none' : 'height 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div className="sheet-glass sheet-up h-full overflow-y-auto overscroll-contain rounded-t-[28px] sm:rounded-[28px] shadow-2xl shadow-black/60">
          {/* Poignée draggable + bouton chevron (façon Uber) : la poignée
              se glisse au doigt, le chevron — toujours visible, à droite
              de la poignée — replie / déplie la feuille cran par cran.
              Les deux sont des boutons frères (jamais imbriqués) pour que
              le tap sur le chevron ne déclenche pas un glisser. */}
          <div className="relative">
            <button
              type="button"
              className="sheet-handle touch-none w-full pt-2.5 pb-1.5 flex justify-center"
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
              onPointerCancel={onHandlePointerUp}
              aria-label="Glisser pour agrandir ou réduire la feuille"
            >
              <span className="sheet-handle-bar w-10 h-1.5 rounded-full bg-white/30" />
            </button>
            {/* Chevron masqué en mini : la ligne mini a déjà son
                propre chevron, sinon deux chevrons se superposent. */}
            {!isMini && (
            <button
              type="button"
              onClick={cycleSheet}
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-night-800/90 backdrop-blur border border-white/15 shadow-lg shadow-black/40 hover:border-cyan/60 active:scale-90 transition-all"
              aria-label={atFull ? 'Replier la feuille' : 'Déplier la feuille'}
            >
              {atFull ? (
                <ChevronDown size={18} className="text-cyan" />
              ) : (
                <ChevronUp size={18} className="text-cyan" />
              )}
            </button>
            )}
          </div>

          {/* Cran mini : poignée + titre seulement — la carte est libérée.
              Tap sur la barre = rouvrir ; la poignée reste draggable. */}
          {isMini && (
            <button
              type="button"
              onClick={() => setSheetH(58)}
              className="w-full px-4 pb-3 flex items-center justify-between"
              aria-label="Agrandir la feuille"
            >
              <span className="text-base font-black text-white">
                {isChauffeurMode ? 'Mode Chauffeur' : 'Où allez-vous ?'}
              </span>
              <ChevronUp size={20} className="text-cyan" />
            </button>
          )}

          {error && !isMini && (
            <div className="mx-4 mt-2 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-2xl p-3">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Fermer le message">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Accueil chauffeur (v2.3) : écran distinct — pas de formulaire
              de commande, pas de pastilles de tarifs. */}
          {phase === 'idle' && !isMini && isChauffeurMode && profile && (
            <DriverHome profile={profile} />
          )}

          {phase === 'idle' && !isMini && (!isChauffeurMode || !profile) && (
            <div className="p-4 sm:p-5 pt-1 space-y-4">
              <h1 className="text-xl font-black text-white leading-tight">
                Où allez-vous ?
              </h1>

              {/* Départ / Destination */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-1">
                  <Navigation size={18} className="text-cyan shrink-0" />
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
                    className="inline-flex items-center gap-1.5 shrink-0 text-xs font-black text-night-900 bg-cyan px-3 py-2 rounded-full hover:bg-emerald-300 active:scale-95 transition-all disabled:opacity-60"
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
                  <p className="text-xs font-bold text-cyan flex items-center gap-1 px-1">
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
                      onChange={(e) => handleDestinationChange(e.target.value as Neighborhood | '')}
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
                {/* Accès difficile (v2.6) : la route bitumée s'arrête au
                    point de dépôt — le passager choisit d'y descendre ou
                    de demander la piste (+ supplément). Le chauffeur
                    reste libre d'accepter ou non la piste. */}
                {destDifficult && destDropOff && (
                  <div className="bg-gold/10 border border-gold/40 rounded-2xl p-3.5 space-y-2.5">
                    <p className="text-sm font-bold text-gold flex items-start gap-1.5">
                      <MapPin size={15} className="shrink-0 mt-0.5" />
                      Accès difficile : la route bitumée s’arrête à {destDropOff}. La course
                      s’y termine par défaut.
                    </p>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={unpavedRoad}
                        onChange={(e) => setUnpavedRoad(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#FFC700]"
                      />
                      <span className="text-sm text-slate-200 leading-snug">
                        <span className="font-black text-white">
                          Continuer sur route non bitumée (+{formatFcfa(UNPAVED_ROAD_SUPPLEMENT)})
                        </span>
                        <span className="block text-xs text-slate-400 mt-0.5">
                          Le chauffeur peut accepter ou refuser la piste : s’il refuse, tu
                          descends au point de dépôt ({destDropOff}) et le supplément est retiré.
                        </span>
                      </span>
                    </label>
                  </div>
                )}
                {pickup !== '' && destination !== '' && pickup === destination && (
                  <p className="text-xs font-bold text-red-300">
                    Le départ et la destination doivent être différents.
                  </p>
                )}
              </div>

              {/* Tarifs fixes */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <ShieldCheck size={13} className="text-cyan" /> Tarifs fixes — prix garanti, jamais de surge
                </p>
                <div className="flex flex-wrap gap-2">
                  {FIXED_FARES.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        setPickup(f.pickup);
                        setDestination(f.destination);
                        setUnpavedRoad(false);
                        setPickupExact(null);
                        setGeoLabel(null);
                        setRideType('groupe');
                      }}
                      className="text-xs font-bold bg-cyan/10 border border-cyan/30 text-cyan px-3 py-1.5 rounded-full hover:bg-cyan/20 active:scale-95 transition-all"
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
                        ? 'border-or bg-or/10 shadow-lg shadow-or/20'
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
                        ? 'border-or bg-or/10 shadow-lg shadow-or/20'
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
                          ? 'border-cyan bg-cyan/10 text-cyan'
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
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white focus:border-cyan focus:outline-none"
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
                  <span className="text-right text-xs font-bold text-cyan">
                    Prix garanti
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={!validTrip || !estimate || busy || isChauffeurMode}
                onClick={commander}
                className="w-full bg-or text-night-900 font-black text-lg py-4 rounded-full shadow-lg shadow-or/40 hover:bg-or-light active:scale-[0.98] transition-all disabled:opacity-40"
              >
                {busy
                  ? 'Envoi…'
                  : !user
                    ? 'Se connecter pour commander'
                    : estimate
                      ? `Commander · ${formatFcfa(estimate.price)}`
                      : 'Commander'}
              </button>

              <p className="text-[11px] text-slate-500 text-center">
                <Link href="/a-propos" className="underline hover:text-cyan">
                  Comment ça marche
                </Link>
                {' · '}
                <Link href="/cgu" className="underline hover:text-cyan">CGU</Link>
                {' · '}
                <Link href="/cookies" className="underline hover:text-cyan">Cookies</Link>
                {' · '}
                <span>© OpenStreetMap · Esri</span>
              </p>

              {/* Côté chauffeur : uniquement pour ceux que ça intéresse. */}
              {!isChauffeurMode && (
                <Link href="/devenir-chauffeur" className="block bg-white/[0.03] border border-white/10 rounded-2xl p-4 hover:border-cyan/40 transition-colors">
                  <p className="font-black text-white text-sm flex items-center gap-2">
                    <Car size={16} className="text-cyan" /> Vous avez une voiture ?
                  </p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Conduisez quand vous voulez. Opter pour la liberté financière, à votre rythme.
                  </p>
                  <span className="inline-flex items-center gap-1.5 mt-2 text-sm font-black text-cyan">
                    Devenir chauffeur →
                  </span>
                </Link>
              )}
            </div>
          )}

          {(phase === 'searching' || phase === 'proposals') && (
            <div className="p-4 sm:p-5 pt-1 space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white flex items-center justify-center gap-2">
                  Recherche de chauffeurs
                  <span aria-hidden className="inline-flex gap-1">
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-cyan inline-block" />
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-cyan inline-block" />
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-cyan inline-block" />
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
                      dropOffPoint={destDifficult ? destDropOff : null}
                      destinationLabel={destination}
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
                  {acceptedRide.dropOffPoint && acceptedRide.unpavedAccepted === false && (
                    <span className="block text-gold font-bold">
                      Arrêt au point de dépôt : {acceptedRide.dropOffPoint} (route non bitumée non prise)
                    </span>
                  )}
                  {acceptedRide.dropOffPoint && acceptedRide.unpavedAccepted === true && (
                    <span className="block text-slate-400">
                      Route non bitumée acceptée jusqu’à {acceptedRide.destination}
                    </span>
                  )}
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
                className="w-full text-sm font-bold text-cyan hover:underline"
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
                  className="inline-block bg-or text-night-900 font-black px-6 py-3.5 rounded-full shadow-md shadow-or/30 hover:bg-or-light transition-colors"
                >
                  Noter mon chauffeur
                </Link>
              )}
              <button
                type="button"
                onClick={resetToIdle}
                className="block w-full text-sm font-bold text-cyan hover:underline"
              >
                Nouvelle course
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bouton flottant « remonter la feuille » — visible uniquement en
          cran mini (phase idle) : il flotte juste au-dessus de la feuille
          repliée, à droite, pour rouvrir le formulaire sans viser la
          fine barre du bas. Or « Nuit dorée », chevron cyan. */}
      {isMini && (
        <button
          type="button"
          onClick={() => setSheetH(58)}
          className="absolute right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-or text-night-950 shadow-2xl shadow-black/50 hover:bg-or-light active:scale-90 transition-all"
          style={{ bottom: `calc(${sheetH}dvh + 14px)` }}
          aria-label="Remonter la feuille de demande"
        >
          <ChevronUp size={22} />
        </button>
      )}
    </div>
  );
}
