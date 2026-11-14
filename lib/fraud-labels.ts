/** Signaux de fraude — types et libellés (v2.26, lot D).
 *
 *  Module SANS import serveur : il est importé à la fois par
 *  `lib/fraud.ts` (côté serveur) et par le composant client
 *  `components/admin/FraudReview.tsx`. Ne jamais y importer
 *  `lib/audit.ts` ni `lib/supabase/*` (qui dépendent de
 *  `next/headers`) — sinon le build casse (erreur Turbopack :
 *  `next/headers` dans un Client Component). */

export type FraudSignal =
  | 'cancellations'
  | 'impossible_speed'
  | 'pin_repeated'
  | 'shared_phone';

export const FRAUD_SIGNAL_LABELS: Record<FraudSignal, string> = {
  cancellations: 'Annulations en série',
  impossible_speed: 'Vitesse impossible',
  pin_repeated: 'Faux PIN répétés',
  shared_phone: 'Téléphone partagé entre comptes',
};
