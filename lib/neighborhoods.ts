/** Quartiers et zones de Libreville (Grand Libreville) utilisés dans les
 *  listes de départ / destination. Libreville est la zone de lancement. */

export const NEIGHBORHOODS = [
  'Centre-ville',
  'Glass',
  'Nzeng-Ayong',
  'Charbonnages',
  'Owendo',
  'Akanda',
  'Aéroport Léon-Mba',
  'Likouala',
  'Louis',
  'Sablière',
  'Alibandeng',
  'Kinguele',
  'Nkembo',
  'Akébé',
  'Plein Ciel',
  'Batterie IV',
  'Mont-Bouët',
  'Okala',
  'Damas',
  'Autre',
] as const;

export type Neighborhood = (typeof NEIGHBORHOODS)[number];

/** Types de véhicules acceptés pour les chauffeurs. */
export const VEHICLE_TYPES = ['Berline', 'SUV', 'Citadine', 'Moto'] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Moyens de paiement acceptés (aucun traitement réel en v1 : le paiement
 *  se fait directement entre le passager et le chauffeur, en espèces ou
 *  par Mobile Money). */
export const PAYMENT_METHODS = ['especes', 'airtel', 'moov'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  especes: 'Espèces',
  airtel: 'Airtel Money',
  moov: 'Moov Money',
};
