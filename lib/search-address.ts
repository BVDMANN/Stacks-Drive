/** Recherche d'adresses rue par rue (v2.51) — appel client à la
 *  route `/api/search-address` (proxy Photon, voir la route).
 *
 *  Une adresse OSM : nom de rue / lieu + quartier ou district OSM
 *  + coordonnées exactes + type OSM (`street`, `house`, …). Le
 *  district sert à distinguer deux rues au même nom (zéro
 *  ambiguïté : le nom seul ne suffit jamais à l'écran).
 *
 *  Retourne null si la route est injoignable : l'appelant affiche
 *  alors les résultats locaux seuls, jamais une erreur brute. */

/** Une adresse trouvée par Photon (forward search, bbox Grand
 *  Libreville). `id` est stable (`osm_type:osm_id`) — deux
 *  résultats au même nom ne se confondent jamais. */
export interface AddressResult {
  id: string;
  /** Nom affiché (« Rue du Bord de mer », « Rue Louis… »). */
  name: string;
  /** Rue porteuse quand le résultat est un lieu (« Rue Charles
   *  Mensah » pour un commerce). */
  street: string | null;
  /** Quartier / district OSM (« Glass », « Okala ») — null si
   *  inconnu : l'écran affiche alors « Libreville ». */
  district: string | null;
  city: string | null;
  /** Type OSM (`street`, `house`, `place`, …) — affiché comme
   *  « Rue » / « Adresse » / « Lieu » pour lever l'ambiguïté. */
  type: string;
  lat: number;
  lng: number;
}

export interface SearchAddressResponse {
  ok: boolean;
  results: AddressResult[];
  source: 'photon' | 'none';
}

/** Appel client à `/api/search-address` : `q` (≥ 2 caractères) +
 *  position de départ optionnelle (tri par proximité côté Photon).
 *  Null si la route est injoignable. */
export async function searchAddressViaApi(
  q: string,
  origin?: { lat: number; lng: number } | null,
  signal?: AbortSignal
): Promise<SearchAddressResponse | null> {
  try {
    const params = new URLSearchParams({ q });
    if (origin) {
      params.set('lat', String(origin.lat));
      params.set('lng', String(origin.lng));
    }
    const res = await fetch(`/api/search-address?${params.toString()}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as SearchAddressResponse;
    if (!data || typeof data !== 'object' || data.ok !== true || !Array.isArray(data.results)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Délai de debounce de la recherche d'adresses (v2.51) : on
 *  n'interroge Photon que 350 ms après la dernière frappe — une
 *  saisie continue ne martèle pas le service (1 req/s). */
export const SEARCH_ADDRESS_DEBOUNCE_MS = 350;

/** Libellé du type OSM dans les résultats (« Rue », « Adresse »,
 *  « Lieu ») — c'est lui qui distingue deux résultats au même nom
 *  quand le district ne suffit pas. */
export function addressTypeLabel(result: AddressResult): string {
  if (result.type === 'street') return 'Rue';
  if (result.type === 'house') return 'Adresse';
  if (result.type === 'place') return 'Lieu';
  if (result.type === 'locality') return 'Lieu-dit';
  return 'Lieu';
}
