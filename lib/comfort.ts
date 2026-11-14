/** Classe Confort (v2.34, lot « Au-delà ») — option de course à côté de
 *  Solo / Groupe.
 *
 *  Confort = climatisation garantie + chauffeurs notés 4,5★ et plus.
 *  Même modèle de prix que Solo (estimation indicative au km Solo,
 *  prix convenu entre le passager et le chauffeur, jamais de surge)
 *  — aucune différence de prix décidée : Confort ne change que
 *  l'éligibilité des chauffeurs, pas le tarif.
 *
 *  Éligibilité (vérifiée CÔTÉ SERVEUR au matching, jamais depuis le
 *  client) : le chauffeur a déclaré la climatisation dans son profil
 *  (`profiles.has_air_conditioning`, migration v2.34) ET sa note
 *  moyenne de chauffeur (notes `rating_driver` des courses
 *  terminées) est ≥ 4,5. Un chauffeur sans aucune note n'est pas
 *  éligible (note moyenne inconnue ≠ 4,5★).
 *  Une course Confort est une Solo : véhicule entier, jamais de
 *  partage — le stockage le reflète (`rides.ride_type = 'solo'`,
 *  `rides.comfort = true`), donc les règles de places (`lib/seats.ts`)
 *  et de dispatch s'appliquent sans changement.
 */

/** Note moyenne minimale pour la classe Confort (★ sur 5). */
export const COMFORT_MIN_RATING = 4.5;

/** Libellé affiché dans la feuille de demande. */
export const COMFORT_LABEL = 'Confort';
export const COMFORT_DESCRIPTION = 'Clim garantie · Chauffeurs 4,5★ et plus';

/** Éligibilité pure (sans base) : climatisation + note moyenne ≥ 4,5. */
export function isComfortEligible(args: {
  hasAirConditioning: boolean | null | undefined;
  averageRating: number | null;
}): boolean {
  if (!args.hasAirConditioning) return false;
  if (args.averageRating === null || args.averageRating === undefined) return false;
  return args.averageRating >= COMFORT_MIN_RATING;
}
