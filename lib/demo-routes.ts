/**
 * Trajets routiers des chauffeurs démo — un trajet par chauffeur,
 * généré le 14/11/2026 avec l'API publique OSRM (router.project-osrm.org) :
 * chaque extrémité a été recalée sur la route la plus proche
 * (`/nearest`), puis la géométrie complète du trajet (`/route`,
 * `overview=full`) a été récupérée et allégée (un point tous les
 * ~40 m, extrémités conservées). Vérification : chaque point conservé
 * est à 0,0 m de la route la plus proche (re-vérifié par `/nearest`).
 *
 * Les marqueurs démo ne « dérivent » plus en orbite : ils roulent
 * le long de leur trajet (aller-retour, ~29 km/h) — voir
 * `components/map/LibrevilleMap.tsx`. Les positions de base dans
 * `lib/demo-drivers.ts` sont les milieux de ces trajets (donc aussi
 * sur une route : estimation, radar et mise en relation utilisent
 * la position de base, pas la position animée).
 *
 * Les VRAIS chauffeurs ne sont pas concernés : leur position vient
 * de leur GPS (`driver_locations`) et n'utilise jamais ces trajets.
 * À retirer avec les démos avant le lancement : vider `DEMO_DRIVERS`
 * (voir SETUP.md) — ce fichier devient alors inutilisé.
 */

export interface DemoRoutePoint {
  lat: number;
  lng: number;
}

