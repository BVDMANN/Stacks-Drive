/** Signalements « erreurs de carte » (v2.49) — types et libellés
 *  purs, utilisables côté client comme côté serveur. Les lectures
 *  serveur vivent dans `lib/map-reports-server.ts`. */

export type MapReportStatus = 'ouvert' | 'en_cours' | 'resolu' | 'rejete';
export type MapReportKind = 'lieu_manquant' | 'quartier_mal_place' | 'erreur_adresse' | 'autre';

export const MAP_REPORT_KIND_LABELS: Record<MapReportKind, string> = {
  lieu_manquant: 'Lieu manquant',
  quartier_mal_place: 'Quartier mal placé',
  erreur_adresse: 'Erreur d’adresse',
  autre: 'Autre',
};
