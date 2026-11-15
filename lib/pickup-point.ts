/** Point de trajet précis (v2.47 — « pickup précis, inspiré Yango »).
 *
 *  Jusqu'ici, le départ et la destination étaient des QUARTIERS : la
 *  course partait du centre du quartier, et l'estimation était calculée
 *  sur la distance entre ces deux centres. La géolocalisation brute
 *  est souvent imprécise (plusieurs dizaines de mètres) : le passager
 *  règle désormais son point exact sur la carte — épingle fixe au
 *  centre, la carte glisse dessous (comme Yango) — et l'adresse est
 *  résolue par géocodage inverse.
 *
 *  Le quartier RESTE la référence du trajet (enregistrement de la
 *  course, dispatch, suppléments) : le point précis affine le départ
 *  et l'arrivée à l'intérieur du quartier, il ne les remplace pas.
 *  L'estimation est recalculée sur les coordonnées exactes — distance
 *  à vol d'oiseau entre les deux points (même modèle au km, ADR 0010 :
 *  le prix ne dépend jamais d'OSRM, service démo non garanti ; la
 *  distance routière OSRM reste affichée et sert au guidage). */

import { useEffect, useRef, useState } from 'react';
import type { Neighborhood } from './neighborhoods';

/** Coordonnées GPS brutes. */
export interface GpsPoint {
  lat: number;
  lng: number;
}

/** Un point de trajet : coordonnées exactes + quartier de rattachement
 *  + adresse résolue (null tant que le géocodage n'a pas abouti —
 *  l'appelant affiche alors les coordonnées + le quartier, jamais
 *  une adresse inventée). */
export interface TripPoint extends GpsPoint {
  /** Quartier de rattachement (le plus proche du point). */
  neighborhood: Neighborhood;
  /** Adresse résolue (« Rue du Bord de mer, Centre-ville ») ou null. */
  address: string | null;
  /** D'où vient ce point : GPS, centre de quartier, épingle déplacée
   *  sur la carte, lieu choisi dans la recherche. */
  source: 'gps' | 'neighborhood' | 'pin' | 'place';
}

/** Seuil de précision GPS (v2.47) : au-delà de 50 m, la position est
 *  « approximative » — on le dit au passager et on ouvre directement
 *  l'épingle pour qu'il précise son point de départ. */
export const GPS_ACCURACY_WARN_M = 50;

/** Libellé de repli quand l'adresse n'est pas résolue : coordonnées +
 *  quartier — jamais une adresse inventée. Ex. « 0,3901° N, 9,4544°
 *  E — Centre-ville ». */
export function formatPointFallback(lat: number, lng: number, neighborhood: Neighborhood): string {
  const fmt = (n: number) => Math.abs(n).toFixed(4).replace('.', ',');
  const latLabel = `${fmt(lat)}° ${lat >= 0 ? 'N' : 'S'}`;
  const lngLabel = `${fmt(lng)}° ${lng >= 0 ? 'E' : 'O'}`;
  return `${latLabel}, ${lngLabel} — ${neighborhood}`;
}

/** Réponse de la route `/api/reverse-geocode` (proxy Nominatim, repli
 *  Photon — voir ADR 0022). */
export interface ReverseGeocodeResult {
  ok: boolean;
  /** Adresse affichable (« Rue du Bord de mer, Centre-ville ») ou
   *  null si aucun des deux services n'a résolu le point. */
  address: string | null;
  /** Quartier / zone renvoyé par le service (peut différer du
   *  quartier Drive le plus proche — le quartier Drive reste la
   *  référence, celui-ci n'est qu'un libellé). */
  area: string | null;
  /** Service qui a répondu : 'nominatim', 'photon', ou 'none'. */
  source: 'nominatim' | 'photon' | 'none';
}

/** Appel client à la route de géocodage inverse (v2.47) : la clé
 *  n'existe pas (Nominatim / Photon sont gratuits et sans clé), mais
 *  l'appel passe par le serveur — le navigateur ne parle jamais
 *  directement à Nominatim (politique d'usage : 1 req/s, User-Agent
 *  identifiant l'appli — le serveur l'applique). Retourne null si la
 *  route est injoignable : l'appelant affiche le repli coordonnées +
 *  quartier. */
export async function reverseGeocodeViaApi(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    const res = await fetch(`/api/reverse-geocode?${params.toString()}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as ReverseGeocodeResult;
    if (!data || typeof data !== 'object' || data.ok !== true) return null;
    return data;
  } catch {
    return null;
  }
}

/** Délai de debounce du géocodage inverse (v2.47) : on ne résout
 *  l'adresse que 400 ms après le dernier déplacement de l'épingle —
 *  un glisser continu ne martèle pas le service (1 req/s). */
export const REVERSE_GEOCODE_DEBOUNCE_MS = 400;

export interface ReverseGeocodeState {
  /** Adresse résolue (« Rue du Bord de mer, Centre-ville ») ou null
   *  (non résolue — l'appelant affiche le repli coordonnées +
   *  quartier). */
  address: string | null;
  /** Résolution en cours : la feuille affiche un état de chargement
   *  visible (règle n°1 — barre de chargement partout où il y a une
   *  attente), jamais un blanc silencieux. */
  resolving: boolean;
  /** Au moins une tentative a abouti (réussie ou non) : distingue
   *  « pas encore essayé » de « essayé mais introuvable » — le
   *  message « Adresse non trouvée — réessayer » ne s'affiche
   *  qu'après un vrai échec. */
  attempted: boolean;
}

/** Résout l'adresse d'un point, avec debounce (v2.47) : à chaque
 *  déplacement de l'épingle, on attend 400 ms sans bouger avant
 *  d'appeler `/api/reverse-geocode`. `point` null = pas de résolution
 *  (adresse remise à null). La dernière réponse gagne : une réponse
 *  en retard pour un ancien point est ignorée. `retryKey` : quand il
 *  change, la résolution est relancée pour le même point (bouton
 *  « Réessayer » quand l'adresse est introuvable). */
export function useReverseGeocode(point: GpsPoint | null, retryKey = 0): ReverseGeocodeState {
  const [state, setState] = useState<ReverseGeocodeState>({
    address: null,
    resolving: false,
    attempted: false,
  });
  const requestRef = useRef(0);
  const lat = point?.lat ?? null;
  const lng = point?.lng ?? null;

  useEffect(() => {
    if (lat === null || lng === null) {
      requestRef.current += 1;
      setState({ address: null, resolving: false, attempted: false });
      return;
    }
    // Le point bouge (glisser) : on attend, avec l'état de
    // chargement visible dès le premier mouvement.
    setState((cur) => (cur.resolving ? cur : { ...cur, resolving: true }));
    const requestId = ++requestRef.current;
    const timer = window.setTimeout(() => {
      reverseGeocodeViaApi(lat, lng)
        .then((result) => {
          if (requestRef.current !== requestId) return;
          setState({ address: result?.address ?? null, resolving: false, attempted: true });
        })
        .catch(() => {
          if (requestRef.current !== requestId) return;
          setState({ address: null, resolving: false, attempted: true });
        });
    }, REVERSE_GEOCODE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `lat` / `lng` portent le mouvement (nombres, pas l'objet).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, retryKey]);

  return state;
}
