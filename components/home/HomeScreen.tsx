'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DriveCarMini, SedanIllustration } from '@/components/icons/DriveCar';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { NeonSearchLoader } from '@/components/icons/NeonSearchLoader';
import {
  DriveAlert,
  DriveCalendar,
  DriveCheck,
  DriveChevronDown,
  DriveChevronRight,
  DriveChevronUp,
  DriveClock,
  DriveLocate,
  DriveMove,
  DriveNavigation,
  DrivePin,
  DriveShield,
  DriveX,
} from '@/components/icons/DriveUi';
import type { HeaderUser } from '@/components/shared/Header';
import type { DriverProfile, Ride, RideProposal } from '@/types';
import type { AnonymousMapDriver } from '@/lib/db-types';
import type { SessionProfile } from '@/lib/supabase/server';
import { ProposalCard } from './ProposalCard';
import { DriverCard } from './DriverCard';
import { CancelRideDialog } from '@/components/rides/CancelRideDialog';
import type { CancelReasonCode } from '@/lib/cancellations';
import { NeighborhoodSelect } from '@/components/shared/NeighborhoodSelect';
import { DestinationSearch, type SelectedPlace } from './DestinationSearch';
import { AnimatedPrice, PriceSkeleton } from './PriceDisplay';
import { FavoritePlaceRow, type FavoritePlace } from './FavoritePlaceRow';
import { RecentDestinationRow } from './RecentDestinationRow';
import type { RecentDestination } from '@/lib/rides';
import { RideClassCards } from './RideClassCards';
import { OutOfZoneScreen } from './OutOfZoneScreen';

/** Puces de filtre véhicule (v2.52) : mini-voitures dessinées Drive
 *  (ton clair sur fond nuit) — pas le trait Lucide plat. */
const FilterCarIcon = ({ size = 14 }: { size?: number }) => (
  <DriveCarMini variant="sedan" size={size} tone="light" />
);
const FilterMotoIcon = ({ size = 14 }: { size?: number }) => (
  <DriveCarMini variant="moto" size={size} tone="light" />
);
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
import { UNPAVED_ROAD_SUPPLEMENT, etaMinutes, type RideType, type VehiclePreference } from '@/lib/pricing';
import { DISPATCH_WIDENED_RADIUS_KM, DRIVERS_AROUND_RADIUS_KM, MAP_INITIAL_ZOOM, haversineKm, isInServiceArea, nearestNeighborhood } from '@/lib/geo';
import {
  geoErrorMessage,
  getUserPosition,
  reverseGeocodeCityCountry,
  type GeoErrorKind,
} from '@/lib/geolocation';
import {
  GPS_ACCURACY_WARN_M,
  formatPointFallback,
  reverseGeocodeViaApi,
  useReverseGeocode,
} from '@/lib/pickup-point';
import { formatFcfa } from '@/lib/commission';
import type { Poi } from '@/lib/pois';
import { PoiInfoCard, type PoiOrigin } from './PoiInfoCard';
import { cn } from '@/lib/utils';
import type { FocusPoint, TrafficMapMarker } from '@/components/map/LibrevilleMap';
import { fetchEstimateViaApi, type EstimateApiResponse } from '@/lib/routing';
import { useRoadRoute } from '@/lib/use-road-route';
import type { TrafficReport } from '@/lib/traffic';