/** Trajet routier par chauffeur démo (clé = id dans `DEMO_DRIVERS`). */
export const DEMO_ROUTES: Record<string, DemoRoutePoint[]> = {
  // demo-1 — Centre-ville, Boulevard de l'Indépendance (nord-sud), 1594 m, 26 points.
  'demo-1': [{ lat: 0.384426, lng: 9.445694 }, { lat: 0.384081, lng: 9.445948 }, { lat: 0.384565, lng: 9.445675 }, { lat: 0.385149, lng: 9.445317 }, { lat: 0.385767, lng: 9.444936 }, { lat: 0.386141, lng: 9.444713 }, { lat: 0.386666, lng: 9.444389 }, { lat: 0.387046, lng: 9.444154 }, { lat: 0.387552, lng: 9.443846 }, { lat: 0.387976, lng: 9.443596 }, { lat: 0.388477, lng: 9.443291 }, { lat: 0.389075, lng: 9.442926 }, { lat: 0.389413, lng: 9.442716 }, { lat: 0.389748, lng: 9.44252 }, { lat: 0.390151, lng: 9.442279 }, { lat: 0.390503, lng: 9.442106 }, { lat: 0.390868, lng: 9.442347 }, { lat: 0.391188, lng: 9.443118 }, { lat: 0.391371, lng: 9.443569 }, { lat: 0.391551, lng: 9.444023 }, { lat: 0.3919, lng: 9.444127 }, { lat: 0.392371, lng: 9.4438 }, { lat: 0.392901, lng: 9.443549 }, { lat: 0.393385, lng: 9.443333 }, { lat: 0.39364, lng: 9.443983 }, { lat: 0.393941, lng: 9.444709 }],
  // demo-2 — Glass, Rue Pascal Obame / Impasse Issambi Bodman, 940 m, 19 points.
  'demo-2': [{ lat: 0.375354, lng: 9.454242 }, { lat: 0.375362, lng: 9.454627 }, { lat: 0.375405, lng: 9.455044 }, { lat: 0.375506, lng: 9.455451 }, { lat: 0.376036, lng: 9.455262 }, { lat: 0.37643, lng: 9.455109 }, { lat: 0.376776, lng: 9.454977 }, { lat: 0.37711, lng: 9.454842 }, { lat: 0.377551, lng: 9.455231 }, { lat: 0.377827, lng: 9.4558 }, { lat: 0.378156, lng: 9.456437 }, { lat: 0.378426, lng: 9.456928 }, { lat: 0.3787, lng: 9.457457 }, { lat: 0.378753, lng: 9.457833 }, { lat: 0.378582, lng: 9.458188 }, { lat: 0.378973, lng: 9.458392 }, { lat: 0.379302, lng: 9.458588 }, { lat: 0.379717, lng: 9.458588 }, { lat: 0.379904, lng: 9.458554 }],
  // demo-3 — Charbonnages, rue est-ouest autour de 0,434 / 9,448 (Rue de l'Ascension), 512 m, 12 points.
  'demo-3': [{ lat: 0.432029, lng: 9.448112 }, { lat: 0.432458, lng: 9.448063 }, { lat: 0.432833, lng: 9.447826 }, { lat: 0.433098, lng: 9.44755 }, { lat: 0.433446, lng: 9.447098 }, { lat: 0.433677, lng: 9.44678 }, { lat: 0.434083, lng: 9.446817 }, { lat: 0.434555, lng: 9.44674 }, { lat: 0.434929, lng: 9.446554 }, { lat: 0.435203, lng: 9.446966 }, { lat: 0.435429, lng: 9.447297 }, { lat: 0.435512, lng: 9.447438 }],
  // demo-4 — Nzeng-Ayong, Avenue Aimé Mondjot, 1098 m, 21 points.
  'demo-4': [{ lat: 0.424768, lng: 9.469305 }, { lat: 0.42521, lng: 9.469643 }, { lat: 0.42569, lng: 9.469941 }, { lat: 0.426225, lng: 9.470074 }, { lat: 0.42661, lng: 9.470206 }, { lat: 0.42704, lng: 9.470405 }, { lat: 0.427493, lng: 9.470639 }, { lat: 0.427887, lng: 9.47083 }, { lat: 0.428256, lng: 9.47103 }, { lat: 0.428613, lng: 9.471242 }, { lat: 0.428976, lng: 9.471421 }, { lat: 0.428873, lng: 9.471824 }, { lat: 0.429012, lng: 9.472375 }, { lat: 0.42917, lng: 9.472804 }, { lat: 0.429325, lng: 9.473205 }, { lat: 0.429631, lng: 9.473512 }, { lat: 0.430201, lng: 9.47389 }, { lat: 0.430588, lng: 9.474159 }, { lat: 0.431253, lng: 9.474592 }, { lat: 0.431564, lng: 9.474795 }, { lat: 0.431288, lng: 9.475197 }],
  // demo-5 — Akanda, axe nord-sud vers 9,483, 902 m, 15 points.
  'demo-5': [{ lat: 0.493928, lng: 9.481543 }, { lat: 0.494312, lng: 9.481715 }, { lat: 0.494661, lng: 9.481908 }, { lat: 0.495361, lng: 9.482318 }, { lat: 0.495753, lng: 9.482457 }, { lat: 0.496368, lng: 9.482457 }, { lat: 0.496798, lng: 9.482503 }, { lat: 0.497366, lng: 9.482937 }, { lat: 0.497866, lng: 9.483131 }, { lat: 0.498487, lng: 9.483082 }, { lat: 0.499087, lng: 9.482879 }, { lat: 0.500178, lng: 9.482964 }, { lat: 0.500582, lng: 9.48303 }, { lat: 0.501257, lng: 9.483151 }, { lat: 0.501568, lng: 9.483193 }],
  // demo-6 — Owendo, axe nord-sud vers 9,498, 1081 m, 21 points.
  'demo-6': [{ lat: 0.334118, lng: 9.497933 }, { lat: 0.334343, lng: 9.498329 }, { lat: 0.334706, lng: 9.49826 }, { lat: 0.334683, lng: 9.497822 }, { lat: 0.335019, lng: 9.497492 }, { lat: 0.335404, lng: 9.49723 }, { lat: 0.335874, lng: 9.497159 }, { lat: 0.336242, lng: 9.497276 }, { lat: 0.336679, lng: 9.497532 }, { lat: 0.336953, lng: 9.497878 }, { lat: 0.337509, lng: 9.497986 }, { lat: 0.337868, lng: 9.497871 }, { lat: 0.338411, lng: 9.497863 }, { lat: 0.338928, lng: 9.498044 }, { lat: 0.339378, lng: 9.498252 }, { lat: 0.339798, lng: 9.498405 }, { lat: 0.34034, lng: 9.498462 }, { lat: 0.340861, lng: 9.498473 }, { lat: 0.341327, lng: 9.49845 }, { lat: 0.341749, lng: 9.498309 }, { lat: 0.341972, lng: 9.497985 }],
};

/** Longueur de chaque trajet routier démo, en mètres. */
export const DEMO_ROUTE_LENGTHS_M: Record<string, number> = {
  'demo-1': 1594,
  'demo-2': 940,
  'demo-3': 512,
  'demo-4': 1098,
  'demo-5': 902,
  'demo-6': 1081,
};
