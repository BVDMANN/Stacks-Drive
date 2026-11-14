'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Map as MapIcon,
  MapPin,
  Navigation,
  Satellite as SatelliteIcon,
  ShieldCheck,
  Snowflake,
  User,
  Users,
  X,
} from 'lucide-react';
import type { HeaderUser } from '@/components/shared/Header';
import type { DriverProfile, Ride, RideProposal } from '@/types';
import type { AnonymousMapDriver } from '@/lib/db-types';
import type { SessionProfile } from '@/lib/supabase/server';
import { ProposalCard } from './ProposalCard';
import { DriverCard } from './DriverCard';
import { CancelRideDialog } from '@/components/rides/CancelRideDialog';
import type { CancelReasonCode } from '@/lib/cancellations';
import { NeighborhoodSelect } from '@/components/shared/NeighborhoodSelect';
import { OutOfZoneScreen } from './OutOfZoneScreen';
import { OUT_OF_ZONE_DISMISSED_KEY } from '@/lib/area-waitlist';
import { DriverHome } from '@/components/driver/DriverHome';
import { PassengerTutorial } from '@/components/tuto/PassengerTutorial';
import { ToastStack, useToastStack } from '@/components/shared/Toast';
import { detectProposalEvents, driverFirstName, type ProposalSnapshot } from '@/lib/proposal-events';
import { pollingIntervalMs, useRealtimeSubscription } from '@/lib/realtime';
import {
  LIBREVILLE_CENTER,
  NEIGHBORHOOD_COORDS,
  PAYMENT_LABELS,
  dropOffPointFor,
  isDifficultAccess,
  type Neighborhood,
  type PaymentMethod,
} from '@/lib/neighborhoods';
import { UNPAVED_ROAD_SUPPLEMENT, estimateFare, etaMinutes, type RideType, type VehiclePreference } from '@/lib/pricing';
import { DISPATCH_WIDENED_RADIUS_KM, DRIVERS_AROUND_RADIUS_KM, MAP_INITIAL_ZOOM, haversineKm, isInServiceArea, nearestNeighborhood } from '@/lib/geo';
import {
  geoErrorMessage,
  getUserPosition,
  reverseGeocodeCityCountry,
  reverseGeocodeNominatim,
  type GeoErrorKind,
} from '@/lib/geolocation';
import { formatFcfa } from '@/lib/commission';
import type { Poi } from '@/lib/pois';
import { PoiInfoCard, type PoiOrigin } from './PoiInfoCard';
import { cn } from '@/lib/utils';
import type { FocusPoint, TrafficMapMarker } from '@/components/map/LibrevilleMap';
import { fetchRoadRouteViaApi, type RoadRoute } from '@/lib/routing';
import { useRoadRoute } from '@/lib/use-road-route';
import type { TrafficReport } from '@/lib/traffic';

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

/** Valeur `datetime-local` en heure locale (l'input attend l'heure
 *  locale, pas l'UTC de `toISOString`). */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DRAFT_KEY = 'stacks-drive-draft-v2';

/** Raccourcis d'itinéraire (trajets les plus demandés) — SANS prix :
 *  la plateforme ne définit aucun tarif fixe (v2.11). Le passager
 *  voit une estimation indicative après avoir choisi son trajet ; le
 *  prix final se décide avec le chauffeur. */
const ROUTE_SHORTCUTS: { pickup: Neighborhood; destination: Neighborhood; label: string }[] = [
  { pickup: 'Aéroport Léon-Mba', destination: 'Centre-ville', label: 'Aéroport → Centre-ville' },
  { pickup: 'Nzeng-Ayong', destination: 'Centre-ville', label: 'Nzeng-Ayong → Centre-ville' },
  { pickup: 'Glass', destination: 'Nzeng-Ayong', label: 'Glass → Nzeng-Ayong' },
];

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
  paymentMethod: PaymentMethod;
  /** Prix proposé par le passager à la demande (v2.11, optionnel). */
  offeredPrice: number | null;
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

/** Petite barre de chargement du prix (v2.11) : shimmer or/cyan qui
 *  remplace le chiffre pendant le (re)calcul de l'estimation. */
function PriceSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-label="Calcul du prix…"
      role="status"
      className={cn('price-skeleton block rounded-lg', className ?? 'h-7 w-28')}
    />
  );
}

