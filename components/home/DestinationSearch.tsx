'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DrivePin, DriveSearch, DriveX } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';
import {
  NEIGHBORHOOD_COORDS,
  SELECTABLE_NEIGHBORHOODS,
  matchesNeighborhoodQuery,
  normalizeSearchText,
  type Neighborhood,
} from '@/lib/neighborhoods';
import { POIS, POI_CATEGORY_LABELS, type Poi } from '@/lib/pois';
import { haversineKm, nearestNeighborhood } from '@/lib/geo';
import { estimateTripFromCoords } from '@/lib/pricing';
import {
  SEARCH_ADDRESS_DEBOUNCE_MS,
  addressTypeLabel,
  searchAddressViaApi,
  type AddressResult,
} from '@/lib/search-address';
import { FavoritePlaceRow, type FavoritePlace } from './FavoritePlaceRow';
import { cn } from '@/lib/utils';

/** Un lieu choisi dans la recherche (v2.47, B) : coordonnées exactes
 *  + quartier de rattachement + libellé + adresse affichable (le nom
 *  du lieu + son quartier — des données réelles, jamais inventées).
 *  Le parent déplace l'épingle dessus et remplit la destination. */
export interface SelectedPlace {
  lat: number;
  lng: number;
  neighborhood: Neighborhood;
  label: string;
  address: string;
}

const MAX_POI_RESULTS = 6;
const MAX_NEIGHBORHOOD_RESULTS = 6;
/** Rues / adresses OSM : le serveur limite déjà à 8. */
const MAX_ADDRESS_RESULTS = 8;

function formatKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Score de pertinence d'un lieu pour une requête : le nom d'abord,
 *  puis la catégorie (« pharmacie » → toutes les pharmacies), puis
 *  le quartier (« Glass » → les lieux de Glass). */
function poiScore(poi: Poi, q: string): number {
  const name = normalizeSearchText(poi.name);
  const category = normalizeSearchText(POI_CATEGORY_LABELS[poi.category] ?? '');
  const area = normalizeSearchText(poi.neighborhood);
  if (name.includes(q)) return 0;
  if (category.includes(q)) return 1;
  if (area.includes(q)) return 2;
  return 3;
}

/** Recherche de destination par lieu (v2.47, B) — la destination
 *  n'est plus seulement un quartier.
 *
 *  On tape un nom, une catégorie (« pharmacie », « L'Emir »,
 *  « Glass ») ou une RUE (« Rue du Bord de mer ») : les résultats
 *  sont catégorisés — lieux (les POI de la carte, données réelles)
 *  puis quartiers, puis rues/adresses OSM (Photon, v2.51) — avec la
 *  distance et le temps depuis le point de départ courant (calculés,
 *  pas inventés). Choisir un résultat déplace l'épingle dessus et
 *  remplit la destination. Sans requête : tes lieux enregistrés
 *  (Maison / Travail, avec leur ETA réelle) puis la liste complète
 *  des quartiers — la sélection par liste reste disponible.
 *
 *  Wording Drive (pas de copie Yango) : le champ dit « Vers où ? »,
 *  la section s'appelle « Mes lieux » (comme dans l'appli).
 *
 *  Clavier mobile : quand le champ prend le focus, le parent monte
 *  la feuille au cran le plus haut pour que les résultats restent
 *  visibles au-dessus du clavier (`onFocusInput`). */