const LibrevilleMap = dynamic(
  () => import('@/components/map/LibrevilleMap').then((m) => m.LibrevilleMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-night-950 flex items-center justify-center">
        <LogoLoader size={72} label="Chargement de la carte de Libreville…" />
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
/** Crans de la feuille (v2.53) : 15 = mini (poignée + titre, la carte
 *  est libérée), 30 = aperçu, 58 = formulaire complet, 88 = quasi
 *  plein écran (la feuille recouvre la carte — c'est le cran « remonter
 *  sur la carte » demandé par le propriétaire, 15/11 : à 58 la feuille
 *  ne recouvrait que la moitié basse de l'écran). */
const SHEET_SNAPS = [15, 30, 58, 88];

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

/** Écran d'accueil map-first « Libreville la nuit » : carte sombre plein
 *  écran + feuille de demande draggable en bas (départ géolocalisable,
 *  destination, type de course, estimation indicative, commander). */
export function HomeScreen({
  user,
  profile,
  realDrivers,
  demoDrivers,
  scheduledCount,
  recentDestinations,
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
  /** Nombre RÉEL de courses planifiées (statuts `planifiee` /
   *  `expiree`, v2.30 — compté dans `app/page.tsx`). Null =
   *  déconnecté : aucun chiffre inventé, la carte n'affiche pas de
   *  nombre. */
  scheduledCount?: number | null;
  /** Adresses récentes (historique RÉEL, `lib/rides.ts`) — vide ou
   *  absent = section masquée. */
  recentDestinations?: RecentDestination[];
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
  // Photo de profil (v2.49) : null = inconnue (non connecté, ou base
  // pas encore à jour) — la ligne « Compléter ton profil » est alors
  // masquée, jamais affichée avec un chiffre inventé.
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user || user.role !== 'passager') return;
    fetch('/api/profile/photo')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && !d?.baseOutdated) setHasPhoto(d.hasPhoto === true);
      })
      .catch(() => undefined);
  }, [user]);
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
  // v2.47 — point précis (épingle) : d'où vient le point, et son
  // adresse résolue. Le quartier reste la référence du trajet
  // (dispatch, suppléments) ; le point exact affine le départ et
  // l'arrivée à l'intérieur du quartier.
  const [pickupPointSource, setPickupPointSource] = useState<'gps' | 'neighborhood' | 'pin' | 'place'>('neighborhood');
  const [destExact, setDestExact] = useState<{ lat: number; lng: number } | null>(null);
  const [destPointSource, setDestPointSource] = useState<'gps' | 'neighborhood' | 'pin' | 'place'>('neighborhood');
  const [destAddress, setDestAddress] = useState<string | null>(null);
  // v2.47 — ajustement à l'épingle : quel point on règle, et le point
  // de départ de l'ajustement (pour « Annuler » et pour revenir au
  // dernier point valide si l'épingle sort de la zone).
  const [adjusting, setAdjusting] = useState<'pickup' | 'destination' | null>(null);
  // v2.54 — le point de départ de l'ajustement (pour « Annuler » et
  // pour revenir au dernier point valide si l'épingle sort de la
  // zone) : on mémorise AUSSI la source d'origine (et l'adresse du
  // lieu, le cas échéant) — annuler ne doit pas transformer un centre
  // de quartier en point « épingle » : le point revient tel qu'il
  // était, source comprise. Le NOM du quartier est mémorisé aussi :
  // glisser l'épingle change le quartier de rattachement (le plus
  // proche), annuler doit remettre le quartier d'avant, pas seulement
  // les coordonnées.
  const adjustStartRef = useRef<{
    kind: 'pickup' | 'destination';
    lat: number;
    lng: number;
    neighborhood: Neighborhood | '';
    source: 'gps' | 'neighborhood' | 'pin' | 'place';
    address: string | null;
    unpavedRoad: boolean;
  } | null>(null);
  const [lastValidPoint, setLastValidPoint] = useState<{ lat: number; lng: number } | null>(null);
  // v2.47 — l'épingle « se pose » : la clé rejoue sa chute + son
  // rebond à chaque ouverture et après chaque glisser (la surcouche
  // de la carte est remontée avec cette clé).
  const [pinBounceKey, setPinBounceKey] = useState(0);
  // v2.47 — la carte glisse sous l'épingle : l'adresse affichée est
  // momentanément périmée (squelette) jusqu'au `moveend`.
  const [mapMoving, setMapMoving] = useState(false);
  // v2.47 — précision GPS : au-delà de 50 m, la position est
  // « approximative » — on le dit et on ouvre l'épingle.
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [gpsFailed, setGpsFailed] = useState(false);
  // v2.47 — barre flottante « Vers où ? » : nonce qui fait reprendre
  // le focus au champ de recherche de destination.
  const [focusDestinationNonce, setFocusDestinationNonce] = useState(0);
  // v2.47 — réessai du géocodage quand l'adresse est introuvable.
  const [geoRetryKey, setGeoRetryKey] = useState(0);
  // Référence du champ date/heure de planification (v2.30) : l'état
  // vide « aucun chauffeur » y renvoie directement.
  const scheduledAtRef = useRef<HTMLInputElement | null>(null);
  // v2.47 — « Planifier pour plus tard » depuis l'état vide de
  // recherche : on ouvre l'annulation, et si elle est confirmée, la
  // feuille revient en idle avec la planification activée (le drapeau
  // est effacé si la boîte d'annulation est fermée sans confirmer).
  const planAfterCancelRef = useRef(false);
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
  const dragRef = useRef<{ startY: number; startH: number; moved: boolean; pointerId: number; minPx: number } | null>(null);
  // Clic fantôme après un glisser (v2.53) : le clic qui suit le
  // relâcher retomberait sinon sur le contenu qui vient de glisser
  // sous le doigt (ex. la carte « Trajets » ouvrirait la recherche
  // au lieu de replier la feuille) — il est supprimé une fois, voir
  // `onDragPointerUp`.
  const suppressClickRef = useRef(false);
  // `phaseRef` (déclarée plus bas, miroir de `phase`) est lue par les
  // écouteurs natifs du glisser : ils sont posés sur `window` au début
  // du geste et ne voient pas les rendus suivants.

  // Le cran mini n'existe qu'en phase idle : dès qu'une recherche ou une
  // course démarre, la feuille remonte à mi-hauteur pour rester lisible.
  useEffect(() => {
    if (phase !== 'idle') setSheetH(58);
  }, [phase]);
  const isMini = phase === 'idle' && sheetH <= 20;
  // v2.39 : les pastilles du haut de la carte (compteur chauffeurs,
  // Recentrer, barre « Vers où ? ») ne s'effacent PLUS quand la
  // feuille se déplie — l'ancien fondu les rendait invisibles et
  // incliquables alors qu'elles sont dans le haut de l'écran, jamais
  // recouvertes par la feuille (88 dvh max, par le bas). Sur mobile,
  // la feuille est dépliée pendant presque toute la commande : c'est
  // là que l'utilisateur en a le plus besoin. (La bascule
  // Plan/Satellite a été retirée en v2.50 : une seule carte.)
  // Feuille à pleine hauteur (cran 88) : le chevron de la poignée
  // pointe vers le bas (replier), sinon vers le haut (déplier).
  const atFull = sheetH >= 88;

  // Crans autorisés selon la phase : en idle les quatre, sinon aperçu,
  // pleine et quasi plein écran seulement (la feuille reste utilisable
  // pendant une course).
  function allowedSnaps() {
    return phase === 'idle' ? SHEET_SNAPS : SHEET_SNAPS.filter((s) => s >= 30);
  }
  // Bascule entre crans, dans l'ordre : mini → aperçu → pleine →
  // quasi plein écran → mini (idle) ou aperçu → pleine → quasi plein
  // écran → aperçu (recherche / course). Utilisée par le tap sur la
  // poignée et par le bouton chevron — jamais de saut direct. Le
  // cycle passe par le `onClick` du bouton (v2.53), pas par le
  // `pointerup` : le cycle au `pointerup` se jouait AVANT le clic,
  // donc la feuille changeait de hauteur sous le doigt et le clic
  // qui suivait pouvait retomber sur un contenu qui venait de se
  // monter (ex. l'input de recherche prenait le focus et faisait
  // sauter la feuille en pleine hauteur au lieu du cran suivant).
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
        setGpsAccuracyM(pos.accuracyM);
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
          setPickupPointSource('gps');
          setLastValidPoint({ lat: pos.lat, lng: pos.lng });
          focusOn(pos.lat, pos.lng);
          // v2.47 — GPS imprécis (> 50 m) : la position est
          // approximative, on ouvre directement l'épingle pour que
          // le passager précise son point au lieu de commander sur
          // une position fausse.
          if (pos.accuracyM !== null && pos.accuracyM > GPS_ACCURACY_WARN_M) {
            adjustStartRef.current = {
              kind: 'pickup',
              lat: pos.lat,
              lng: pos.lng,
              neighborhood: nearest.neighborhood,
              source: 'gps',
              address: null,
              unpavedRoad: false,
            };
            setPinBounceKey((k) => k + 1);
            setAdjusting('pickup');
            setSheetH(30);
          }
        }
        // Nom de rue en complément (best-effort, jamais bloquant) —
        // par le proxy serveur (v2.47), pas en direct.
        reverseGeocodeViaApi(pos.lat, pos.lng).then((r) => {
          if (!cancelled && r?.address) setGeoLabel(r.address);
        });
      })
      .catch(() => {
        if (cancelled) return;
        setGpsFailed(true);
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
  // Coordonnées du départ : position exacte si géolocalisée ou placée
  // à l'épingle, sinon centre du quartier. Destination : point exact
  // (épingle / lieu choisi) si défini, sinon centre du quartier.
  // Déclarées avant les estimations (v2.47) : le prix est calculé
  // sur ces coordonnées exactes.
  const pickupCoords = pickup !== ''
    ? (pickupExact ?? NEIGHBORHOOD_COORDS[pickup as Neighborhood])
    : null;
  const destCoords = destination !== ''
    ? (destExact ?? NEIGHBORHOOD_COORDS[destination as Neighborhood])
    : null;
  // Estimation indicative — calculée CÔTÉ SERVEUR sur la distance
  // ROUTIÈRE OSRM entre les coordonnées EXACTES du départ et de la
  // destination (v2.50, ADR 0025 ; v2.47 : épingle déplacée, lieu
  // choisi). Le client ne calcule PLUS jamais un prix seul : il
  // appelle `POST /api/estimate` (debounce 400 ms, annulation de
  // l'appel précédent) et affiche ce que le serveur renvoie — le
  // même estimateur sert à la création de la demande, donc le même
  // trajet donne le même prix des deux côtés. Le prix final reste
  // négocié et figé à l'acceptation — jamais de surge.
  // Repli : si OSRM est indisponible, le serveur répond avec la
  // distance à vol d'oiseau et `approximate: true` (l'interface
  // l'affiche) ; si la route API est injoignable, on garde la
  // dernière estimation affichée — jamais de prix calculé en local.
  const [serverEstimate, setServerEstimate] = useState<EstimateApiResponse | null>(null);
  const serverEstimateRef = useRef<EstimateApiResponse | null>(null);
  useEffect(() => {
    serverEstimateRef.current = serverEstimate;
  }, [serverEstimate]);
  // Barre de chargement du prix (règle 1, v2.17) : pendant le calcul
  // serveur, une petite barre shimmer remplace le chiffre — le prix
  // apparaît ensuite avec sa décomposition.
  const [estimating, setEstimating] = useState(false);
  const [estimateUnavailable, setEstimateUnavailable] = useState(false);
  useEffect(() => {
    if (!validTrip || !pickupCoords || !destCoords) {
      setServerEstimate(null);
      setEstimating(false);
      setEstimateUnavailable(false);
      return;
    }
    setEstimating(true);
    setEstimateUnavailable(false);
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      fetchEstimateViaApi(
        {
          fromLat: pickupCoords.lat,
          fromLng: pickupCoords.lng,
          toLat: destCoords.lat,
          toLng: destCoords.lng,
          fromNeighborhood: pickup,
          toNeighborhood: destination,
          unpavedRoad,
          vehiclePreference: vehiclePref,
        },
        controller.signal
      ).then((res) => {
        if (controller.signal.aborted) return;
        setEstimating(false);
        if (res) {
          setServerEstimate(res);
          setEstimateUnavailable(false);
        } else if (!serverEstimateRef.current) {
          // Route API injoignable et aucune estimation précédente :
          // on le dit, on n'invente rien.
          setEstimateUnavailable(true);
        }
      });
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickup, destination, pickupCoords, destCoords, rideType, vehiclePref, unpavedRoad, validTrip]);

  // L'estimation affichée pour le type de course choisi, et les deux
  // estimations des cartes de classe (Solo / Groupe).
  const estimate = serverEstimate
    ? rideType === 'solo'
      ? serverEstimate.solo
      : serverEstimate.groupe
    : null;
  const estimateSolo = serverEstimate?.solo ?? null;
  const estimateGroupe = serverEstimate?.groupe ?? null;

  // v2.47 — adresse résolue du départ et de la destination (géocodage
  // inverse serveur, Nominatim puis Photon, debounce 400 ms). Résolue
  // seulement pour un point EXACT (GPS, épingle, lieu) : pour un
  // centre de quartier, l'adresse est le nom du quartier (le
  // géocodage d'un centre de quartier n'apporterait rien).
  const pickupResolvePoint =
    pickup !== '' && pickupPointSource !== 'neighborhood' ? pickupCoords : null;
  const pickupResolved = useReverseGeocode(pickupResolvePoint, geoRetryKey);
  const destResolvePoint =
    destination !== '' && destPointSource !== 'neighborhood' ? destCoords : null;
  const destResolved = useReverseGeocode(destResolvePoint, geoRetryKey);

  /** Adresse affichée du départ : rue résolue (ou nom du quartier
   *  pour un centre), jamais une adresse inventée — en dernier
   *  recours, coordonnées + quartier le plus proche. */
  const pickupAddressLabel =
    pickup === '' || !pickupCoords
      ? null
      : pickupPointSource === 'neighborhood'
        ? geoLabel
          ? `${geoLabel} · ${pickup}`
          : pickup
        : (pickupResolved.address ??
          geoLabel ??
          formatPointFallback(pickupCoords.lat, pickupCoords.lng, pickup as Neighborhood));
  /** Adresse affichée de la destination (même règle). */
  const destAddressLabel =
    destination === '' || !destCoords
      ? null
      : destPointSource === 'place' && destAddress
        ? destAddress
        : destPointSource === 'neighborhood'
          ? destination
          : (destResolved.address ??
            formatPointFallback(destCoords.lat, destCoords.lng, destination as Neighborhood));
  /** Points passés à la carte : mémoïsés (v2.51) — des objets
   *  recréés à chaque rendu faisaient redéclencher l'effet
   *  d'épingles de la carte (`fitBounds` à chaque rendu) et
   *  interdisaient tout zoom / déplacement manuel tant qu'un trajet
   *  était défini : la vue revenait sans cesse sur le trajet. */
  const pickupPoint = useMemo(
    () => (pickupCoords && pickup ? { ...pickupCoords, label: pickupAddressLabel ?? pickup } : null),
    [pickupCoords, pickup, pickupAddressLabel],
  );
  const destinationPoint = useMemo(
    () => (destCoords && destination ? { ...destCoords, label: destAddressLabel ?? destination } : null),
    [destCoords, destination, destAddressLabel],
  );
  const radarCenterPoint = useMemo(
    () => (pickupCoords && pickup ? { ...pickupCoords, label: pickup } : null),
    [pickupCoords, pickup],
  );
  /** Le point ajusté est-il dans la zone ? (vérification en direct
   *  pendant le glisser — le bouton de confirmation ne valide pas
   *  un point hors zone sans prévenir.) */
  const adjustingPointOutOfZone = adjusting
    ? (() => {
        const p = adjusting === 'pickup' ? pickupCoords : destCoords;
        return p ? !isInServiceArea(p.lat, p.lng) : false;
      })()
    : false;
  /** GPS imprécis : la position est approximative, on le dit et on
   *  propose l'épingle. */
  const gpsImprecise =
    pickupPointSource === 'gps' && gpsAccuracyM !== null && gpsAccuracyM > GPS_ACCURACY_WARN_M;
  /** Lieux enregistrés du passager (v2.30) — pour la recherche de
   *  destination et « Mes lieux » (avec ETA réelle, v2.48). */
  const favoritePlaces: FavoritePlace[] = useMemo(() => {
    if (!profile) return [];
    const out: FavoritePlace[] = [];
    if (profile.home_neighborhood) {
      out.push({
        key: 'home',
        label: 'Maison',
        icon: 'home',
        neighborhood: profile.home_neighborhood as Neighborhood,
        detail: profile.home_detail ?? null,
      });
    }
    if (profile.work_neighborhood) {
      out.push({
        key: 'work',
        label: 'Travail',
        icon: 'work',
        neighborhood: profile.work_neighborhood as Neighborhood,
        detail: profile.work_detail ?? null,
      });
    }
    return out;
  }, [profile]);

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

  // Itinéraire routier (v2.27) : géométrie OSRM + durée/distance
  // routières pour le trajet choisi — affichées dans la feuille et
  // sur la carte (la polyligne droite est remplacée). Depuis la
  // v2.50, la route vient de la MÊME réponse serveur que
  // l'estimation (`POST /api/estimate`) : un seul appel, et le
  // prix et la carte disent la même chose. OSRM indisponible → la
  // route est le repli ligne droite (source 'fallback') et
  // l'estimation est marquée approximative.
  const roadRoute = serverEstimate?.route ?? null;

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
      setPickupPointSource('gps');
      setLastValidPoint({ lat: pos.lat, lng: pos.lng });
      setGpsAccuracyM(pos.accuracyM);
      setGpsFailed(false);
      setUserLocation({ lat: pos.lat, lng: pos.lng, label: nearest.neighborhood });
      setGeoLabel(null);
      focusNonceRef.current += 1;
      setFocusPoint({ lat: pos.lat, lng: pos.lng, zoom: MAP_INITIAL_ZOOM, nonce: focusNonceRef.current });
      // v2.47 — GPS imprécis (> 50 m) : on ouvre directement
      // l'épingle pour préciser le point (même règle qu'au
      // chargement — on ne commande pas sur une position fausse).
      if (pos.accuracyM !== null && pos.accuracyM > GPS_ACCURACY_WARN_M) {
        adjustStartRef.current = {
          kind: 'pickup',
          lat: pos.lat,
          lng: pos.lng,
          neighborhood: nearest.neighborhood,
          source: 'gps',
          address: null,
          unpavedRoad: false,
        };
        setPinBounceKey((k) => k + 1);
        setAdjusting('pickup');
        setSheetH(30);
      }
      // Nom de rue en complément (best-effort, jamais bloquant) —
      // par le proxy serveur (v2.47), pas en direct.
      reverseGeocodeViaApi(pos.lat, pos.lng).then((r) => {
        if (r?.address) setGeoLabel(r.address);
      });
    } catch (err) {
      // GPS coupé ou refusé : on le dit et on propose la liste des
      // quartiers (le départ ne reste pas vide sans explication).
      setGpsFailed(true);
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
    setPickupPointSource('neighborhood');
    setGeoLabel(null);
    if (value !== '') manualPickupRef.current = true;
  }

  // Choix de la destination : la demande de route non bitumée repart
  // de zéro (elle ne vaut que pour le quartier choisi).
  function handleDestinationChange(value: Neighborhood | '') {
    setDestination(value);
    setDestExact(null);
    setDestPointSource('neighborhood');
    setDestAddress(null);
    setUnpavedRoad(false);
  }

  // --- Point précis à l'épingle (v2.47) ---

  /** Ouvrir l'ajustement à l'épingle (départ ou destination) : la
   *  carte se centre sur le point courant, l'épingle « se pose »
   *  (chute + rebond), la feuille se replie pour laisser voir la
   *  carte. Le point de départ de l'ajustement est mémorisé pour
   *  « Annuler » et pour le repli hors zone. */
  function openAdjust(kind: 'pickup' | 'destination') {
    const point = kind === 'pickup' ? pickupCoords : destCoords;
    if (!point) return;
    adjustStartRef.current = {
      kind,
      lat: point.lat,
      lng: point.lng,
      neighborhood: kind === 'pickup' ? pickup : destination,
      source: kind === 'pickup' ? pickupPointSource : destPointSource,
      address: kind === 'pickup' ? null : destAddress,
      unpavedRoad,
    };
    focusNonceRef.current += 1;
    setFocusPoint({ lat: point.lat, lng: point.lng, zoom: 17, nonce: focusNonceRef.current });
    setPinBounceKey((k) => k + 1);
    setAdjusting(kind);
    setSheetH(30);
  }

  /** La carte a bougé sous l'épingle (`moveend`) : le point devient
   *  le centre de la carte, et son quartier de rattachement le
   *  quartier le plus proche (le quartier reste la référence du
   *  trajet — dispatch, suppléments). Le point en zone devient le
   *  dernier point valide (repli si l'épingle sort de la zone). */
  function handleMapCenterChange(center: { lat: number; lng: number }) {
    setMapMoving(false);
    if (!adjusting) return;
    const nearest = nearestNeighborhood(center.lat, center.lng);
    if (adjusting === 'pickup') {
      setPickup(nearest.neighborhood);
      setPickupExact({ lat: center.lat, lng: center.lng });
      setPickupPointSource('pin');
      manualPickupRef.current = true;
    } else {
      setDestination(nearest.neighborhood);
      setDestExact({ lat: center.lat, lng: center.lng });
      setDestPointSource('pin');
      setDestAddress(null);
      setUnpavedRoad(false);
    }
    if (isInServiceArea(center.lat, center.lng)) {
      setLastValidPoint({ lat: center.lat, lng: center.lng });
    }
  }

  /** L'épingle a été glissée du doigt puis relâchée : la carte se
   *  recentre dessus (le point est mis à jour par le `moveend` du
   *  recentrage — une seule source de vérité : le centre de la
   *  carte), et l'épingle « se pose » (rebond rejoué). */
  function handleCenterPinDragEnd(lat: number, lng: number) {
    focusNonceRef.current += 1;
    setFocusPoint({ lat, lng, zoom: 17, nonce: focusNonceRef.current });
    setPinBounceKey((k) => k + 1);
  }

  /** Restaurer le point d'avant l'ajustement (v2.54) : le point
   *  EXACT est remis (ou effacé si le point d'avant était un centre
   *  de quartier — pas de point exact), la source d'origine est
   *  remise (un centre de quartier annulé ne devient pas un point
   *  « épingle »), l'adresse du lieu et la demande de piste sont
   *  remises aussi. La carte se recentre sur le point restauré. */
  function restoreAdjustStart() {
    const start = adjustStartRef.current;
    if (!start) return;
    if (start.kind === 'pickup') {
      setPickup(start.neighborhood);
      setPickupExact(start.source === 'neighborhood' ? null : { lat: start.lat, lng: start.lng });
      setPickupPointSource(start.source);
    } else {
      setDestination(start.neighborhood);
      setDestExact(start.source === 'neighborhood' ? null : { lat: start.lat, lng: start.lng });
      setDestPointSource(start.source);
      setDestAddress(start.address);
      setUnpavedRoad(start.unpavedRoad);
    }
    focusNonceRef.current += 1;
    setFocusPoint({ lat: start.lat, lng: start.lng, zoom: 17, nonce: focusNonceRef.current });
  }

  /** Confirmer le point : on sort de l'ajustement. Si le point est
   *  hors zone, on revient au dernier point valide (sans bloquer —
   *  l'appli ne laisse jamais le passager coincé sur un point
   *  impossible) et on dit quoi faire. */
  function confirmAdjust() {
    if (!adjusting) return;
    const point = adjusting === 'pickup' ? pickupCoords : destCoords;
    if (point && !isInServiceArea(point.lat, point.lng)) {
      restoreAdjustStart();
      setError('Ce point est hors zone — Stacks Drive est à Libreville pour l’instant. On t’a remis sur ton dernier point valide : déplace l’épingle dans la zone, ou choisis un quartier dans la liste.');
      setAdjusting(null);
      setSheetH(58);
      return;
    }
    setAdjusting(null);
    setSheetH(58);
  }

  /** Annuler l'ajustement : retour au point d'avant (sans rien
   *  valider), la feuille reprend sa hauteur. */
  function cancelAdjust() {
    restoreAdjustStart();
    setAdjusting(null);
    setSheetH(58);
  }

  /** Choisir un lieu dans la recherche de destination (v2.47, B) :
   *  l'épingle se déplace sur le lieu exact, la destination est
   *  remplie (quartier + adresse réelle du lieu), la carte se
   *  centre dessus. */
  function selectDestinationPlace(place: SelectedPlace) {
    setDestination(place.neighborhood);
    setDestExact({ lat: place.lat, lng: place.lng });
    setDestPointSource('place');
    setDestAddress(place.address);
    setUnpavedRoad(false);
    focusNonceRef.current += 1;
    setFocusPoint({ lat: place.lat, lng: place.lng, zoom: 16, nonce: focusNonceRef.current });
  }

  /** Adresse récente (v2.51) : même geste qu'un lieu choisi — le
   *  point exact devient la destination (quartier de rattachement
   *  + adresse réelle de l'historique), la carte se centre dessus. */
  function selectRecentDestination(recent: RecentDestination) {
    setDestination(recent.neighborhood);
    setDestExact({ lat: recent.lat, lng: recent.lng });
    setDestPointSource('place');
    setDestAddress(recent.address ?? recent.label);
    setUnpavedRoad(false);
    focusNonceRef.current += 1;
    setFocusPoint({ lat: recent.lat, lng: recent.lng, zoom: 16, nonce: focusNonceRef.current });
  }

  /** « Plus tard » / carte « Trajets planifiés » (v2.51) : active
   *  le mode planification existant (v2.30) et met le focus sur le
   *  champ date/heure — même pattern que `planLaterFromSearch`
   *  (v2.47) : la feuille monte en pleine hauteur et le champ
   *  prend le focus (clavier ouvert), puis défile jusqu'à lui. */
  function activatePlanMode() {
    setScheduleEnabled(true);
    setSheetH(58);
    window.setTimeout(() => {
      scheduledAtRef.current?.focus();
      scheduledAtRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  }

  /** Barre flottante « Vers où ? » (v2.47, D) : la feuille monte au
   *  cran le plus haut et le champ de recherche de destination
   *  prend le focus (clavier ouvert, résultats visibles). */
  function openDestinationSearch() {
    setSheetH(58);
    setFocusDestinationNonce((n) => n + 1);
  }

  // « Y aller » (v2.13) : le lieu devient la destination (son
  // quartier le plus proche), la carte se recentre dessus et la
  // feuille s'ouvre pour commander. v2.47 : l'épingle se pose sur le
  // lieu exact (pas sur le centre du quartier) et l'adresse du lieu
  // est affichée.
  function goToPoi(poi: Poi) {
    handleDestinationChange(poi.neighborhood);
    setDestExact({ lat: poi.lat, lng: poi.lng });
    setDestPointSource('place');
    setDestAddress(`${poi.name}, ${poi.neighborhood}`);
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
  // Réécrit en v2.53 (diagnostic 15/11 — la feuille restait figée à
  // ~30 dvh sur téléphone) : les écouteurs de glisser sont posés sur
  // `window`, pas sur le bouton. L'ancienne version utilisait
  // `setPointerCapture` : la capture se comporte mal sur certains
  // mobiles (le glisser s'interrompt quand le doigt sort du bouton,
  // haut de 22 px seulement), et le cycle au `pointerup` se jouait
  // avant le clic — la feuille changeait de hauteur sous le doigt et
  // le clic qui suivait pouvait retomber sur un contenu qui venait de
  // se monter (focus volé par l'input de recherche → saut en pleine
  // hauteur). Maintenant : le cycle passe par le `onClick` du bouton
  // (après le clic, cible fiable), et le clic qui suit un vrai glisser
  // est supprimé une fois (voir `onDragPointerUp`).
  const onDragPointerMove = useCallback((e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const vh = window.innerHeight;
    if (Math.abs(drag.startY - e.clientY) > 6) drag.moved = true;
    const px = Math.min(0.9 * vh, Math.max(drag.minPx, drag.startH + (drag.startY - e.clientY)));
    setSheetH((px / vh) * 100);
  }, []);
  const onDragPointerUp = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setIsDragging(false);
      window.removeEventListener('pointermove', onDragPointerMove);
      window.removeEventListener('pointerup', onDragPointerUp);
      window.removeEventListener('pointercancel', onDragPointerUp);
      if (!drag.moved) return; // Tap : le `onClick` du bouton fait le cycle.
      // Glisser : on s'arrête au cran le plus proche. Hors phase idle, le
      // cran mini n'existe pas : le minimum est 30.
      const snaps = phaseRef.current === 'idle' ? SHEET_SNAPS : SHEET_SNAPS.filter((s) => s >= 30);
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
      // Supprimer le clic fantôme : après un glisser, le navigateur
      // envoie un `click` sur l'élément qui se trouve sous le doigt au
      // relâcher — la feuille vient de bouger, donc ce n'est plus la
      // poignée mais un contenu qui vient de glisser dessous (ex. la
      // carte « Trajets » ouvrirait la recherche). Un écouteur de capture
      // unique avale ce clic, puis se retire (500 ms, marge large).
      suppressClickRef.current = true;
      const stopClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        suppressClickRef.current = false;
      };
      window.addEventListener('click', stopClick, true);
      window.setTimeout(() => window.removeEventListener('click', stopClick, true), 500);
    },
    [onDragPointerMove],
  );
  // Si le composant se démonte en plein glisser (navigation), retirer
  // les écouteurs posés sur `window`.
  useEffect(
    () => () => {
      window.removeEventListener('pointermove', onDragPointerMove);
      window.removeEventListener('pointerup', onDragPointerUp);
      window.removeEventListener('pointercancel', onDragPointerUp);
    },
    [onDragPointerMove, onDragPointerUp],
  );
  function onHandlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const vh = window.innerHeight;
    dragRef.current = {
      startY: e.clientY,
      startH: (sheetH / 100) * vh,
      moved: false,
      pointerId: e.pointerId,
      // En phase idle on peut descendre jusqu'au cran mini (12 dvh) ;
      // pendant une recherche / course, la feuille ne descend pas sous 30.
      minPx: phase === 'idle' ? 0.1 * vh : 0.28 * vh,
    };
    setIsDragging(true);
    // Pas de `setPointerCapture` (v2.53) : la capture interrompt le
    // glisser sur certains mobiles — les écouteurs `window` ci-dessus
    // suivent le doigt partout, y compris hors du bouton.
    window.addEventListener('pointermove', onDragPointerMove);
    window.addEventListener('pointerup', onDragPointerUp);
    window.addEventListener('pointercancel', onDragPointerUp);
  }
  // Tap sur la poignée (v2.53) : le cycle passe par le clic, pas par
  // le `pointerup` (voir commentaire de `cycleSheet`). Après un vrai
  // glisser, le clic fantôme a déjà été avalé par l'écouteur de
  // capture — la garde ci-dessous n'est qu'une ceinture de sécurité.
  function onHandleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    cycleSheet();
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
    // v2.45 — compte admin = admin uniquement : l'admin ne commande
    // pas de course (défense côté client — le serveur rejette aussi,
    // voir POST /api/rides).
    if (user.isAdmin) {
      setError('Le compte administrateur ne commande pas de courses : utilise un compte passager.');
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
        // v2.47 — points exacts (épingle / lieu / GPS) : coordonnées
        // + adresse résolue + quartier de rattachement. Le serveur
        // les valide (dans la zone) et calcule l'estimation dessus ;
        // sans eux (ancien client), il retombe sur les centres de
        // quartiers. `address` est null pour un centre de quartier.
        pickupPoint:
          pickupCoords && pickupPointSource !== 'neighborhood'
            ? {
                lat: pickupCoords.lat,
                lng: pickupCoords.lng,
                address: pickupResolved.address,
                neighborhood: pickup,
              }
            : null,
        destinationPoint:
          destCoords && destPointSource !== 'neighborhood'
            ? {
                lat: destCoords.lat,
                lng: destCoords.lng,
                address: destPointSource === 'place' ? destAddress : destResolved.address,
                neighborhood: destination,
              }
            : null,
      }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Demande impossible pour le moment. Réessaie.');
      return;
    }
    // Course planifiée : pas de recherche immédiate — confirmation
    // + renvoi vers Activité (annulable avant l'envoi).
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

  /** Annulation (v2.23, motif optionnel depuis v2.38) : « Sans motif »
   *  est le choix par défaut — la modale s'ouvre d'abord, la requête
   *  part seulement après confirmation. */
  const [cancelOpen, setCancelOpen] = useState(false);

  async function annulerCourse() {
    setCancelOpen(true);
  }

  async function confirmerAnnulation(
    reasonCode: CancelReasonCode,
    detail: string | null
  ): Promise<string | null> {
    if (!rideId) return 'Annulation impossible.';
    setBusy(true);
    const res = await fetch(`/api/rides/${rideId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', reasonCode, reason: detail }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      const message = data?.error ?? 'Annulation impossible pour le moment. Réessaie.';
      setError(message);
      return message;
    }
    resetToIdle();
    return null;
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
    // v2.47 — retour depuis l'état vide « aucun chauffeur » : la
    // planification s'active et le champ date/heure prend le focus.
    if (planAfterCancelRef.current) {
      planAfterCancelRef.current = false;
      setScheduleEnabled(true);
      window.setTimeout(() => scheduledAtRef.current?.focus(), 150);
    }
  }

  /** v2.47 — état vide « aucun chauffeur » : planifier pour plus
   *  tard au lieu de rester bloqué. On ouvre l'annulation (le
   *  passager choisit le motif, ou « sans motif ») ; une fois
   *  confirmée, `resetToIdle` active la planification. */
  function planLaterFromSearch() {
    planAfterCancelRef.current = true;
    annulerCourse();
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
    <div
      className="relative flex-1 min-h-0"
      // v2.53 — hauteur de la feuille pour la carte : les boutons +/−
      // (coin bas droit) sont remontés au-dessus de la feuille sur
      // mobile (voir `.map-with-sheet` dans globals.css) — sinon la
      // feuille les recouvre même au cran mini et ils sont incliquables.
      // `--sheet-fab` : au cran mini, le bouton flottant rose
      // « Remonter la feuille » (48 px + 14 px de marge) occupe le
      // coin bas droit juste au-dessus de la feuille — les boutons +/−
      // sont remontés d'autant, sinon le bouton − serait caché
      // derrière lui.
      style={{ '--sheet-h': `${sheetH}dvh`, '--sheet-fab': isMini ? '62px' : '0px' } as React.CSSProperties}
    >
      <LibrevilleMap
        className="map-with-sheet absolute inset-0 h-full w-full"
        drivers={isChauffeurMode ? [] : mapDrivers}
        pickup={pickupPoint}
        destination={destinationPoint}
        radarActive={phase === 'searching' || phase === 'proposals'}
        radarCenter={radarCenterPoint}
        selectedDriverId={selectedDriverId}
        assignedDriverId={acceptedDriver?.id ?? null}
        userLocation={userLocation}
        focusPoint={focusPoint}
        onDriverClick={(id) => setSelectedDriverId(id)}
        adjusting={adjusting}
        centerPinKey={pinBounceKey}
        onCenterChange={handleMapCenterChange}
        onCenterMoveStart={() => setMapMoving(true)}
        onCenterPinDragEnd={handleCenterPinDragEnd}
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

      {/* Compteur de chauffeurs autour — passagers seulement. Il reste
          visible en permanence (v2.39) : pendant la recherche et les
          propositions, le radar reste visible : « X chauffeurs
          détectés autour de toi » (v2.11). */}
      {phase !== 'confirmed' && phase !== 'done' && !isChauffeurMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <span className="inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/10 shadow-xl shadow-black/40 rounded-full px-4 py-2 text-xs font-black text-slate-100">
            <span className="w-2 h-2 rounded-full bg-sarcelle animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.9)]" />
            {phase === 'idle'
              ? `${driversNearPickup} chauffeur${driversNearPickup > 1 ? 's' : ''} autour de toi · dans un rayon de ${DRIVERS_AROUND_RADIUS_KM} km`
              : `Radar · ${driversNearPickup} chauffeur${driversNearPickup > 1 ? 's' : ''} détecté${driversNearPickup > 1 ? 's' : ''} autour de toi · dans un rayon de ${DRIVERS_AROUND_RADIUS_KM} km`}
          </span>
        </div>
      )}

      {/* Bouton « Recentrer » — toujours visible et cliquable (v2.39) */}
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-night-900/90 backdrop-blur border border-white/15 text-white text-xs font-black px-3 py-2 rounded-full shadow-xl shadow-black/40 hover:border-sarcelle/60 active:scale-95 transition-all duration-500"
        aria-label={userLocation ? 'Recentrer sur ma position' : 'Recentrer sur Libreville'}
      >
        <DriveLocate size={15} className="text-sarcelle" />
        {userLocation ? 'Moi' : 'Libreville'}
      </button>

      {/* Barre flottante « Vers où ? » (v2.47, D) : l'entrée
          principale vers la recherche de destination — un tap monte
          la feuille et ouvre le clavier. Wording Drive : pas la
          formule Yango mot pour mot. Visible en phase idle,
          passager, carte seulement (pas en ajustement d'épingle,
          pas en mode chauffeur). Sous le bouton Recentrer (la
          bascule Plan/Satellite a été retirée en v2.50 : une seule
          carte, fond OpenStreetMap clair depuis la v2.53 — ADR 0026, ADR 0029). */}
      {phase === 'idle' && !isMini && !isChauffeurMode && !adjusting && (
        <button
          type="button"
          onClick={openDestinationSearch}
          className="absolute top-14 left-3 right-3 sm:left-4 sm:right-auto sm:w-[440px] z-10 inline-flex items-center gap-3 bg-night-900/95 backdrop-blur border border-white/15 shadow-xl shadow-black/40 rounded-full pl-4 pr-3 py-3 text-left hover:border-sarcelle/60 active:scale-[0.99] transition-all"
          aria-label="Vers où ? Rechercher une destination"
        >
          <span className="shrink-0 w-8 h-8 rounded-full bg-corail/15 border border-corail/30 flex items-center justify-center">
            <DriveCarMini variant="sedan" size={18} tone="light" />
          </span>
          <span className="flex-1 min-w-0 text-base font-black text-white truncate">
            {destination ? `Vers ${destAddressLabel ?? destination}` : 'Vers où ?'}
          </span>
          <DriveChevronRight size={18} className="text-slate-400 shrink-0" />
        </button>
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
        <div className="sheet-glass sheet-up h-full overflow-y-auto overscroll-contain rounded-t-[28px] sm:rounded-[28px] shadow-2xl shadow-black/60 pb-[calc(84px+env(safe-area-inset-bottom))] sm:pb-0">
          {/* v2.51 — bas réservé pour la navigation basse (mobile) :
              le bouton Commander reste atteignable au-dessus de la
              barre ; sur écran large (barre masquée), pas de marge. */}
          {/* Poignée draggable + bouton chevron (façon Uber) : la poignée
              se glisse au doigt, le chevron — toujours visible, à droite
              de la poignée — replie / déplie la feuille cran par cran.
              Les deux sont des boutons frères (jamais imbriqués) pour que
              le tap sur le chevron ne déclenche pas un glisser. */}
          <div className="relative">
            <button
              type="button"
              className="sheet-handle touch-none w-full pt-3.5 pb-2.5 flex justify-center"
              onPointerDown={onHandlePointerDown}
              onClick={onHandleClick}
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
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-night-800/90 backdrop-blur border border-white/15 shadow-lg shadow-black/40 hover:border-sarcelle/60 active:scale-90 transition-all"
              aria-label={atFull ? 'Replier la feuille' : 'Déplier la feuille'}
            >
              {atFull ? (
                <DriveChevronDown size={18} className="text-sarcelle" />
              ) : (
                <DriveChevronUp size={18} className="text-sarcelle" />
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
              <DriveChevronUp size={20} className="text-sarcelle" />
            </button>
          )}

          {error && !isMini && (
            <div className="mx-4 mt-2 flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold rounded-2xl p-3">
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} aria-label="Fermer le message">
                <DriveX size={16} />
              </button>
            </div>
          )}

          {/* Accueil chauffeur (v2.3) : écran distinct — pas de formulaire
              de commande, pas de pastilles de tarifs. */}
          {phase === 'idle' && !isMini && isChauffeurMode && profile && (
            <DriverHome profile={profile} />
          )}

          {phase === 'idle' && !isMini && (!isChauffeurMode || !profile) && !adjusting && (
            <div className="sheet-phase-in p-4 sm:p-5 pt-1 space-y-4">
              <h1 className="text-xl font-black text-white leading-tight">
                Où allez-vous ?
              </h1>

              {/* Deux grandes cartes (v2.51, façon Bolt — en mieux :
                  verre nuit à liseré avec voitures dessinées Drive
                  et faisceau, langage v2.52). « Trajets » ouvre la
                  recherche de destination ; « Trajets planifiés »
                  est la vraie entrée vers les courses planifiées
                  (v2.30) : elle active le mode planification et
                  affiche le nombre RÉEL de courses planifiées quand
                  l'utilisateur est connecté — sinon pas de chiffre
                  inventé (le nombre vient de `app/page.tsx`). */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={openDestinationSearch}
                  className="drive-card rounded-[2rem] border border-white/10 p-3 pt-4 flex flex-col items-center gap-1.5 hover:border-rose-500/50 active:scale-[0.98] transition-all"
                  aria-label="Trajets — commander une course"
                >
                  <SedanIllustration className="w-20 h-auto" />
                  <span className="text-sm font-black text-white">Trajets</span>
                  <span className="text-xs font-bold text-slate-400">Allons-y</span>
                </button>
                <button
                  type="button"
                  onClick={activatePlanMode}
                  className="drive-card rounded-[2rem] border border-white/10 p-3 pt-4 flex flex-col items-center gap-1.5 hover:border-brand-500/60 active:scale-[0.98] transition-all"
                  aria-label="Trajets planifiés — réserver à l'avance"
                >
                  <span className="relative inline-flex">
                    <SedanIllustration className="w-20 h-auto" />
                    <span className="absolute -top-1 -right-2 w-7 h-7 rounded-full bg-brand-500 border-2 border-night-900 flex items-center justify-center shadow-lg shadow-brand-500/40">
                      <DriveCalendar size={14} className="text-white" />
                    </span>
                  </span>
                  <span className="text-sm font-black text-white">Trajets planifiés</span>
                  <span className="text-xs font-bold text-slate-400">
                    {scheduledCount !== null && scheduledCount !== undefined
                      ? scheduledCount > 0
                        ? `${scheduledCount} planifiée${scheduledCount > 1 ? 's' : ''}`
                        : 'Aucune pour le moment'
                      : 'Réserver à l’avance'}
                  </span>
                </button>
              </div>
              {scheduledCount !== null && scheduledCount !== undefined && scheduledCount > 0 && (
                <Link
                  href="/activite"
                  className="inline-flex items-center gap-1 text-xs font-black text-sarcelle hover:underline active:scale-95 transition-all"
                >
                  Voir mes courses planifiées →
                </Link>
              )}

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
                    icon={<DriveNavigation size={18} className="text-sarcelle shrink-0" />}
                    action={
                      <span className="inline-flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={handleLocate}
                          disabled={locating}
                          className="inline-flex items-center gap-1.5 shrink-0 text-xs font-black text-night-900 bg-sarcelle px-3 py-2 rounded-full hover:bg-emerald-300 active:scale-95 transition-all disabled:opacity-60"
                        >
                          {locating ? (
                            <LogoLoader size={18} />
                          ) : (
                            <DriveLocate size={14} />
                          )}
                          {locating ? 'Localisation…' : 'Me localiser'}
                        </button>
                        {/* v2.47 — préciser le point sur la carte
                            (épingle) : la géolocalisation est souvent
                            imprécise, le point exact se règle à la
                            main. */}
                        {pickup !== '' && (
                          <button
                            type="button"
                            onClick={() => openAdjust('pickup')}
                            className="inline-flex items-center gap-1.5 shrink-0 text-xs font-black text-white bg-white/10 border border-white/15 px-3 py-2 rounded-full hover:bg-white/20 active:scale-95 transition-all"
                          >
                            <DriveMove size={14} /> Préciser
                          </button>
                        )}
                      </span>
                    }
                  />
                </div>
                {/* v2.47 — adresse du point de départ : rue résolue
                    (serveur), sinon quartier, sinon coordonnées +
                    quartier — jamais une adresse inventée. Squelette
                    pendant la résolution (règle n°1), pas de spinner
                    brut. */}
                {pickup !== '' && pickupAddressLabel && (
                  <div className="px-1 space-y-1">
                    <p className="text-xs font-bold text-sarcelle flex items-center gap-1">
                      <DrivePin size={12} className="shrink-0" />
                      {pickupPointSource !== 'neighborhood' &&
                      (pickupResolved.resolving || mapMoving) ? (
                        <LogoLoader size={18} />
                      ) : (
                        <span className="min-w-0 truncate">{pickupAddressLabel}</span>
                      )}
                    </p>
                    {/* Adresse introuvable : on dit quoi faire (le
                        quartier reste affiché) + réessai réel. */}
                    {pickupPointSource !== 'neighborhood' &&
                      !pickupResolved.resolving &&
                      pickupResolved.attempted &&
                      pickupResolved.address === null && (
                        <p className="text-xs text-slate-400">
                          Adresse non trouvée pour ce point — le quartier reste affiché.{' '}
                          <button
                            type="button"
                            onClick={() => setGeoRetryKey((k) => k + 1)}
                            className="font-black text-sarcelle hover:underline active:scale-95 transition-all"
                          >
                            Réessayer
                          </button>
                        </p>
                      )}
                    {/* GPS imprécis : on le dit, et on propose
                        l'épingle — pas de commande sur une position
                        fausse. */}
                    {gpsImprecise && (
                      <p className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
                        <DriveAlert size={14} className="shrink-0" />
                        <span className="flex-1">
                          Position approximative (±{gpsAccuracyM} m) — déplace l’épingle pour
                          préciser ton point.
                        </span>
                        <button
                          type="button"
                          onClick={() => openAdjust('pickup')}
                          className="shrink-0 font-black underline hover:text-amber-200 active:scale-95 transition-all"
                        >
                          Préciser
                        </button>
                      </p>
                    )}
                  </div>
                )}
                {geoError && (
                  <p className="text-xs font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                    {geoError}{' '}
                    {gpsFailed && (
                      <button
                        type="button"
                        onClick={handleLocate}
                        disabled={locating}
                        className="font-black underline hover:text-red-200 active:scale-95 transition-all disabled:opacity-60"
                      >
                        Réessayer
                      </button>
                    )}
                  </p>
                )}
                {/* Destination (v2.47, B) : recherche par lieu — nom ou
                    catégorie (« pharmacie », « L'Emir », « Glass ») —
                    sur les lieux de la carte + les quartiers, avec
                    distance et temps depuis le départ. Choisir un
                    résultat déplace l'épingle dessus. La liste
                    complète des quartiers reste disponible sans
                    requête. */}
                <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-3">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Destination
                    </p>
                    {/* v2.54 — « Préciser » à côté du champ, comme le
                        départ (même style, même endroit logique) :
                        l'ancien bouton sous la recherche était sous
                        le pli aux crans 30 et 58 — le propriétaire
                        ne l'avait jamais vu. */}
                    <span className="inline-flex items-center gap-1.5 shrink-0">
                      {destination !== '' && (
                        <button
                          type="button"
                          onClick={() => openAdjust('destination')}
                          className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-white/10 border border-white/15 px-3 py-1.5 rounded-full hover:bg-white/20 active:scale-95 transition-all"
                        >
                          <DriveMove size={13} /> Préciser
                        </button>
                      )}
                      {/* « Plus tard » (v2.51, façon Bolt) : active le
                          mode planification existant (v2.30) et met le
                          focus sur le champ date/heure. */}
                      <button
                        type="button"
                        onClick={activatePlanMode}
                        className="inline-flex items-center gap-1.5 text-xs font-black text-night-900 bg-white px-3 py-1.5 rounded-full hover:bg-slate-200 active:scale-95 transition-all"
                      >
                        <DriveCalendar size={13} /> Plus tard
                      </button>
                    </span>
                  </div>
                  {/* v2.54 — adresse approximative : le point est le
                      centre du quartier (source 'neighborhood'), pas
                      un point exact — on le dit, comme la bannière
                      GPS imprécis côté départ, et on propose
                      l'épingle. Placée juste sous l'en-tête (avant
                      la recherche) pour être visible dès le cran 58
                      sans scroller — sous la recherche, la liste des
                      quartiers la poussait sous le pli. La bannière
                      disparaît dès que le point devient exact
                      (épingle ou lieu choisi). */}
                  {destination !== '' && destPointSource === 'neighborhood' && (
                    <p className="mb-2 text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
                      <DriveAlert size={14} className="shrink-0" />
                      <span className="flex-1">
                        Adresse approximative — c’est le centre du quartier. Déplace l’épingle
                        pour préciser le point exact.
                      </span>
                      <button
                        type="button"
                        onClick={() => openAdjust('destination')}
                        className="shrink-0 font-black underline hover:text-amber-200 active:scale-95 transition-all"
                      >
                        Préciser
                      </button>
                    </p>
                  )}
                  <DestinationSearch
                    origin={pickupCoords ?? (userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null)}
                    favorites={favoritePlaces}
                    currentDestinationLabel={destAddressLabel}
                    currentDestinationNeighborhood={destination}
                    onSelectPlace={selectDestinationPlace}
                    onSelectNeighborhood={(n) => {
                      handleDestinationChange(n);
                      const c = NEIGHBORHOOD_COORDS[n];
                      focusNonceRef.current += 1;
                      setFocusPoint({ lat: c.lat, lng: c.lng, zoom: 14, nonce: focusNonceRef.current });
                    }}
                    onClearDestination={() => {
                      setDestination('');
                      setDestExact(null);
                      setDestPointSource('neighborhood');
                      setDestAddress(null);
                    }}
                    onFocusInput={() => setSheetH(58)}
                    focusKey={focusDestinationNonce}
                    onSetPickup={handlePickupChange}
                    onSetDestination={handleDestinationChange}
                  />
                  {/* Adresse de la destination résolue : squelette
                      pendant la résolution, repli coordonnées +
                      quartier si introuvable. */}
                  {destination !== '' && destPointSource !== 'neighborhood' && (
                    <p className="mt-2 text-xs font-bold text-sarcelle flex items-center gap-1">
                      <DrivePin size={12} className="shrink-0" />
                      {destResolved.resolving || mapMoving ? (
                        <LogoLoader size={18} />
                      ) : (
                        <span className="min-w-0 truncate">{destAddressLabel}</span>
                      )}
                    </p>
                  )}
                  {destination !== '' &&
                    destPointSource !== 'neighborhood' &&
                    !destResolved.resolving &&
                    destResolved.attempted &&
                    destResolved.address === null &&
                    destPointSource !== 'place' && (
                      <p className="mt-1 text-xs text-slate-400">
                        Adresse non trouvée pour ce point — le quartier reste affiché.{' '}
                        <button
                          type="button"
                          onClick={() => setGeoRetryKey((k) => k + 1)}
                          className="font-black text-sarcelle hover:underline active:scale-95 transition-all"
                        >
                          Réessayer
                        </button>
                      </p>
                    )}
                </div>
                {/* Accès difficile (v2.6) : la route bitumée s'arrête au
                    point de dépôt — le passager choisit d'y descendre ou
                    de demander la piste (+ supplément). Le chauffeur
                    reste libre d'accepter ou non la piste. */}
                {destDifficult && destDropOff && (
                  <div className="bg-corail/10 border border-corail/40 rounded-2xl p-3.5 space-y-2.5">
                    <p className="text-sm font-bold text-corail flex items-start gap-1.5">
                      <DrivePin size={15} className="shrink-0 mt-0.5" />
                      Accès difficile : la route bitumée s’arrête à {destDropOff}. La course
                      s’y termine par défaut.
                    </p>
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={unpavedRoad}
                        onChange={(e) => setUnpavedRoad(e.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF4D8D]"
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
                  ou la destination. v2.48 : chaque lieu affiche son
                  temps de trajet estimé (OSRM, vrai calcul depuis le
                  point de départ courant — repli à vol d'oiseau si
                  OSRM ne répond pas ; sans départ connu, pas de
                  chiffre inventé). */}
              {profile && favoritePlaces.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Mes lieux
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {favoritePlaces.map((f) => (
                      <FavoritePlaceRow
                        key={f.key}
                        place={f}
                        origin={
                          pickupCoords ??
                          (userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null)
                        }
                        onSetPickup={handlePickupChange}
                        onSetDestination={handleDestinationChange}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Adresses récentes (v2.51, façon Bolt — historique
                  RÉEL, `lib/rides.ts`) : sous les lieux enregistrés,
                  avec ETA routière réelle depuis le départ courant
                  (même pattern que les lieux favoris — OSRM, repli
                  à vol d'oiseau, rien sans départ connu). 1 tap =
                  définir comme destination. Déconnecté ou sans
                  historique : section masquée, jamais inventée. */}
              {recentDestinations && recentDestinations.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    Récentes
                  </p>
                  <ul className="divide-y divide-white/5">
                    {recentDestinations.map((r) => (
                      <li key={r.address ?? `quartier:${r.neighborhood}`}>
                        <RecentDestinationRow
                          destination={r}
                          origin={
                            pickupCoords ??
                            (userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : null)
                          }
                          onSelect={selectRecentDestination}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Trajets fréquents — raccourcis d'itinéraire, SANS prix :
                  la plateforme ne définit aucun tarif fixe (v2.11). */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1">
                  <DriveShield size={13} className="text-sarcelle" /> Trajets fréquents — estimation indicative, prix figé une fois accepté
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
                      className="text-xs font-bold bg-sarcelle/10 border border-sarcelle/30 text-sarcelle px-3 py-1.5 rounded-full hover:bg-sarcelle/20 active:scale-95 transition-all"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

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
                      className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white focus:border-sarcelle focus:outline-none"
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

              {/* Classes de course (v2.48) : grandes cartes visuelles
                  Solo / Groupe / Confort, illustrations Drive (SVG) —
                  les montants affichés sont des estimations
                  indicatives, pas des prix (v2.11). */}
              <RideClassCards
                rideType={rideType}
                comfort={comfort}
                onSelect={(t, c) => {
                  setRideType(t);
                  setComfort(c);
                }}
                estimateGroupePrice={validTrip ? estimateGroupe?.price ?? null : null}
                estimateSoloPrice={validTrip ? estimateSolo?.price ?? null : null}
                estimating={estimating}
                validTrip={validTrip}
                nearestEta={nearestEta}
              />

              {/* Véhicule + places + paiement */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 w-full">
                  Véhicule
                </span>
                {(
                  [
                    { value: 'tous', label: 'Tous', icon: FilterCarIcon },
                    { value: 'voiture', label: 'Voiture', icon: FilterCarIcon },
                    { value: 'moto', label: 'Moto', icon: FilterMotoIcon },
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
                          ? 'border-sarcelle bg-sarcelle/10 text-sarcelle'
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
                  className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white focus:border-sarcelle focus:outline-none"
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
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm font-bold text-white placeholder:text-slate-500 placeholder:font-normal focus:border-sarcelle focus:outline-none"
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
                        par la route (OSRM) — la MÊME route que le
                        prix depuis la v2.50. Repli OSRM indisponible
                        (v2.50) : distance à vol d'oiseau, estimation
                        marquée approximative. */}
                    {roadRoute && roadRoute.source === 'osrm' && (
                      <p className="text-xs font-bold text-sarcelle mt-0.5">
                        Par la route : ~{roadRoute.durationMin} min ·{' '}
                        {roadRoute.distanceKm.toFixed(1).replace('.', ',')} km
                      </p>
                    )}
                    {serverEstimate?.approximate && (
                      <p className="text-xs font-bold text-sunset mt-0.5">
                        Estimation approximative — itinéraire routier indisponible pour le moment.
                      </p>
                    )}
                    <p className="text-xs text-slate-500 mt-0.5">
                      Ce n’est pas le prix de la course : les chauffeurs proposent leur prix, tu choisis — le prix accepté est figé.
                    </p>
                  </div>
                  <span className="text-right text-xs font-bold text-sarcelle">
                    Prix figé
                    <br />
                    une fois accepté
                  </span>
                </div>
              )}

              {/* Estimation indisponible (v2.50) : la route API est
                  injoignable et aucune estimation précédente à
                  garder — on le dit, on n'invente pas de prix, et
                  le bouton Commander reste désactivé. */}
              {validTrip && !estimate && !estimating && estimateUnavailable && (
                <div className="bg-white/5 border border-sunset/40 rounded-2xl p-3.5 rise-in">
                  <p className="text-sm font-bold text-white">Estimation indisponible pour le moment</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Le calcul du prix n’a pas répondu — vérifie ta connexion et réessaie dans un instant.
                  </p>
                </div>
              )}

              {/* Feuille récapitulative (v2.47, E) : le trajet tel qu'il
                  partira — départ et destination exacts (adresses
                  résolues, pas les centres de quartiers), durée
                  routière, classe choisie, estimation indicative.
                  Des vraies données, pas un résumé décoratif. */}
              {validTrip && estimate && (
                <div className="bg-white/5 border border-white/10 rounded-2xl px-3.5 py-3 flex items-center gap-3">
                  <span className="shrink-0 w-9 h-9 rounded-full bg-corail/15 border border-corail/30 flex items-center justify-center">
                    <DrivePin size={16} className="text-corail" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {pickupAddressLabel ?? pickup} → {destAddressLabel ?? destination}
                    </p>
                    <p className="text-xs text-slate-400">
                      ~{roadRoute?.durationMin ?? estimate.durationMin} min ·{' '}
                      {rideType === 'groupe'
                        ? 'Groupe · 1 place'
                        : comfort
                          ? 'Solo · Confort'
                          : 'Solo · véhicule entier'}
                      {vehiclePref === 'moto' ? ' · Moto' : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-black text-white">
                    {formatFcfa(estimate.price)}
                  </span>
                </div>
              )}

              {/* Course planifiée (v2.30) : la demande part aux
                  chauffeurs ~15 min avant l'heure prévue ; annulable
                  avant l'envoi dans Activité. */}
              {scheduledDone && (
                <p role="status" className="text-sm font-bold text-green-300 bg-green-500/10 border border-green-500/30 rounded-2xl px-3.5 py-2.5">
                  Course planifiée — ta demande partira aux chauffeurs proches ~15 min avant l’heure
                  prévue.{' '}
                  <Link href="/activite" className="underline hover:text-green-200">
                    Voir dans Activité →
                  </Link>
                </p>
              )}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#FF4D8D]"
                  />
                  <span className="text-sm text-slate-200 leading-snug">
                    <span className="font-black text-white flex items-center gap-1.5">
                      <DriveClock size={15} className="text-corail shrink-0" /> Planifier pour plus tard
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
                      ref={scheduledAtRef}
                      type="datetime-local"
                      required
                      value={scheduledAt}
                      min={toLocalInputValue(new Date(Date.now() + 30 * 60 * 1000))}
                      max={toLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}
                      onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/20 text-white text-sm font-bold focus:border-corail focus:outline-none [color-scheme:dark]"
                    />
                  </div>
                )}
              </div>

              {/* État vide (v2.47, E) : aucun chauffeur autour au moment
                  de commander — ce n'est pas une impasse : la demande
                  part quand même et s'élargit toute seule, ou on
                  planifie pour plus tard. */}
              {validTrip && driversNearPickup === 0 && !scheduleEnabled && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-2">
                  <p className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <DriveAlert size={15} className="shrink-0" />
                    Aucun chauffeur autour pour l’instant
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Ta demande partira quand même — si personne ne répond dans les 30 premières
                    secondes, la recherche s’élargit toute seule. Tu peux aussi planifier ta
                    course pour plus tard.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleEnabled(true);
                      window.setTimeout(() => scheduledAtRef.current?.focus(), 100);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-white/10 border border-white/15 px-3 py-2 rounded-full hover:bg-white/20 active:scale-95 transition-all"
                  >
                    <DriveClock size={14} /> Planifier pour plus tard
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={!validTrip || !estimate || busy || isChauffeurMode}
                onClick={commander}
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 text-white font-black text-lg py-4 rounded-full shadow-lg shadow-brand-500/40 hover:bg-brand-400 active:scale-[0.98] transition-all disabled:opacity-40"
              >
                {busy ? (
                  <>
                    <LogoLoader size={20} /> Envoi…
                  </>
                ) : !user ? (
                  'Se connecter pour commander'
                ) : scheduleEnabled ? (
                  'Planifier ma course'
                ) : (
                  'Commander'
                )}
              </button>

              {/* Compléter ton profil (v2.49) : indicateur RÉEL — photo
                  + téléphone (X/2). Visible seulement tant que le
                  profil est incomplet ; disparaît quand tout est en
                  place. Sans la migration v2.49a, hasPhoto reste
                  inconnu et la ligne est masquée (jamais de chiffre
                  inventé). */}
              {hasPhoto !== null && profile?.role === 'passager' && (hasPhoto ? 1 : 0) + (profile.phone ? 1 : 0) < 2 && (
                <Link
                  href="/compte"
                  className="block bg-white/5 border border-white/10 rounded-2xl p-3.5 active:scale-[0.98] transition-transform"
                >
                  <span className="flex items-center justify-between text-xs">
                    <span className="font-black text-white">
                      Compléter ton profil — {(hasPhoto ? 1 : 0) + (profile.phone ? 1 : 0)}/2
                    </span>
                    <DriveChevronRight size={15} className="text-slate-400" />
                  </span>
                  <span className="mt-2 block h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <span
                      className="block h-full bg-rose-500 rounded-full transition-all duration-500"
                      style={{ width: `${(((hasPhoto ? 1 : 0) + (profile.phone ? 1 : 0)) / 2) * 100}%` }}
                    />
                  </span>
                  <span className="mt-1.5 block text-[11px] text-slate-400">
                    {profile.phone
                      ? 'Ajoute ta photo — ton chauffeur te reconnaîtra plus vite.'
                      : 'Ajoute ton téléphone et ta photo — ton chauffeur te reconnaîtra plus vite.'}
                  </span>
                </Link>
              )}

              {/* Ta sécurité (v2.47, F) : les outils existants, visibles
                  dès l'accueil — SOS, contacts de confiance, aide.
                  Que des liens réels, rien d'inventé : à chaque course,
                  ton lien de suivi part automatiquement à tes contacts
                  de confiance, et ton code PIN à 4 chiffres s'affiche
                  dès que ton chauffeur est trouvé. */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                  <DriveShield size={13} className="text-sarcelle" /> Ta sécurité
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <a
                    href="tel:112"
                    className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-red-500/20 border border-red-500/40 px-3 py-2 rounded-full hover:bg-red-500/30 active:scale-95 transition-all"
                  >
                    SOS · 112
                  </a>
                  <Link
                    href="/compte"
                    className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-white/10 border border-white/15 px-3 py-2 rounded-full hover:bg-white/20 active:scale-95 transition-all"
                  >
                    Mes contacts de confiance
                  </Link>
                  <Link
                    href="/aide"
                    className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-white/10 border border-white/15 px-3 py-2 rounded-full hover:bg-white/20 active:scale-95 transition-all"
                  >
                    Aide & questions
                  </Link>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 text-center">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('stacks-drive:open-tuto-passager'))}
                  className="underline hover:text-sarcelle font-bold"
                >
                  Revoir le tutoriel
                </button>
                {' · '}
                <Link href="/a-propos" className="underline hover:text-sarcelle">
                  Comment ça marche
                </Link>
                {' · '}
                <Link href="/cgu" className="underline hover:text-sarcelle">CGU</Link>
                {' · '}
                <Link href="/mentions-legales" className="underline hover:text-sarcelle">Mentions légales</Link>
                {' · '}
                <Link href="/cookies" className="underline hover:text-sarcelle">Cookies</Link>
                {' · '}
                <span>© OpenStreetMap</span>
              </p>

              {/* Côté chauffeur : uniquement pour ceux que ça intéresse. */}
              {!isChauffeurMode && (
                <Link href="/devenir-chauffeur" className="block bg-white/[0.03] border border-white/10 rounded-2xl p-4 hover:border-sarcelle/40 transition-colors">
                  <p className="font-black text-white text-sm flex items-center gap-2">
                    <DriveCarMini variant="sedan" size={18} tone="light" /> Vous avez une voiture ?
                  </p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Conduisez quand vous voulez. Opter pour la liberté financière, à votre rythme.
                  </p>
                  <span className="inline-flex items-center gap-1.5 mt-2 text-sm font-black text-sarcelle">
                    Devenir chauffeur <DriveChevronRight size={15} />
                  </span>
                </Link>
              )}
            </div>
          )}

          {/* Ajustement à l'épingle (v2.47) : la feuille se replie et
              laisse la carte parler — l'épingle fixe au centre est le
              point exact. Glisse la carte dessous, ou glisse
              l'épingle elle-même. L'adresse se résout en direct
              (squelette pendant la résolution) ; hors zone, on le dit
              et la confirmation remet le dernier point valide. */}
          {phase === 'idle' && !isMini && (!isChauffeurMode || !profile) && adjusting && (
            <div className="sheet-phase-in p-4 sm:p-5 pt-1 space-y-4">
              <h2 className="text-lg font-black text-white leading-tight flex items-center gap-2">
                <DriveMove size={18} className="text-corail shrink-0" />
                {adjusting === 'pickup' ? 'Précise ton point de départ' : 'Précise ta destination'}
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Glisse la carte sous l’épingle, ou glisse l’épingle elle-même — le point exact
                est sous sa pointe.
              </p>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 space-y-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {adjusting === 'pickup' ? 'Point de départ' : 'Destination'}
                </p>
                <p className="text-sm font-bold text-white flex items-center gap-1.5">
                  <DrivePin size={15} className="text-corail shrink-0" />
                  {(adjusting === 'pickup' ? pickupResolved.resolving : destResolved.resolving) ||
                  mapMoving ? (
                    <LogoLoader size={18} />
                  ) : (
                    <span className="min-w-0">
                      {adjusting === 'pickup' ? pickupAddressLabel : destAddressLabel}
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  Quartier : {adjusting === 'pickup' ? pickup : destination}
                </p>
                {adjustingPointOutOfZone && (
                  <p className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
                    <DriveAlert size={14} className="shrink-0" />
                    Hors zone — Stacks Drive est à Libreville pour l’instant. Ramène l’épingle
                    dans la zone, ou confirme : on te remettra sur ton dernier point valide.
                  </p>
                )}
              </div>
              {/* Estimation en direct sur le point précis (même modèle
                  — la distance change, pas les règles). */}
              {estimate && validTrip && (
                <p className="text-sm text-slate-300">
                  Estimation indicative :{' '}
                  <span className="font-black text-white">{formatFcfa(estimate.price)}</span>
                  {' · ~'}
                  {roadRoute?.durationMin ?? estimate.durationMin} min ·{' '}
                  {roadRoute
                    ? `${roadRoute.distanceKm.toFixed(1).replace('.', ',')} km`
                    : `${estimate.distanceKm.toFixed(1).replace('.', ',')} km`}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={confirmAdjust}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-rose-500 text-night-900 font-black text-base py-3.5 rounded-full shadow-lg shadow-rose-500/40 hover:bg-rose-300 active:scale-[0.98] transition-all"
                >
                  <DriveCheck size={18} /> Confirmer ce point
                </button>
                <button
                  type="button"
                  onClick={cancelAdjust}
                  className="inline-flex items-center justify-center gap-2 bg-white/10 text-white font-black text-base px-5 py-3.5 rounded-full hover:bg-white/15 active:scale-[0.98] transition-all"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {(phase === 'searching' || phase === 'proposals') && (
            <div className="sheet-phase-in p-4 sm:p-5 pt-1 space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white flex items-center justify-center gap-2">
                  Recherche de chauffeurs
                  <span aria-hidden className="inline-flex gap-1">
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-sarcelle inline-block" />
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-sarcelle inline-block" />
                    <span className="search-dot w-1.5 h-1.5 rounded-full bg-sarcelle inline-block" />
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
                {/* État vide (v2.47, E) : aucun chauffeur après 30 s —
                    ce n'est pas une impasse. La recherche s'est
                    élargie à {DISPATCH_WIDENED_RADIUS_KM} km et
                    continue — un chauffeur peut encore répondre. Si
                    personne ne répond, on planifie pour plus tard
                    (la demande partira toute seule ~15 min avant
                    l'heure choisie) ou on annule. */}
                {widened && (
                  <div className="bg-corail/10 border border-corail/30 rounded-2xl p-3.5 space-y-2 text-left">
                    <p className="text-sm font-bold text-corail">
                      Aucun chauffeur autour pour l’instant
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      La recherche continue autour de toi — un chauffeur peut encore répondre. Si
                      personne ne répond, planifie ta course pour plus tard : ta demande partira
                      automatiquement ~15 min avant l’heure choisie.
                    </p>
                    <button
                      type="button"
                      onClick={planLaterFromSearch}
                      disabled={busy}
                      className="inline-flex items-center gap-1.5 text-xs font-black text-white bg-white/10 border border-white/15 px-3 py-2 rounded-full hover:bg-white/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      <DriveClock size={14} /> Planifier pour plus tard
                    </button>
                  </div>
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
                  {/* Animation néon (v2.52) : pendant l'attente des
                      propositions des chauffeurs, la voiture néon
                      (arc qui balaie + barre qui se remplit) — les
                      prix apparaissent avec les propositions. */}
                  <NeonSearchLoader width={300} className="mx-auto" />
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
                {busy && <LogoLoader size={18} />}
                {busy ? 'Annulation…' : 'Annuler la demande'}
              </button>
            </div>
          )}

          {phase === 'confirmed' && acceptedRide && acceptedDriver && (
            <div className="sheet-phase-in p-4 sm:p-5 pt-1 space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-lg font-black text-white">
                  {acceptedRide.status === 'en_cours' ? 'Course en cours — bon trajet !' : 'Ton chauffeur arrive !'}
                </h2>
                <p className="text-sm text-slate-400">
                  {acceptedRide.pickup} → {acceptedRide.destination} ·{' '}
                  {acceptedRide.rideType === 'groupe' ? 'Groupe' : 'Solo'}
                  {acceptedRide.firstStop ? ` · 1er arrêt : ${acceptedRide.firstStop}` : ''}
                  {acceptedRide.dropOffPoint && acceptedRide.unpavedAccepted === false && (
                    <span className="block text-corail font-bold">
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
                className="w-full text-sm font-bold text-sarcelle hover:underline"
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
                  className="inline-block bg-rose-500 text-night-900 font-black px-6 py-3.5 rounded-full shadow-md shadow-rose-500/30 hover:bg-rose-300 transition-colors"
                >
                  Noter mon chauffeur
                </Link>
              )}
              <button
                type="button"
                onClick={resetToIdle}
                className="block w-full text-sm font-bold text-sarcelle hover:underline"
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
          fine barre du bas. Rose « Nuit violette », chevron sarcelle. */}
      {isMini && (
        <button
          type="button"
          onClick={() => setSheetH(58)}
          className="absolute right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-night-950 shadow-2xl shadow-black/50 hover:bg-rose-300 active:scale-90 transition-all"
          style={{ bottom: `calc(${sheetH}dvh + 14px)` }}
          aria-label="Remonter la feuille de demande"
        >
          <DriveChevronUp size={22} />
        </button>
      )}

      {/* Annulation (v2.23, motif optionnel depuis v2.38) : l'autre
          partie est prévenue immédiatement, l'annulation est comptée
          dans la fiabilité. */}
      <CancelRideDialog
        open={cancelOpen}
        role="passager"
        onClose={() => {
          setCancelOpen(false);
          planAfterCancelRef.current = false;
        }}
        onConfirm={confirmerAnnulation}
      />

      {/* Tutoriel passager (v2.21) : une seule fois au premier lancement,
          fermable, rejouable depuis « Mon compte ». Pas d'ouverture auto
          en mode Chauffeur (l'accueil n'est pas l'écran passager). */}
      <PassengerTutorial autoShow isChauffeurMode={isChauffeurMode} />
    </div>
  );
}
