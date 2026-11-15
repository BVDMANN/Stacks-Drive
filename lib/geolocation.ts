/** Géolocalisation du point de départ (« Me localiser »).
 *  - navigator.geolocation (aucune clé, aucune donnée envoyée à Stacks :
 *    la position reste dans le navigateur, elle sert juste à choisir le
 *    quartier de départ et à placer le marqueur « Vous êtes ici »).
 *  - Reverse-geocoding Nominatim (OpenStreetMap, gratuit, sans clé) en
 *    complément best-effort : un nom de rue rend le départ plus parlant.
 *    En cas d'échec, on garde le quartier le plus proche — jamais bloquant. */

export type GeoErrorKind = 'unsupported' | 'denied' | 'unavailable' | 'timeout';

export interface UserPosition {
  lat: number;
  lng: number;
  /** Précision annoncée par le GPS, en mètres (null si inconnue).
   *  v2.47 : au-delà de `GPS_ACCURACY_WARN_M` (50 m), la position est
   *  « approximative » — le passager précise son point avec l'épingle. */
  accuracyM: number | null;
}

const DEFAULT_TIMEOUT_MS = 10000;

/** Position GPS de l'utilisateur (promesse). Rejette avec un GeoErrorKind
 *  typé pour afficher le bon message — jamais d'exception brute. */
export function getUserPosition(timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<UserPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject('unsupported' as GeoErrorKind);
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject('timeout' as GeoErrorKind);
      }
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM:
            typeof pos.coords.accuracy === 'number' && Number.isFinite(pos.coords.accuracy)
              ? Math.round(pos.coords.accuracy)
              : null,
        });
      },
      (err) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (err.code === err.PERMISSION_DENIED) reject('denied' as GeoErrorKind);
        else if (err.code === err.TIMEOUT) reject('timeout' as GeoErrorKind);
        else reject('unavailable' as GeoErrorKind);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}

/** Message clair et actionnable pour chaque cas d'échec. */
export function geoErrorMessage(kind: GeoErrorKind): string {
  switch (kind) {
    case 'denied':
      return 'Géolocalisation refusée — autorise-la dans ton navigateur, ou choisis ton quartier dans la liste.';
    case 'timeout':
      return 'Position introuvable pour le moment — choisis ton quartier dans la liste.';
    case 'unsupported':
      return 'Ton navigateur ne permet pas la géolocalisation — choisis ton quartier dans la liste.';
    case 'unavailable':
    default:
      return 'Position indisponible — choisis ton quartier dans la liste.';
  }
}

/** Nom de lieu lisible via Nominatim (rue + quartier, ex. « Rue du Bord
 *  de mer, Centre-ville »). Best-effort : null en cas d'échec ou de
 *  dépassement de délai — l'appelant garde le quartier le plus proche. */
export async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
  timeoutMs = 5000
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: {
        road?: string;
        suburb?: string;
        neighbourhood?: string;
        city?: string;
        town?: string;
      };
    };
    const road = data.address?.road;
    const area = data.address?.suburb ?? data.address?.neighbourhood ?? data.address?.city ?? data.address?.town;
    if (road && area) return `${road}, ${area}`;
    if (road) return road;
    if (area) return area;
    return null;
  } catch {
    return null;
  }
}

/** Ville + pays d'une position GPS, via Nominatim (v2.32, écran hors
 *  zone). Best-effort : null en cas d'échec — l'e-mail « préviens-moi »
 *  est enregistré sans ville ni pays plutôt que bloqué. Seuls la ville
 *  et le pays sont renvoyés : jamais de coordonnées précises, jamais
 *  d'adresse — c'est tout ce qui est conservé côté serveur. */
export async function reverseGeocodeCityCountry(
  lat: number,
  lng: number,
  timeoutMs = 5000
): Promise<{ city: string | null; country: string | null } | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        municipality?: string;
        state?: string;
        country?: string;
      };
    };
    const a = data.address;
    if (!a) return null;
    const city = a.city ?? a.town ?? a.village ?? a.municipality ?? a.state ?? null;
    return { city, country: a.country ?? null };
  } catch {
    return null;
  }
}