export function DestinationSearch({
  origin,
  favorites,
  currentDestinationLabel,
  currentDestinationNeighborhood,
  onSelectPlace,
  onSelectNeighborhood,
  onClearDestination,
  onFocusInput,
  autoFocus,
  focusKey,
  onSetPickup,
  onSetDestination,
}: {
  /** Point de départ courant (pour les distances/temps) — null = pas
   *  encore connu, les distances sont alors masquées. */
  origin: { lat: number; lng: number } | null;
  favorites: FavoritePlace[];
  /** Destination déjà choisie (affichée en pastille, effaçable). */
  currentDestinationLabel: string | null;
  currentDestinationNeighborhood: Neighborhood | '';
  onSelectPlace: (place: SelectedPlace) => void;
  onSelectNeighborhood: (neighborhood: Neighborhood) => void;
  onClearDestination: () => void;
  /** Le champ prend le focus : le parent monte la feuille. */
  onFocusInput?: () => void;
  autoFocus?: boolean;
  /** Nonce : quand il change, le champ reprend le focus. */
  focusKey?: number;
  onSetPickup: (neighborhood: Neighborhood) => void;
  onSetDestination: (neighborhood: Neighborhood) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Re-focus demandé par le parent (barre flottante « Vers où ? ») :
  // quand le nonce change, le champ reprend le focus (clavier
  // ouvert, résultats visibles). Pas au montage : on ne veut pas
  // ouvrir le clavier à l'arrivée sur la page.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (focusKey === undefined) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    inputRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  const q = normalizeSearchText(query.trim());

  // --- Recherche rue par rue (v2.51) : Photon via le proxy serveur
  //  (`/api/search-address`, bbox Grand Libreville) — debounce 350 ms
  //  après la dernière frappe. Les résultats OSM s'ajoutent APRÈS les
  //  lieux et quartiers locaux (ordre actuel conservé) : n'importe
  //  quelle rue de Libreville tapée au clavier donne un résultat.
  //  `originLat/originLng` (nombres, pas l'objet) portent les
  //  dépendances : l'objet `origin` est recréé à chaque rendu du
  //  parent, il ne doit pas relancer la recherche.
  const originLat = origin?.lat ?? null;
  const originLng = origin?.lng ?? null;
  const [addressResults, setAddressResults] = useState<AddressResult[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressDone, setAddressDone] = useState(false);
  useEffect(() => {
    if (q.length < 2) {
      setAddressResults([]);
      setAddressLoading(false);
      setAddressDone(false);
      return;
    }
    setAddressLoading(true);
    setAddressDone(false);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchAddressViaApi(
        query.trim(),
        originLat !== null && originLng !== null ? { lat: originLat, lng: originLng } : null,
        controller.signal
      )
        .then((res) => {
          if (controller.signal.aborted) return;
          setAddressResults((res?.results ?? []).slice(0, MAX_ADDRESS_RESULTS));
          setAddressLoading(false);
          setAddressDone(true);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // Photon injoignable : les résultats locaux restent — pas
          // d'erreur visible, la recherche n'est jamais bloquée.
          setAddressResults([]);
          setAddressLoading(false);
          setAddressDone(true);
        });
    }, SEARCH_ADDRESS_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, query, originLat, originLng]);

  const poiResults = useMemo(() => {
    if (q.length < 2) return [];
    const scored = POIS.map((poi) => ({ poi, score: poiScore(poi, q) })).filter(
      (s) => s.score < 3
    );
    scored.sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (origin) {
        const da = haversineKm(origin.lat, origin.lng, a.poi.lat, a.poi.lng);
        const db = haversineKm(origin.lat, origin.lng, b.poi.lat, b.poi.lng);
        return da - db;
      }
      return a.poi.name.localeCompare(b.poi.name, 'fr');
    });
    return scored.slice(0, MAX_POI_RESULTS).map((s) => s.poi);
  }, [q, origin]);

  const neighborhoodResults = useMemo(() => {
    if (q.length < 2) return [];
    return SELECTABLE_NEIGHBORHOODS.filter((n) => matchesNeighborhoodQuery(n, query)).slice(
      0,
      MAX_NEIGHBORHOOD_RESULTS
    );
  }, [q, query]);

  const hasQuery = q.length >= 2;
  // Aucun résultat = locaux vides ET rues OSM vides, une fois la
  // recherche d'adresses terminée (pendant son chargement, on ne
  // conclut pas — règle n°1 : l'attente est visible, pas un blanc).
  const noResults =
    hasQuery &&
    addressDone &&
    poiResults.length === 0 &&
    neighborhoodResults.length === 0 &&
    addressResults.length === 0;

  function addressDistanceLabel(a: AddressResult): string | null {
    if (!origin) return null;
    const { distanceKm, durationMin } = estimateTripFromCoords(origin, {
      lat: a.lat,
      lng: a.lng,
    });
    return `${formatKm(distanceKm)} · ~${durationMin} min`;
  }

  function distanceLabel(poi: Poi): string | null {
    if (!origin) return null;
    const { distanceKm, durationMin } = estimateTripFromCoords(origin, {
      lat: poi.lat,
      lng: poi.lng,
    });
    return `${formatKm(distanceKm)} · ~${durationMin} min`;
  }

  function neighborhoodDistanceLabel(n: Neighborhood): string | null {
    if (!origin) return null;
    const c = NEIGHBORHOOD_COORDS[n];
    const { distanceKm, durationMin } = estimateTripFromCoords(origin, c);
    return `${formatKm(distanceKm)} · ~${durationMin} min`;
  }

  return (
    <div className="space-y-2">
      {/* Destination choisie : pastille avec effacement — la
          destination ne se change que par un choix explicite,
          effacer le champ de recherche ne l'efface pas. */}
      {currentDestinationLabel && (
        <div className="flex items-center gap-2 bg-corail/10 border border-corail/30 rounded-2xl px-3 py-2">
          <DrivePin size={15} className="text-corail shrink-0" />
          <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">
            Destination : {currentDestinationLabel}
            {currentDestinationNeighborhood ? ` · ${currentDestinationNeighborhood}` : ''}
          </span>
          <button
            type="button"
            onClick={onClearDestination}
            aria-label="Effacer la destination"
            className="shrink-0 p-1.5 rounded-full bg-white/10 text-slate-300 hover:bg-white/20 active:scale-95 transition-all"
          >
            <DriveX size={14} />
          </button>
        </div>
      )}

      {/* Champ de recherche */}
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-1.5 focus-within:border-sarcelle transition-colors">
        <DriveSearch size={18} className="text-sarcelle shrink-0" />
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => onFocusInput?.()}
          placeholder="Tape un lieu ou un quartier…"
          aria-label="Rechercher une destination"
          className="flex-1 min-w-0 bg-transparent text-sm font-bold text-white placeholder:text-slate-500 placeholder:font-normal py-2 focus:outline-none"
        />
        {query !== '' && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Effacer la recherche"
            className="shrink-0 p-1 rounded-full bg-white/10 text-slate-300 hover:bg-white/20 active:scale-95 transition-all"
          >
            <DriveX size={14} />
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            // « Rechercher » : referme le clavier pour voir les
            // résultats en entier (la recherche est déjà en direct
            // à chaque frappe — le bouton sert à libérer l'écran).
            inputRef.current?.blur();
          }}
          className="shrink-0 px-3 py-2 rounded-full bg-sarcelle text-night-900 text-xs font-black hover:bg-emerald-300 active:scale-95 transition-all"
        >
          Rechercher
        </button>
      </div>

      {/* Mes lieux (sans requête) : Maison / Travail avec ETA réelle. */}
      {!hasQuery && favorites.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Mes lieux
          </p>
          <div className="flex flex-wrap gap-2">
            {favorites.map((f) => (
              <FavoritePlaceRow
                key={f.key}
                place={f}
                origin={origin}
                onSetPickup={onSetPickup}
                onSetDestination={onSetDestination}
              />
            ))}
          </div>
        </div>
      )}

      {/* Résultats : lieux puis quartiers. */}
      {hasQuery && !noResults && (
        <div className="space-y-3 pt-1 max-h-72 overflow-y-auto pr-1">
          {poiResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Lieux
              </p>
              <ul className="divide-y divide-white/5">
                {poiResults.map((poi) => {
                  const d = distanceLabel(poi);
                  return (
                    <li key={poi.id ?? poi.name}>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectPlace({
                            lat: poi.lat,
                            lng: poi.lng,
                            neighborhood: poi.neighborhood,
                            label: poi.name,
                            address: `${poi.name}, ${poi.neighborhood}`,
                          })
                        }
                        className="w-full flex items-center gap-3 py-2.5 text-left active:bg-white/5 rounded-xl px-1 transition-colors"
                      >
                        <span className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                          <DrivePin size={16} className="text-corail" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-white truncate">
                            {poi.name}
                          </span>
                          <span className="block text-xs text-slate-400 truncate">
                            {POI_CATEGORY_LABELS[poi.category]} · {poi.neighborhood}
                            {poi.detail ? ` · ${poi.detail}` : ''}
                          </span>
                        </span>
                        {d && (
                          <span className="shrink-0 text-xs font-black text-sarcelle whitespace-nowrap">
                            {d}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {neighborhoodResults.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Quartiers
              </p>
              <ul className="divide-y divide-white/5">
                {neighborhoodResults.map((n) => {
                  const d = neighborhoodDistanceLabel(n);
                  return (
                    <li key={n}>
                      <button
                        type="button"
                        onClick={() => onSelectNeighborhood(n)}
                        className="w-full flex items-center gap-3 py-2.5 text-left active:bg-white/5 rounded-xl px-1 transition-colors"
                      >
                        <span className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                          <DrivePin size={16} className="text-sarcelle" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-white truncate">{n}</span>
                          <span className="block text-xs text-slate-400">Quartier</span>
                        </span>
                        {d && (
                          <span className="shrink-0 text-xs font-black text-sarcelle whitespace-nowrap">
                            {d}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {/* Rues & adresses OSM (v2.51) : APRÈS les résultats locaux
              — n'importe quelle rue de Libreville. Sélection = point
              exact + quartier Drive le plus proche (haversine sur
              NEIGHBORHOOD_COORDS : c'est ce qui fait passer la
              validation POST /api/rides) + nom de rue en adresse.
              Zéro ambiguïté : type (« Rue » / « Adresse » / « Lieu »)
              + quartier/district OSM affichés — deux rues au même
              nom ne se confondent jamais. */}
          {(addressResults.length > 0 || addressLoading) && (
            <div className="space-y-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                Rues &amp; adresses
                {addressLoading && <LogoLoader size={16} />}
              </p>
              <ul className="divide-y divide-white/5">
                {addressResults.map((a) => {
                  const d = addressDistanceLabel(a);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() =>
                          onSelectPlace({
                            lat: a.lat,
                            lng: a.lng,
                            neighborhood: nearestNeighborhood(a.lat, a.lng).neighborhood,
                            label: a.name,
                            address: a.district ? `${a.name}, ${a.district}` : a.name,
                          })
                        }
                        className="w-full flex items-center gap-3 py-2.5 text-left active:bg-white/5 rounded-xl px-1 transition-colors"
                      >
                        <span className="shrink-0 w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                          <DrivePin size={16} className="text-white" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-white truncate">
                            {a.name}
                          </span>
                          <span className="block text-xs text-slate-400 truncate">
                            {addressTypeLabel(a)}
                            {a.district ? ` · ${a.district}` : a.city ? ` · ${a.city}` : ' · Libreville'}
                            {a.street && a.type !== 'street' ? ` — ${a.street}` : ''}
                          </span>
                        </span>
                        {d && (
                          <span className="shrink-0 text-xs font-black text-sarcelle whitespace-nowrap">
                            {d}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Aucun résultat : on dit quoi faire, pas juste « rien ». */}
      {noResults && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5 text-sm text-slate-300 space-y-2">
          <p className="font-bold text-white">Aucun lieu trouvé pour « {query.trim()} ».</p>
          <p className="text-xs text-slate-400 leading-relaxed">
            Essaie un autre nom, un nom de rue (« Rue du Bord de mer »), ou une catégorie
            (« pharmacie », « marché », « hôtel », « épicerie ») — ou choisis un quartier dans
            la liste ci-dessous.
          </p>
          <button
            type="button"
            onClick={() => setQuery('')}
            className="text-xs font-black text-sarcelle hover:underline active:scale-95 transition-all"
          >
            Voir tous les quartiers →
          </button>
        </div>
      )}

      {/* Sans requête : la liste complète des quartiers (triée,
          comme avant) — la sélection par liste reste disponible. */}
      {!hasQuery && (
        <div className="space-y-1 pt-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Quartiers
          </p>
          <ul className="divide-y divide-white/5 max-h-56 overflow-y-auto pr-1">
            {SELECTABLE_NEIGHBORHOODS.map((n) => {
              const d = neighborhoodDistanceLabel(n);
              const selected = currentDestinationNeighborhood === n;
              return (
                <li key={n}>
                  <button
                    type="button"
                    onClick={() => onSelectNeighborhood(n)}
                    aria-current={selected || undefined}
                    className={cn(
                      'w-full flex items-center gap-3 py-2 text-left active:bg-white/5 rounded-xl px-1 transition-colors',
                      selected && 'bg-corail/10'
                    )}
                  >
                    <span className="flex-1 min-w-0 text-sm font-bold text-white truncate">
                      {n}
                    </span>
                    {d && (
                      <span className="shrink-0 text-xs font-black text-sarcelle whitespace-nowrap">
                        {d}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