/** Écran d'accueil map-first « Libreville la nuit » : carte sombre plein
 *  écran + feuille de demande draggable en bas (départ géolocalisable,
 *  destination, type de course, estimation indicative, commander). */
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
  /** Chauffeurs en ligne pour la carte / le compteur / l'ETA —
   *  ANONYMES (v2.20) : position + type de véhicule uniquement. Nom,
   *  véhicule, plaque, note et téléphone ne sont pas sérialisés vers
   *  le passager avant une proposition. */
  realDrivers: AnonymousMapDriver[];
  demoDrivers: AnonymousMapDriver[];
}) {
  const router = useRouter();
  const [pickup, setPickup] = useState<Neighborhood | ''>('');
  const [destination, setDestination] = useState<Neighborhood | ''>('');
  const [rideType, setRideType] = useState<RideType>('groupe');
  // Classe Confort (v2.34) : Solo + clim garantie + chauffeurs 4,5★
  // et plus — même estimation et même modèle de prix que Solo.
  const [comfort, setComfort] = useState(false);
  // Chauffeur favori (v2.34) : la demande part en priorité au
  // chauffeur choisi (30 s d'exclusivité), puis aux autres.
  const [favorites, setFavorites] = useState<{ driverId: string; driverName: string | null }[]>([]);
  const [favoriteDriverId, setFavoriteDriverId] = useState<string | null>(null);
  useEffect(() => {
    if (!user || user.role !== 'passager') return;
    fetch('/api/favorites')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setFavorites(d.favorites ?? []);
      })
      .catch(() => undefined);
  }, [user]);
  const [vehiclePref, setVehiclePref] = useState<VehiclePreference>('tous');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('especes');
  // Prix proposé directement par le passager (v2.11, optionnel) : les
  // chauffeurs le voient et peuvent l'accepter ou contre-proposer. Vide
  // = le passager attend les propositions des chauffeurs.
  const [offeredPrice, setOfferedPrice] = useState('');
  // Route non bitumée (v2.6) : le passager demande la continuité
  // jusqu'à un quartier à accès difficile (+ supplément). Remis à zéro
  // à chaque changement de destination.
  const [unpavedRoad, setUnpavedRoad] = useState(false);
  // Course planifiée (v2.30) : date/heure future — la demande part
  // aux chauffeurs ~15 min avant l'heure prévue, sans nouveau cron.
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduledDone, setScheduledDone] = useState(false);
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
  // Lieu sélectionné sur la carte (v2.13) : sa mini-carte d'info.
  const [selectedPoi, setSelectedPoi] = useState<Poi | null>(null);
  // Fond de carte (v2.13) : Plan ou Satellite — choix mémorisé.
  const [basemap, setBasemap] = useState<'plan' | 'satellite'>('plan');
  useEffect(() => {
    try {
      if (window.localStorage.getItem('stacks-drive-basemap') === 'satellite') setBasemap('satellite');
    } catch {
      // Stockage indisponible : on reste en Plan.
    }
  }, []);
  function handleBasemap(value: 'plan' | 'satellite') {
    setBasemap(value);
    try {
      window.localStorage.setItem('stacks-drive-basemap', value);
    } catch {
      // Stockage indisponible : le choix ne sera pas mémorisé.
    }
  }

  // Notifications pop-up de négociation (v2.12) : le passager est
  // alerté quand une proposition arrive, quand le chauffeur change son
  // prix, et quand le prix est accepté (figé). Auto-fermeture ~6 s.
  const { toasts, push: pushToast, dismiss: dismissToast } = useToastStack();
  const proposalSnapshotRef = useRef<ProposalSnapshot>(new Map());

  // --- Géolocalisation du départ (« Me localiser ») ---
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [pickupExact, setPickupExact] = useState<{ lat: number; lng: number } | null>(null);
  // Écran hors zone (v2.32) : position GPS connue mais hors de la
  // zone de service — l'écran plein écran s'affiche (jamais pour une
  // position dans la zone, jamais sans GPS). Une fois fermé, il ne
  // réapparaît pas avant la fin de la session (`sessionStorage`) —
  // sauf « Me localiser », action explicite qui le remontre.
  const [outOfZone, setOutOfZone] = useState<{
    lat: number;
    lng: number;
    place: { city: string | null; country: string | null } | null;
  } | null>(null);
  const outOfZoneDismissedRef = useRef<boolean | null>(null);
  function isOutOfZoneDismissed(): boolean {
    if (outOfZoneDismissedRef.current !== null) return outOfZoneDismissedRef.current;
    let dismissed = false;
    try {
      dismissed = window.sessionStorage.getItem(OUT_OF_ZONE_DISMISSED_KEY) === '1';
    } catch {
      // Stockage indisponible : l'écran pourra s'afficher.
    }
    outOfZoneDismissedRef.current = dismissed;
    return dismissed;
  }
  function showOutOfZone(pos: { lat: number; lng: number }, opts?: { force?: boolean }) {
    if (!opts?.force && isOutOfZoneDismissed()) return;
    setOutOfZone({ lat: pos.lat, lng: pos.lng, place: null });
    // Ville / pays en best-effort (jamais de coordonnées transmises
    // ailleurs que dans ce navigateur) pour la liste « préviens-moi ».
    reverseGeocodeCityCountry(pos.lat, pos.lng).then((place) => {
      if (!place) return;
      setOutOfZone((cur) =>
        cur && cur.lat === pos.lat && cur.lng === pos.lng ? { ...cur, place } : cur
      );
    });
  }
  function dismissOutOfZone() {
    outOfZoneDismissedRef.current = true;
    try {
      window.sessionStorage.setItem(OUT_OF_ZONE_DISMISSED_KEY, '1');
    } catch {
      // Stockage indisponible : l'écran se fermera quand même.
    }
    setOutOfZone(null);
  }
  const [focusPoint, setFocusPoint] = useState<FocusPoint | null>(null);
  const focusNonceRef = useRef(0);
  // Départ choisi MANUELLEMENT dans la liste (v2.31) : tant qu'il est
  // faux, l'ancre (ouverture + cercle périmètre) est la position GPS ;
  // dès que l'utilisateur choisit un quartier, l'ancre devient ce
  // quartier — c'est de là que partira la course, et le rayon de
  // matching est autour du départ. « Me localiser » et l'ancrage
  // automatique remettent ce drapeau à faux.
  const manualPickupRef = useRef(false);

  // --- Feuille draggable ---
  // Arrivée (v2.14, standard « Google Maps ») : la feuille démarre au
  // cran mini (15 dvh, poignée + titre seulement) pour ne pas masquer
  // la carte — un tap sur la barre l'ouvre en grand (58 dvh).
  const [sheetH, setSheetH] = useState(SHEET_SNAPS[0]);
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

  // Ancrage d'ouverture (v2.31 — « carte zonée quartier ») : la carte
  // s'ouvre sur TA zone, zoom quartier (`MAP_INITIAL_ZOOM` = 14),
  // jamais sur toute la ville. Ordre de priorité :
  //   (a) la POSITION GPS RÉELLE si elle est dans la zone de service
  //       (Grand Libreville, `isInServiceArea`) — le départ se cale
  //       alors sur le quartier le plus proche de cette position ;
  //   (b) sinon le quartier de départ restauré depuis le brouillon
  //       sauvegardé (`DRAFT_KEY`, après une connexion) ;
  //   (c) sinon le Centre-ville — la carte est déjà centrée dessus
  //       au zoom quartier, rien à faire.
  // Géolocalisation SILENCIEUSE au chargement (délai 5 s) : refus,
  // hors délai ou hors zone → repli immédiat sur (b) puis (c), sans
  // bloquer l'ouverture et sans message d'erreur (l'utilisateur n'a
  // rien demandé). La position ne quitte jamais le navigateur
  // (`lib/geolocation.ts`) : elle sert juste à placer le départ et
  // l'ancre. Si l'utilisateur choisit un départ manuellement avant
  // que la géolocalisation ne réponde, son choix gagne : on ne lui
  // écrase pas le départ, on place juste le marqueur « Vous êtes ici ».
  useEffect(() => {
    const d = readDraft();
    if (d) {
      setPickup(d.pickup);
      setDestination(d.destination);
      setRideType(d.rideType);
      setVehiclePref(d.vehiclePreference);
      setPaymentMethod(d.paymentMethod);
      setOfferedPrice(d.offeredPrice !== null && d.offeredPrice !== undefined ? String(d.offeredPrice) : '');
      window.localStorage.removeItem(DRAFT_KEY);
    }
    const focusOn = (lat: number, lng: number) => {
      focusNonceRef.current += 1;
      setFocusPoint({ lat, lng, zoom: MAP_INITIAL_ZOOM, nonce: focusNonceRef.current });
    };
    let cancelled = false;
    getUserPosition(5000)
      .then((pos) => {
        if (cancelled) return;
        if (!isInServiceArea(pos.lat, pos.lng)) {
          // Hors zone : repli (b) puis (c), sans message d'erreur
          // dans la feuille — l'écran hors zone (v2.32) prend le
          // relais, sans jamais bloquer l'appli.
          showOutOfZone(pos);
          if (d && d.pickup) {
            const c = NEIGHBORHOOD_COORDS[d.pickup as Neighborhood];
            focusOn(c.lat, c.lng);
          }
          return;
        }
        const nearest = nearestNeighborhood(pos.lat, pos.lng);
        setUserLocation({ lat: pos.lat, lng: pos.lng, label: nearest.neighborhood });
        if (!manualPickupRef.current) {
          setPickup(nearest.neighborhood);
          setPickupExact({ lat: pos.lat, lng: pos.lng });
          focusOn(pos.lat, pos.lng);
        }
        reverseGeocodeNominatim(pos.lat, pos.lng).then((label) => {
          if (!cancelled && label) setGeoLabel(label);
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Permission refusée / hors délai / indisponible : repli (b)
        // puis (c), silencieusement — aucun message d'erreur.
        if (d && d.pickup) {
          const c = NEIGHBORHOOD_COORDS[d.pickup as Neighborhood];
          focusOn(c.lat, c.lng);
        }
      });
    return () => {
      cancelled = true;
    };
    // Une seule fois, au chargement — l'ancre ne se recalcule pas
    // quand le départ change (c'est le cercle périmètre qui suit).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bienvenue passager (v2.24) : une fois par session navigateur —
  // couvre l'inscription sans confirmation e-mail (le flux avec
  // confirmation est couvert par /auth/callback). L'envoi est
  // dédupliqué en base, rappeler la route ne renvoie jamais un
  // deuxième e-mail.
  useEffect(() => {
    if (!user || user.role !== 'passager') return;
    try {
      if (window.sessionStorage.getItem('stacks-drive-welcome-v1')) return;
      window.sessionStorage.setItem('stacks-drive-welcome-v1', '1');
    } catch {
      return;
    }
    fetch('/api/welcome', { method: 'POST' }).catch(() => undefined);
  }, [user]);

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

  // Barre de chargement du prix (v2.11) : quand le départ, la
  // destination, le type ou le véhicule change, le prix « se calcule »
  // 300 ms — une petite barre shimmer remplace le chiffre, puis le
  // prix apparaît avec sa décomposition. Le calcul lui-même est
  // instantané (local) ; le délai rend le changement lisible et
  // évite le chiffre qui saute à chaque frappe.
  const [estimating, setEstimating] = useState(false);
  useEffect(() => {
    if (!validTrip) {
      setEstimating(false);
      return;
    }
    setEstimating(true);
    const t = window.setTimeout(() => setEstimating(false), 300);
    return () => window.clearTimeout(t);
  }, [pickup, destination, rideType, vehiclePref, unpavedRoad, validTrip]);

  // Signalements trafic actifs (v2.27) : marqueurs sur la carte,
  // rafraîchis toutes les 60 s.
  const [trafficReports, setTrafficReports] = useState<TrafficMapMarker[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/traffic');
        const data = await res.json().catch(() => null);
        if (!cancelled && data?.ok) {
          setTrafficReports(
            ((data.reports ?? []) as TrafficReport[]).map((r) => ({
              id: r.id,
              type: r.type,
              lat: r.lat,
              lng: r.lng,
              confirmed: r.confirmed,
              expiresAt: r.expiresAt,
            }))
          );
        }
      } catch {
        // Carte sans trafic : prochain tour.
      }
    };
    load();
    const t = window.setInterval(load, 60000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  // Tous les chauffeurs en ligne : réels + démos. La carte et le compteur
  // « chauffeurs autour de toi » ne les montrent PAS tous (v2.18) : seuls
  // ceux dans le périmètre sont visibles — voir `driversInPerimeter`.
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

  // Itinéraire routier (v2.27) : géométrie OSRM + durée/distance
  // routières pour le trajet choisi — affichées dans la feuille et
  // sur la carte (la polyligne droite est remplacée). Le PRIX ne
  // change pas : l'estimation reste calculée sur la distance à vol
  // d'oiseau (`estimateFare`) — seule la durée affichée devient la
  // durée routière réelle. OSRM indisponible → on garde la ligne
  // droite et la durée estimée (repli silencieux).
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  useEffect(() => {
    if (!pickupCoords || !destCoords || !validTrip) {
      setRoadRoute(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      fetchRoadRouteViaApi(pickupCoords, destCoords).then((r) => {
        if (!cancelled) setRoadRoute(r);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [pickupCoords, destCoords, validTrip]);

  // Périmètre « chauffeurs autour de toi » (v2.18) : seuls les chauffeurs
  // en ligne situés dans un rayon de DRIVERS_AROUND_RADIUS_KM autour du
  // départ (position exacte si géolocalisé, sinon centre du quartier)
  // sont visibles sur la carte passager et comptés — Moto comprise.
  // Sans départ choisi, pas de centre : tous les chauffeurs sont
  // affichés (le compteur affiche alors le total).
  const driversInPerimeter = useMemo(() => {
    if (!pickupCoords) return allDrivers;
    return allDrivers.filter(
      (d) =>
        d.lat !== null &&
        d.lng !== null &&
        haversineKm(pickupCoords.lat, pickupCoords.lng, d.lat, d.lng) <= DRIVERS_AROUND_RADIUS_KM
    );
  }, [pickupCoords, allDrivers]);

  // Point de départ de l'estimation d'un lieu (v2.13) : ta position
  // si tu es géolocalisé, sinon ton départ sélectionné, sinon le
  // centre de Libreville.
  const poiOrigin: PoiOrigin = useMemo(() => {
    if (userLocation)
      return { lat: userLocation.lat, lng: userLocation.lng, label: userLocation.label, kind: 'user' as const };
    if (pickupCoords && pickup)
      return { lat: pickupCoords.lat, lng: pickupCoords.lng, label: pickup, kind: 'pickup' as const };
    return { lat: LIBREVILLE_CENTER.lat, lng: LIBREVILLE_CENTER.lng, label: 'Centre-ville', kind: 'center' as const };
  }, [userLocation, pickupCoords, pickup]);

  // Ancre du cercle périmètre 5 km (v2.31) : la position GPS par
  // défaut ; le quartier de départ dès que l'utilisateur le choisit
  // manuellement (c'est de là que partira la course) ; le
  // Centre-ville s'il n'y a ni l'un ni l'autre. Le cercle suit donc
  // l'ancre — GPS d'abord, départ manuel ensuite. (Mode chauffeur :
  // pas de cercle — le `null` est appliqué au passage de la prop,
  // `isChauffeurMode` étant déclaré plus bas.)
  const perimeterCenter = useMemo(() => {
    if (manualPickupRef.current && pickupCoords && pickup)
      return { ...pickupCoords, label: pickup };
    if (userLocation) return { lat: userLocation.lat, lng: userLocation.lng, label: userLocation.label };
    if (pickupCoords && pickup) return { ...pickupCoords, label: pickup };
    return { lat: LIBREVILLE_CENTER.lat, lng: LIBREVILLE_CENTER.lng, label: 'Centre-ville' };
    // `manualPickupRef` est un drapeau, pas un état : le mémo se
    // recalcule quand `pickup` / `userLocation` change — c'est le
    // changement de départ qui fait bouger l'ancre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupCoords, pickup, userLocation]);

  // ETA du chauffeur le plus proche du point de départ — parmi les
  // chauffeurs éligibles ET dans le périmètre (un chauffeur hors
  // périmètre ne peut pas être mis en relation, son ETA ne compte pas).
  const nearestEta = useMemo(() => {
    if (!pickupCoords || matchableDrivers.length === 0) return null;
    let best: number | null = null;
    matchableDrivers.forEach((d) => {
      if (d.lat === null || d.lng === null) return;
      if (!driversInPerimeter.includes(d)) return;
      const dist = haversineKm(pickupCoords.lat, pickupCoords.lng, d.lat, d.lng);
      const eta = etaMinutes(dist);
      if (best === null || eta < best) best = eta;
    });
    return best;
  }, [pickupCoords, matchableDrivers, driversInPerimeter]);

  // Compteur « chauffeurs autour de toi » : le nombre de chauffeurs en
  // ligne dans le périmètre autour du départ (v2.18) — il se recalcule
  // quand le départ change. Sans départ, le total des chauffeurs.
  const driversNearPickup = driversInPerimeter.length;

  // Horloge (comptes à rebours des propositions + élargissement).
  useEffect(() => {
    if (phase !== 'searching' && phase !== 'proposals') return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // Phase courante en ref : les rechargements déclenchés par Realtime
  // (hors effet) ne doivent rien faire une fois la phase passée.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Rechargement des propositions (v2.12 + v2.24) : notifications
  // pop-up de négociation à chaque changement détecté par rapport au
  // sondage précédent — nouvelle proposition, nouveau prix du
  // chauffeur, prix accepté. Quand le chauffeur accepte la
  // contre-proposition du passager, la course est confirmée : on
  // charge la course et on passe en phase « confirmed » (sinon
  // l'écran resterait sur « Recherche »). Déclenché par Realtime
  // (instantané) ou par le sondage de repli (5 s).
  const pollProposals = useCallback(async () => {
    if (!rideId) return;
    if (phaseRef.current !== 'searching' && phaseRef.current !== 'proposals') return;
    try {
      const res = await fetch(`/api/proposals?rideId=${rideId}`);
      const data = await res.json();
      if (!data?.ok) return;
      const list = (data.proposals ?? []) as RideProposal[];
      setProposals(list);
      const { events, snapshot } = detectProposalEvents(proposalSnapshotRef.current, list);
      proposalSnapshotRef.current = snapshot;
      for (const ev of events) {
        if (ev.kind === 'new') {
          pushToast({
            id: `new-${ev.proposal.id}`,
            title: `Nouvelle proposition : ${formatFcfa(ev.proposal.proposedPrice)}`,
            message: `${driverFirstName(ev.proposal)} propose ce prix pour ta course.`,
            variant: 'offer',
          });
        } else if (ev.kind === 'repriced') {
          pushToast({
            id: `repriced-${ev.proposal.id}-${ev.proposal.proposedPrice}`,
            title: `Nouveau prix proposé : ${formatFcfa(ev.proposal.proposedPrice)}`,
            message: `${driverFirstName(ev.proposal)} a modifié son prix — à toi de choisir.`,
            variant: 'info',
          });
        } else if (ev.kind === 'accepted') {
          const price = ev.proposal.counterPrice ?? ev.proposal.proposedPrice;
          pushToast({
            id: `accepted-${ev.proposal.id}`,
            title: `Prix accepté : ${formatFcfa(price)} — prix figé`,
            message: `C'est le prix de ta course, il ne bougera plus.`,
            variant: 'success',
          });
          const rideRes = await fetch(`/api/rides/${rideId}`);
          const rideData = await rideRes.json().catch(() => null);
          if (rideData?.ok) {
            setAcceptedRide(rideData.ride as Ride);
            setAcceptedDriver((rideData.driver as DriverProfile | null) ?? null);
            setPhase('confirmed');
          }
        }
      }
      if (list.some((p) => p.status === 'pending')) setPhase('proposals');
    } catch {
      // Réseau instable : on réessaie au prochain tour.
    }
  }, [rideId, pushToast]);

  // Temps réel (v2.24) : les propositions arrivent instantanément ;
  // le sondage 5 s ne reste qu'en repli, plus un rafraîchissement
  // de sécurité toutes les 60 s.
  const { live: proposalsLive } = useRealtimeSubscription({
    table: 'ride_proposals',
    filter: rideId ? `ride_id=eq.${rideId}` : undefined,
    enabled: !!rideId && (phase === 'searching' || phase === 'proposals'),
    onChange: pollProposals,
  });
  useEffect(() => {
    if (!rideId || (phase !== 'searching' && phase !== 'proposals')) return;
    pollProposals();
    const t = window.setInterval(pollProposals, pollingIntervalMs(proposalsLive, 5000));
    return () => window.clearInterval(t);
  }, [rideId, phase, proposalsLive, pollProposals]);

  // Suivi de la course confirmée : rechargement déclenché par Realtime
  // (changement de statut) ou par le sondage de repli (10 s).
  const pollRide = useCallback(async () => {
    if (!rideId) return;
    if (phaseRef.current !== 'confirmed') return;
    try {
      const res = await fetch(`/api/rides/${rideId}`);
      const data = await res.json();
      if (!data?.ok) return;
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
  }, [rideId]);
  const { live: rideLive } = useRealtimeSubscription({
    table: 'rides',
    filter: rideId ? `id=eq.${rideId}` : undefined,
    enabled: !!rideId && phase === 'confirmed',
    onChange: pollRide,
  });
  useEffect(() => {
    if (!rideId || phase !== 'confirmed') return;
    pollRide();
    const t = window.setInterval(pollRide, pollingIntervalMs(rideLive, 10000));
    return () => window.clearInterval(t);
  }, [rideId, phase, rideLive, pollRide]);

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

  // Marqueurs de la carte : SEULS les chauffeurs en ligne dans le
  // périmètre autour du départ (v2.18) — hors périmètre, masqués.
  // La Moto reste visible en Groupe — sa bulle précise « Solo uniquement ».
  // Confidentialité (v2.20) : les marqueurs sont ANONYMES avant le
  // matching — ni nom, ni véhicule, ni note, ni plaque. Seul le
  // chauffeur assigné (course acceptée) retrouve son identité sur la
  // carte, depuis `acceptedDriver` (chargé via /api/rides/[id] après
  // acceptation) — jamais depuis la liste des chauffeurs en ligne.
  const mapDrivers = useMemo(
    () =>
      driversInPerimeter
        .filter((d) => d.lat !== null && d.lng !== null)
        .map((d) => {
          const assigned =
            acceptedDriver && acceptedDriver.id === d.id ? acceptedDriver : null;
          return {
            id: d.id,
            name: assigned?.name ?? '',
            lat: d.lat as number,
            lng: d.lng as number,
            vehicleLabel: assigned?.vehicleLabel ?? '',
            vehicleType: d.vehicleType ?? '',
            rating: assigned?.rating ?? null,
            isDemo: d.isDemo,
          };
        }),
    [driversInPerimeter, acceptedDriver]
  );

  function saveDraft() {
    const draft: Draft = {
      pickup,
      destination,
      rideType,
      vehiclePreference: vehiclePref,
      paymentMethod,
      offeredPrice: offeredPrice.trim() === '' ? null : Number(offeredPrice),
    };
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Stockage indisponible : l'utilisateur ressaisira son trajet.
    }
  }

  // --- « Me localiser » : GPS → quartier le plus proche → départ. ---
  // Test d'appartenance à la zone de service (v2.31,
  // `isInServiceArea` / `SERVICE_BOUNDS`) : l'ancien test « > 60 km
  // du quartier le plus proche » plaçait encore quelqu'un à 20–50 km
  // de Libreville et faisait voler la carte jusqu'à lui. Hors zone,
  // la carte RESTE sur Libreville et le message est clair.
  async function handleLocate() {
    if (locating) return;
    setLocating(true);
    setGeoError(null);
    try {
      const pos = await getUserPosition();
      if (!isInServiceArea(pos.lat, pos.lng)) {
        const nearest = nearestNeighborhood(pos.lat, pos.lng);
        // Action explicite : l'écran hors zone (v2.32) se remontre
        // même s'il a déjà été fermé dans cette session.
        showOutOfZone(pos, { force: true });
        setGeoError(
          `Tu es hors de la zone de service — le service est à Libreville pour l'instant (~${Math.round(nearest.distanceKm)} km du quartier le plus proche). Choisis ton quartier dans la liste.`
        );
        return;
      }
      const nearest = nearestNeighborhood(pos.lat, pos.lng);
      manualPickupRef.current = false;
      setPickup(nearest.neighborhood);
      setPickupExact({ lat: pos.lat, lng: pos.lng });
      setUserLocation({ lat: pos.lat, lng: pos.lng, label: nearest.neighborhood });
      setGeoLabel(null);
      focusNonceRef.current += 1;
      setFocusPoint({ lat: pos.lat, lng: pos.lng, zoom: MAP_INITIAL_ZOOM, nonce: focusNonceRef.current });
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

  // Choix manuel du départ : on revient au centre du quartier — et
  // l'ancre (ouverture + cercle périmètre) devient ce quartier (v2.31).
  function handlePickupChange(value: Neighborhood | '') {
    setPickup(value);
    setPickupExact(null);
    setGeoLabel(null);
    if (value !== '') manualPickupRef.current = true;
  }

  // Choix de la destination : la demande de route non bitumée repart
  // de zéro (elle ne vaut que pour le quartier choisi).
  function handleDestinationChange(value: Neighborhood | '') {
    setDestination(value);
    setUnpavedRoad(false);
  }

  // « Y aller » (v2.13) : le lieu devient la destination (son
  // quartier le plus proche), la carte se recentre dessus et la
  // feuille s'ouvre pour commander.
  function goToPoi(poi: Poi) {
    handleDestinationChange(poi.neighborhood);
    setSelectedPoi(null);
    focusNonceRef.current += 1;
    setFocusPoint({ lat: poi.lat, lng: poi.lng, zoom: 14, nonce: focusNonceRef.current });
    setSheetH(58);
  }

  // Bouton « Recentrer » sur la carte : sur moi si localisé, sinon
  // Libreville — dans les deux cas au zoom quartier (v2.31).
  function handleRecenter() {
    focusNonceRef.current += 1;
    if (userLocation) {
      setFocusPoint({ lat: userLocation.lat, lng: userLocation.lng, zoom: MAP_INITIAL_ZOOM, nonce: focusNonceRef.current });
    } else {
      setFocusPoint({ lat: LIBREVILLE_CENTER.lat, lng: LIBREVILLE_CENTER.lng, zoom: MAP_INITIAL_ZOOM, nonce: focusNonceRef.current });
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
    setScheduledDone(false);
    setSelectedPoi(null);
    if (!validTrip || !estimate) return;
    // Prix proposé par le passager (v2.11, optionnel) : entre 400 et
    // 50 000 FCFA, comme les bornes du garde-fou serveur.
    const offered =
      offeredPrice.trim() === '' ? null : Math.round(Number(offeredPrice));
    if (offered !== null && (!Number.isFinite(offered) || offered < 400 || offered > 50000)) {
      setError('Ton prix proposé doit être entre 400 et 50 000 FCFA.');
      return;
    }
    // Course planifiée (v2.30) : au moins 30 min dans le futur, au
    // plus 7 jours — le serveur re-valide les mêmes bornes.
    let scheduledIso: string | null = null;
    if (scheduleEnabled) {
      const d = new Date(scheduledAt);
      if (Number.isNaN(d.getTime())) {
        setError('Choisis une date et une heure pour ta course planifiée.');
        return;
      }
      if (d.getTime() < Date.now() + 30 * 60 * 1000) {
        setError('Choisis une heure au moins 30 minutes dans le futur.');
        return;
      }
      if (d.getTime() > Date.now() + 7 * 24 * 60 * 60 * 1000) {
        setError('On ne planifie pas plus de 7 jours à l’avance.');
        return;
      }
      scheduledIso = d.toISOString();
    }
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
        comfort: rideType === 'solo' ? comfort : false,
        favoriteDriverId,
        vehiclePreference: vehiclePref,
        seats: 1, // Groupe : 1 place. Solo : véhicule entier — pas de nombre de passagers.
        paymentMethod,
        unpavedRoad,
        offeredPrice: offered,
        scheduledAt: scheduledIso,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Demande impossible pour le moment. Réessaie.');
      return;
    }
    // Course planifiée : pas de recherche immédiate — confirmation
    // + renvoi vers « Mes courses » (annulable avant l'envoi).
    if (scheduledIso) {
      setScheduledDone(true);
      setScheduleEnabled(false);
      setScheduledAt('');
      return;
    }
    setRideId(data.rideId as string);
    setProposals([]);
    proposalSnapshotRef.current = new Map();
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

  /** Contre-proposition du passager (v2.11) : propose ton prix au
   *  chauffeur — il peut l'accepter ou proposer un autre prix. Renvoie
   *  true si le serveur l'a enregistrée (la carte affiche alors le
   *  montant envoyé). */
  async function contreProposer(proposalId: string, price: number): Promise<boolean> {
    const res = await fetch(`/api/proposals/${proposalId}/counter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ counterPrice: price }),
    }).catch(() => null);
    if (!res?.ok) return false;
    const data = await res.json().catch(() => null);
    setProposals((prev) =>
      prev.map((p) =>
        p.id === proposalId
          ? { ...p, counterPrice: price, expiresAt: (data?.expiresAt as string) ?? p.expiresAt }
          : p
      )
    );
    return true;
  }

  /** Annulation (v2.23) : motif obligatoire — la modale s'ouvre
   *  d'abord, la requête part seulement après confirmation. */
  const [cancelOpen, setCancelOpen] = useState(false);

  async function annulerCourse() {
    setCancelOpen(true);
  }

  async function confirmerAnnulation(
    reasonCode: CancelReasonCode,
    detail: string | null
  ): Promise<boolean> {
    if (!rideId) return false;
    setBusy(true);
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', reasonCode, reason: detail }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? 'Annulation impossible pour le moment. Réessaie.');
      return false;
    }
    resetToIdle();
    return true;
  }

  function resetToIdle() {
    setPhase('idle');
    setRideId(null);
    setProposals([]);
    proposalSnapshotRef.current = new Map();
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
  // ETA routière du chauffeur accepté (P0b) : durée OSRM chauffeur →
  // pickup quand elle est là, sinon l'ETA à vol d'oiseau ci-dessus.
  // La position du profil ne bouge pas ici : pas de rafraîchissement
  // — le suivi en direct prend le relais sur la page de la course.
  const acceptedDriverPos =
    acceptedDriver && acceptedDriver.lat !== null && acceptedDriver.lng !== null
      ? { lat: acceptedDriver.lat, lng: acceptedDriver.lng }
      : null;
  const { route: acceptedRoadRoute } = useRoadRoute(acceptedDriverPos, pickupCoords, {
    enabled: !!acceptedDriverPos && !!pickupCoords,
  });
  const etaAcceptedRoad = acceptedRoadRoute?.durationMin ?? etaAccepted;

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
        basemap={basemap}
        onPoiClick={
          isChauffeurMode
            ? undefined
            : (poi) => {
                setSelectedPoi(poi);
                // La mini-carte d'info doit être entièrement lisible :
                // si la feuille est dépliée, elle la masquerait — on
                // revient au cran mini (en phase idle seulement : pendant
                // une recherche ou une course, la feuille reste en place).
                if (phase === 'idle') setSheetH(SHEET_SNAPS[0]);
              }
        }
        onMapClick={() => setSelectedPoi(null)}
        selectedPoi={selectedPoi}
        routeGeometry={
          roadRoute && roadRoute.geometry.length >= 2 ? roadRoute.geometry : null
        }
        trafficReports={trafficReports}
        perimeterCenter={isChauffeurMode ? null : perimeterCenter}
      />

      {/* Notifications pop-up de négociation (v2.12) : propositions,
          nouveaux prix, prix accepté — en haut de l'écran, au-dessus
          de la carte et de la feuille. */}
      <ToastStack toasts={toasts} onClose={dismissToast} />

      {/* Écran hors zone (v2.32) : position GPS connue, hors zone —
          plein écran non bloquant, fermable, sans réapparition dans
          la session. Jamais affiché dans la zone ni sans GPS. */}
      {outOfZone && (
        <OutOfZoneScreen place={outOfZone.place} onClose={dismissOutOfZone} />
      )}

      {/* Mini-carte d'info d'un lieu (v2.13) : nom, catégorie,
          distance, estimation Solo/Groupe, bouton « Y aller ». */}
      {selectedPoi && !isChauffeurMode && (
        <PoiInfoCard
          poi={selectedPoi}
          origin={poiOrigin}
          onClose={() => setSelectedPoi(null)}
          onGoTo={goToPoi}
        />
      )}

      {/* Compteur de chauffeurs autour — passagers seulement. En idle il
          s'efface quand la feuille se déplie ; pendant la recherche et
          les propositions, le radar reste visible : « X chauffeurs
          détectés autour de toi » (v2.11). */}
      {phase !== 'confirmed' && phase !== 'done' && !isChauffeurMode && (
        <div
          className={`absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none transition-all duration-500 ${
            phase === 'idle' && sheetExpanded ? 'opacity-0 -translate-y-2' : 'opacity-100'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/10 shadow-xl shadow-black/40 rounded-full px-4 py-2 text-xs font-black text-slate-100">
            <span className="w-2 h-2 rounded-full bg-cyan animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
            {phase === 'idle'
              ? `${driversNearPickup} chauffeur${driversNearPickup > 1 ? 's' : ''} autour de toi · dans un rayon de ${DRIVERS_AROUND_RADIUS_KM} km`
              : `Radar · ${driversNearPickup} chauffeur${driversNearPickup > 1 ? 's' : ''} détecté${driversNearPickup > 1 ? 's' : ''} autour de toi · dans un rayon de ${DRIVERS_AROUND_RADIUS_KM} km`}
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

      {/* Sélecteur de fond de carte (v2.13) : Plan ou Satellite —
          sous le bouton Recentrer, même style, il s'efface aussi
          quand la feuille se déplie. */}
      {!isChauffeurMode && (
        <div
          className={`absolute top-14 left-3 z-10 inline-flex rounded-full bg-night-900/90 backdrop-blur border border-white/15 shadow-xl shadow-black/40 p-1 transition-all duration-500 ${
            sheetExpanded ? 'opacity-0 -translate-y-2 pointer-events-none' : 'opacity-100'
          }`}
          role="group"
          aria-label="Fond de carte"
        >
          {(
            [
              { value: 'plan', label: 'Plan', icon: MapIcon },
              { value: 'satellite', label: 'Satellite', icon: SatelliteIcon },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => handleBasemap(m.value)}
              aria-pressed={basemap === m.value}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black transition-all active:scale-95',
                basemap === m.value ? 'bg-gold text-night-900' : 'text-slate-300 hover:text-white'
              )}
            >
              <m.icon size={13} /> {m.label}
            </button>
          ))}
        </div>
      )}

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

              {/* Départ / Destination — listes triées par ordre
                  alphabétique, avec recherche par nom (v2.22). */}
              <div className="space-y-2">
                <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-1.5">
                  <NeighborhoodSelect
                    id="depart"
                    label="Départ"
                    value={pickup}
                    onChange={handlePickupChange}
                    placeholder="Ton point de départ…"
                    icon={<Navigation size={18} className="text-cyan shrink-0" />}
                    action={
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
                    }
                  />
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
                <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-1.5">
                  <NeighborhoodSelect
                    id="destination"
                    label="Destination"
                    value={destination}
                    onChange={handleDestinationChange}
                    placeholder="Où vas-tu ?"
                    icon={<MapPin size={18} className="text-gold shrink-0" />}
                  />
                </div>
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

              {/* Lieux favoris (v2.30) : Maison / Travail enregistrés
                  dans « Mon compte » — 1 tap pour définir le départ
                  ou la destination. */}
              {profile &&
                ((profile.home_neighborhood ?? null) !== null ||
                  (profile.work_neighborhood ?? null) !== null) && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Mes lieux
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          {
                            key: 'home',
                            label: 'Maison',
                            icon: '🏠',
                            neighborhood: profile.home_neighborhood,
                            detail: profile.home_detail,
                          },
                          {
                            key: 'work',
                            label: 'Travail',
                            icon: '💼',
                            neighborhood: profile.work_neighborhood,
                            detail: profile.work_detail,
                          },
                        ] as const
                      )
                        .filter((f) => f.neighborhood)
                        .map((f) => (
                          <span
                            key={f.key}
                            className="inline-flex items-center gap-1 bg-white/5 border border-white/10 rounded-full pl-3 pr-1 py-1 text-xs font-bold text-white"
                            title={`${f.label} : ${f.neighborhood}${f.detail ? ` — ${f.detail}` : ''}`}
                          >
                            {f.icon} {f.label} · {f.neighborhood}
                            <button
                              type="button"
                              onClick={() => {
                                handlePickupChange(f.neighborhood as Neighborhood);
                              }}
                              className="ml-1 px-2 py-1 rounded-full bg-cyan/20 text-cyan hover:bg-cyan/30 transition-colors"
                            >
                              Départ
                            </button>
                            <button
                              type="button"
                              onClick={() => setDestination(f.neighborhood as Neighborhood)}
                              className="px-2 py-1 rounded-full bg-gold/20 text-gold hover:bg-gold/30 transition-colors"
                            >
                              Destination
                            </button>
                          </span>
                        ))}
                    </div>
                  </div>
                )}

              {/* Trajets fréquents — raccourcis d'itinéraire, SANS prix :
                  la plateforme ne définit aucun tarif fixe (v2.11). */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <ShieldCheck size={13} className="text-cyan" /> Trajets fréquents — estimation indicative, prix figé une fois accepté
                </p>
                <div className="flex flex-wrap gap-2">
                  {ROUTE_SHORTCUTS.map((f) => (
                    <button
                      key={f.label}
                      type="button"
                      onClick={() => {
                        handlePickupChange(f.pickup);
                        setDestination(f.destination);
                        setUnpavedRoad(false);
                        setRideType('groupe');
                      }}
                      className="text-xs font-bold bg-cyan/10 border border-cyan/30 text-cyan px-3 py-1.5 rounded-full hover:bg-cyan/20 active:scale-95 transition-all"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* Classe Confort (v2.34) : Solo uniquement — clim
                    garantie, chauffeurs 4,5★ et plus. Même estimation
                    que Solo : aucune différence de prix. */}
                {rideType === 'solo' && (
                  <button
                    type="button"
                    onClick={() => setComfort((c) => !c)}
                    aria-pressed={comfort}
                    className={cn(
                      'w-full text-left rounded-3xl border-2 p-3.5 transition-all active:scale-[0.98]',
                      comfort
                        ? 'border-cyan bg-cyan/10 shadow-lg shadow-cyan/20'
                        : 'border-white/10 bg-white/5 hover:border-white/25'
                    )}
                  >
                    <span className="flex items-center gap-1.5 font-black text-white">
                      <Snowflake size={17} /> Confort
                      <span className="ml-auto font-black text-base text-white">
                        {estimating ? (
                          <PriceSkeleton />
                        ) : (
                          <AnimatedPrice
                            value={validTrip ? estimateSolo?.price ?? null : null}
                            suffix={<span className="text-xs font-bold text-slate-400"> la course</span>}
                          />
                        )}
                      </span>
                    </span>
                    <span className="block text-xs text-slate-400 mt-1 leading-snug">
                      Climatisation garantie · Chauffeurs notés 4,5★ et plus · Même prix que Solo.
                    </span>
                  </button>
                )}

                {/* Chauffeur favori (v2.34) : reprendre avec un
                    chauffeur déjà rencontré — la demande lui part en
                    priorité pendant 30 s, puis aux autres chauffeurs. */}
                {favorites.length > 0 && (
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Chauffeur favori — optionnel
                    </span>
                    <select
                      value={favoriteDriverId ?? ''}
                      onChange={(e) => setFavoriteDriverId(e.target.value || null)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white focus:border-cyan focus:outline-none"
                      aria-label="Chauffeur favori"
                    >
                      <option value="">Aucun — envoyer à tous les chauffeurs</option>
                      {favorites.map((f) => (
                        <option key={f.driverId} value={f.driverId}>
                          Reprendre avec {f.driverName ?? 'ce chauffeur'} (priorité 30 s)
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              {/* Types de course — les montants affichés sont des
                  estimations indicatives, pas des prix (v2.11). */}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Type de course · estimation indicative
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setRideType('groupe');
                      setComfort(false);
                    }}
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
                      Partagée, comme le taxi — 1 place, prix par passager, arrêts dans l’ordre.
                    </span>
                    <span className="block font-black text-lg text-white mt-2">
                      {estimating ? (
                        <PriceSkeleton />
                      ) : (
                        <AnimatedPrice
                          value={validTrip ? estimateGroupe?.price ?? null : null}
                          suffix={<span className="text-xs font-bold text-slate-400"> / passager</span>}
                        />
                      )}
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
                      Privée et directe, sans arrêt — le véhicule est entièrement à toi.
                    </span>
                    <span className="block font-black text-lg text-white mt-2">
                      {estimating ? (
                        <PriceSkeleton />
                      ) : (
                        <AnimatedPrice
                          value={validTrip ? estimateSolo?.price ?? null : null}
                          suffix={<span className="text-xs font-bold text-slate-400"> la course</span>}
                        />
                      )}
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

              {/* Ton prix proposé (v2.11, optionnel) : propose directement
                  ton prix — les chauffeurs le voient et peuvent
                  l'accepter ou contre-proposer. Vide = tu attends leurs
                  propositions. */}
              <div className="space-y-1.5">
                <label htmlFor="offered-price" className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Ton prix proposé — optionnel (FCFA)
                </label>
                <input
                  id="offered-price"
                  type="number"
                  min={400}
                  max={50000}
                  step={50}
                  inputMode="numeric"
                  placeholder="Ex : 1 500 — laisse vide pour attendre les propositions"
                  value={offeredPrice}
                  onChange={(e) => setOfferedPrice(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white placeholder:text-slate-500 placeholder:font-normal focus:border-cyan focus:outline-none"
                />
                <p className="text-xs text-slate-500">
                  Le prix final se décide avec ton chauffeur — une fois accepté, il est figé, jamais de surge.
                </p>
              </div>

              {/* Estimation + Commander */}
              {estimate && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-center justify-between gap-3 rise-in">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Estimation — indicative
                    </p>
                    <p className="text-2xl font-black text-white leading-tight">
                      {/* Règle 1 (v2.17) : le grand prix aussi attend son
                          squelette pendant le recalcul — pas seulement
                          les deux cartes Groupe / Solo au-dessus. */}
                      {estimating ? (
                        <PriceSkeleton className="h-8 w-36" />
                      ) : (
                        <AnimatedPrice
                          value={estimate.price}
                          suffix={
                            rideType === 'groupe' ? (
                              <span className="text-sm font-bold text-slate-400"> / passager</span>
                            ) : undefined
                          }
                        />
                      )}
                    </p>
                    <p className="text-xs text-slate-400">{estimate.breakdown}</p>
                    {/* Itinéraire routier (v2.27) : durée et distance
                        par la route (OSRM) — le prix, lui, ne change
                        pas (modèle au km sur la distance à vol
                        d'oiseau). Sans OSRM : durée estimée classique. */}
                    {roadRoute && roadRoute.source === 'osrm' && (
                      <p className="text-xs font-bold text-cyan mt-0.5">
                        Par la route : ~{roadRoute.durationMin} min ·{' '}
                        {roadRoute.distanceKm.toFixed(1).replace('.', ',')} km
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ce n’est pas le prix de la course : les chauffeurs proposent leur prix, tu choisis — le prix accepté est figé.
                    </p>
                  </div>
                  <span className="text-right text-xs font-bold text-cyan">
                    Prix figé
                    <br />
                    une fois accepté
                  </span>
                </div>
              )}

              {/* Course planifiée (v2.30) : la demande part aux
                  chauffeurs ~15 min avant l'heure prévue ; annulable
                  avant l'envoi dans « Mes courses ». */}
              {scheduledDone && (
                <p role="status" className="text-sm font-bold text-green-300 bg-green-500/10 border border-green-500/30 rounded-2xl px-3.5 py-2.5">
                  Course planifiée — ta demande partira aux chauffeurs proches ~15 min avant l’heure
                  prévue.{' '}
                  <Link href="/mes-courses" className="underline hover:text-green-200">
                    Voir dans Mes courses →
                  </Link>
                </p>
              )}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#FFC700]"
                  />
                  <span className="text-sm text-slate-200 leading-snug">
                    <span className="font-black text-white flex items-center gap-1.5">
                      <Clock size={15} className="text-gold shrink-0" /> Planifier pour plus tard
                    </span>
                    <span className="block text-xs text-slate-400 mt-0.5">
                      Au moins 30 min dans le futur, au plus 7 jours — envoi automatique aux
                      chauffeurs ~15 min avant.
                    </span>
                  </span>
                </label>
                {scheduleEnabled && (
                  <div className="space-y-1.5">
                    <label htmlFor="scheduled-at" className="text-xs font-black uppercase tracking-widest text-slate-400">
                      Date et heure prévues
                    </label>
                    <input
                      id="scheduled-at"
                      type="datetime-local"
                      required
                      value={scheduledAt}
                      min={toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000))}
                      max={toLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/20 text-white text-sm font-bold focus:border-gold focus:outline-none [color-scheme:dark]"
                    />
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={!validTrip || !estimate || busy || isChauffeurMode}
                onClick={commander}
                className="w-full inline-flex items-center justify-center gap-2 bg-or text-night-900 font-black text-lg py-4 rounded-full shadow-lg shadow-or/40 hover:bg-or-light active:scale-[0.98] transition-all disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Envoi…
                  </>
                ) : !user ? (
                  'Se connecter pour commander'
                ) : scheduleEnabled ? (
                  'Planifier ma course'
                ) : (
                  'Commander'
                )}
              </button>

              <p className="text-[11px] text-slate-500 text-center">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('stacks-drive:open-tuto-passager'))}
                  className="underline hover:text-cyan font-bold"
                >
                  Revoir le tutoriel
                </button>
                {' · '}
                <Link href="/a-propos" className="underline hover:text-cyan">
                  Comment ça marche
                </Link>
                {' · '}
                <Link href="/cgu" className="underline hover:text-cyan">CGU</Link>
                {' · '}
                <Link href="/mentions-legales" className="underline hover:text-cyan">Mentions légales</Link>
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
                  estimation indicative : {estimate ? formatFcfa(estimate.price) : '—'}
                  {offeredPrice.trim() !== '' && ` · tu proposes ${formatFcfa(Number(offeredPrice))}`}
                </p>
                <p className="text-xs text-slate-500">
                  Les chauffeurs proposent leur prix — tu choisis, le prix accepté est figé.
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
                      rideType={rideType}
                      estimatePrice={estimate?.price ?? p.proposedPrice}
                      estimateBreakdown={estimate?.breakdown}
                      distanceKm={estimate?.distanceKm ?? null}
                      // Durée routière réelle (v2.27) quand OSRM a
                      // répondu, sinon durée estimée classique.
                      durationMin={roadRoute?.durationMin ?? estimate?.durationMin ?? null}
                      etaMin={etaForProposal(p)}
                      pickup={pickupCoords}
                      secondsLeft={p.secondsLeft ?? 0}
                      busy={busyProposalId !== null}
                      dropOffPoint={destDifficult ? destDropOff : null}
                      destinationLabel={destination}
                      onAccept={accepter}
                      onDecline={refuser}
                      onCounter={contreProposer}
                    />
                  ))}
                  <p className="text-xs text-slate-500 text-center">
                    D’autres chauffeurs peuvent encore proposer — la meilleure offre gagne.
                  </p>
                </div>
              ) : (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-sm text-slate-400">
                  {/* Barre de chargement (v2.11) : pendant l'attente des
                      propositions des chauffeurs, un shimmer or/cyan
                      remplace le prix — les prix apparaissent avec les
                      propositions. */}
                  <span
                    className="price-skeleton block h-2.5 w-48 mx-auto rounded-full"
                    role="status"
                    aria-label="Recherche de chauffeurs…"
                  />
                  <p className="mt-3">
                    Les chauffeurs en ligne autour de {pickup} reçoivent ta demande…
                  </p>
                  <span className="block text-xs text-slate-500 mt-1">
                    Le radar cherche jusqu’à {DRIVERS_AROUND_RADIUS_KM} km, puis élargit à {DISPATCH_WIDENED_RADIUS_KM} km.
                  </span>
                </div>
              )}

              <button
                type="button"
                disabled={busy}
                onClick={annulerCourse}
                className="w-full inline-flex items-center justify-center gap-2 text-sm font-bold text-red-400 hover:underline disabled:opacity-50"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                {busy ? 'Annulation…' : 'Annuler la demande'}
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
                etaMin={etaAcceptedRoad}
                pinCode={acceptedRide.pinCode}
                shareUrl={acceptedRide.shareToken ? `/suivi/${acceptedRide.shareToken}` : `/courses/${acceptedRide.id}`}
                detailUrl={`/courses/${acceptedRide.id}`}
                onCancel={acceptedRide.status === 'acceptee' ? annulerCourse : undefined}
                cancelling={busy}
              />
              {/* Messagerie (v2.10) : écrire au chauffeur, le voir arriver. */}
              <Link
                href={`/courses/${acceptedRide.id}#messages`}
                className="block w-full text-center bg-white/10 hover:bg-white/15 text-white text-sm font-black py-3 rounded-full transition-colors"
              >
                Écrire à ton chauffeur
              </Link>
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

      {/* Annulation avec motif (v2.23) : l'autre partie est prévenue
          immédiatement, l'annulation est comptée dans la fiabilité. */}
      <CancelRideDialog
        open={cancelOpen}
        role="passager"
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmerAnnulation}
      />

      {/* Tutoriel passager (v2.21) : une seule fois au premier lancement,
          fermable, rejouable depuis « Mon compte ». Pas d'ouverture auto
          en mode Chauffeur (l'accueil n'est pas l'écran passager). */}
      <PassengerTutorial autoShow isChauffeurMode={isChauffeurMode} />
    </div>
  );
}
