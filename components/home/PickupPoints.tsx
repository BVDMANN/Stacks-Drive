'use client';

import { useMemo } from 'react';
import { MapPin } from 'lucide-react';
import { PICKUP_POINTS, POI_CATEGORY_COLORS, POI_CATEGORY_LABELS, type Poi } from '@/lib/pois';
import { NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import { estimateFareForDistance } from '@/lib/pricing';
import { haversineKm } from '@/lib/geo';
import { formatFcfa } from '@/lib/commission';

/** Points de prise en charge (v2.22) : les lieux où on vient le plus
 *  souvent chercher un passager — aéroport, marchés, stades, gares et
 *  lieux connus (liste dans `lib/pois.ts` : PICKUP_POINTS).
 *
 *  Chaque ligne montre l'estimation INDICATIVE vers la zone de
 *  référence — la destination choisie si elle existe, sinon
 *  Centre-ville (la zone principale) — calculée avec le même modèle
 *  au km que l'estimation de course (lib/pricing.ts). Ce n'est JAMAIS
 *  un prix fixe : la plateforme ne définit aucun prix, le prix final
 *  se négocie entre le passager et le chauffeur et est figé à
 *  l'acceptation — l'étiquette « Estimation — indicative » est sur
 *  chaque ligne. Un vrai prix fixe par zone serait une décision de
 *  modèle tarifaire à trancher avec le propriétaire.
 *
 *  Toucher un lieu le définit comme point de départ (son quartier le
 *  plus proche) : c'est un départ, pas une destination. */
export function PickupPoints({
  destination,
  onPick,
}: {
  /** Destination choisie (zone de référence des estimations) — vide =
   *  Centre-ville par défaut. */
  destination: Neighborhood | '';
  /** Le lieu devient le point de départ (quartier le plus proche). */
  onPick: (poi: Poi) => void;
}) {
  const reference: Neighborhood = destination !== '' ? destination : 'Centre-ville';

  const rows = useMemo(
    () =>
      PICKUP_POINTS.map((poi) => {
        const dest = NEIGHBORHOOD_COORDS[reference];
        const distanceKm = haversineKm(poi.lat, poi.lng, dest.lat, dest.lng);
        // Supplément aéroport : comme pour une course, il s'applique
        // quand le point ou la zone de référence est l'aéroport.
        const isAirport =
          poi.neighborhood === 'Aéroport Léon-Mba' || reference === 'Aéroport Léon-Mba';
        const solo = estimateFareForDistance(distanceKm, 'solo', 'tous', { isAirport });
        const groupe = estimateFareForDistance(distanceKm, 'groupe', 'tous', { isAirport });
        return { poi, distanceKm, durationMin: solo.durationMin, solo: solo.price, groupe: groupe.price };
      }),
    [reference]
  );

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Points de prise en charge — estimation indicative vers {reference}
      </p>
      <p className="text-xs text-slate-500 leading-snug">
        Touche un lieu pour partir de là. Ce n’est pas un prix fixe : le prix final se négocie
        avec ton chauffeur.
      </p>
      <ul className="space-y-1.5">
        {rows.map(({ poi, distanceKm, durationMin, solo, groupe }) => {
          const color = POI_CATEGORY_COLORS[poi.category];
          const kmFr = distanceKm.toFixed(1).replace('.', ',');
          return (
            <li key={poi.name}>
              <button
                type="button"
                onClick={() => onPick(poi)}
                aria-label={`Partir de ${poi.name} — estimation indicative vers ${reference}`}
                className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl px-3.5 py-2.5 text-left hover:border-cyan/40 active:scale-[0.99] transition-all"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block font-black text-white text-sm leading-tight truncate">
                    {poi.name}
                  </span>
                  <span className="block text-xs text-slate-400 truncate">
                    {POI_CATEGORY_LABELS[poi.category]} · près de {poi.neighborhood} · {kmFr} km · ~{durationMin} min
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-xs font-black text-white leading-tight">
                    Groupe ~{formatFcfa(groupe)}
                  </span>
                  <span className="block text-xs font-black text-white leading-tight">
                    Solo ~{formatFcfa(solo)}
                  </span>
                  <span className="block text-[10px] font-bold text-slate-500">
                    Estimation — indicative
                  </span>
                </span>
                <MapPin size={15} className="text-cyan shrink-0" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
