'use client';

import { Suspense } from 'react';
import { notFound, useSearchParams } from 'next/navigation';
import { ProposalCard } from '@/components/home/ProposalCard';
import { PinDisplay } from '@/components/rides/PinDisplay';
import { PinEntry } from '@/components/driver/PinEntry';
import { RequestPopup } from '@/components/driver/RequestPopup';
import { SeatsPopup } from '@/components/driver/SeatsPopup';
import { DriverHome } from '@/components/driver/DriverHome';
import { PassengerTutorial } from '@/components/tuto/PassengerTutorial';
import { DriverTutorial } from '@/components/tuto/DriverTutorial';
import {
  TUTO_DRIVER_OPEN_EVENT,
  TUTO_PASSENGER_OPEN_EVENT,
} from '@/components/tuto/steps';
import type { DriverProfile, Ride, RideProposal } from '@/types';
import type { SessionProfile } from '@/lib/supabase/server';

/** Page d'aperçu des tutoriels — DEV UNIQUEMENT (v2.21).
 *
 *  Pourquoi elle existe : les écrans « propositions », « code PIN »,
 *  « demande entrante », « places » et « accueil chauffeur »
 *  n'existent qu'avec une course / un compte connecté — impossibles
 *  à capturer en local sans Supabase. Cette page rend les VRAIS
 *  composants de l'app, avec des données démo étiquetées comme telles
 *  (comme les chauffeurs démo de la carte), pour que le script
 *  `scripts/capture-tuto.mjs` en fasse les captures du tutoriel. En
 *  production, la page répond 404. Le relevé hebdo (chauffeur-06)
 *  vient de la vraie page `/devenir-chauffeur` : sans Supabase, le
 *  composant WeeklySettlementCard n'affiche que son état vide.
 *
 *  Les captures doivent être refaites sur un vrai appareil (vraie
 *  course, vrai compte) après le push si un écran change — voir
 *  `public/tuto/README.md`. */


/* --- Données DÉMO (visibles uniquement ici, jamais en production) --- */

const DEMO_DRIVER: DriverProfile = {
  id: 'demo-driver-1',
  name: 'Jean M.',
  phone: null,
  vehicleType: 'Berline',
  vehicleLabel: 'Toyota Corolla grise',
  plate: 'GA-123-AB',
  seats: 4,
  freeSeats: 3,
  status: 'vide',
  isVerified: true,
  isOnline: true,
  rating: 4.8,
  trips: 127,
  area: 'Nzeng-Ayong',
  lat: 0.4162,
  lng: 9.4673,
  isDemo: true,
};

const DEMO_PROPOSAL: RideProposal = {
  id: 'demo-proposal-1',
  rideId: 'demo-ride-1',
  driverId: DEMO_DRIVER.id,
  proposedPrice: 1500,
  counterPrice: null,
  unpavedAccepted: false,
  seatsLeft: 3,
  firstStop: 'Aéroport Léon-Mba',
  status: 'pending',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  driver: DEMO_DRIVER,
};

const DEMO_RIDE: Ride = {
  id: 'demo-ride-1',
  passengerId: 'demo-passenger-1',
  driverId: null,
  pickup: 'Aéroport Léon-Mba',
  destination: 'Centre-ville',
  rideType: 'groupe',
  vehiclePreference: 'tous',
  seats: 1,
  estimatedPrice: 1500,
  offeredPrice: null,
  unpavedRequested: false,
  dropOffPoint: null,
  unpavedAccepted: null,
  proposedPrice: null,
  firstStop: null,
  paymentMethod: 'especes',
  message: '',
  status: 'recherche',
  platformFee: 0,
  driverShare: 0,
  ratingDriver: null,
  ratingPassenger: null,
  passengerRating: null,
  scheduledAt: null,
  dispatchedAt: null,
  loyaltyFree: false,
  shareToken: null,
  cancelledBy: null,
  cancelReason: null,
  pinCode: '4827',
  pinAttempts: 0,
  pinLocked: false,
  startedAt: null,
  completedAt: null,
  distanceKm: 4.8,
  durationMin: 12,
  commissionRate: null,
  isDoubleRide: false,
  platformCost: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const DEMO_PROFILE: SessionProfile = {
  id: 'demo-driver-1',
  email: 'chauffeur-demo@exemple.ga',
  full_name: 'Jean M.',
  phone: '+241 00 00 00 00',
  role: 'chauffeur',
  vehicle_type: 'voiture',
  vehicle_brand: 'Toyota',
  vehicle_model: 'Corolla',
  vehicle_color: 'Grise',
  plate: 'GA-123-AB',
  seats: 4,
  free_seats: 3,
  is_online: false,
  is_verified: true,
  is_admin: false,
  is_demo: true,
  verification_status: 'verifie',
  selfie_url: null,
  id_document_url: null,
  id_document_type: null,
  verification_note: null,
  home_neighborhood: null,
  home_detail: null,
  work_neighborhood: null,
  work_detail: null,
  selfie_recheck_required: false,
  selfie_recheck_reason: null,
  last_selfie_check_at: null,
  current_area: 'Nzeng-Ayong',
  last_lat: null,
  last_lng: null,
  created_at: new Date().toISOString(),
};

const SCREENS = [
  'propositions',
  'pin',
  'pin-saisie',
  'demande',
  'places',
  'mise-en-ligne',
  'tuto-passager',
  'formation',
] as const;
type Screen = (typeof SCREENS)[number];

export default function TutoApercuPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-night-950 text-slate-100 flex items-center justify-center">
          <p className="text-sm font-bold text-slate-400">Chargement de l’aperçu…</p>
        </div>
      }
    >
      <TutoApercuContent />
    </Suspense>
  );
}

function TutoApercuContent() {
  // Dev uniquement : en production, cette page n'existe pas.
  // (Composant client : les fonctions passées aux composants enfants
  // — onAccept, onClose… — exigent une page cliente.)
  if (process.env.NODE_ENV === 'production') notFound();
  const params = useSearchParams();
  const ecran = params.get('ecran');
  const screen = (SCREENS as readonly string[]).includes(ecran ?? '')
    ? (ecran as Screen)
    : 'propositions';

  return (
    <div className="min-h-dvh bg-night-950 text-slate-100">
      <p data-tuto-banner className="text-center text-[11px] font-bold text-corail bg-corail/10 border-b border-corail/30 px-4 py-2">
        Aperçu dev — données DÉMO, pour les captures du tutoriel uniquement. Ne pas indexer.
      </p>

      {screen === 'propositions' && (
        <div data-tuto-ecran="propositions" className="mx-auto max-w-[420px] px-4 py-6">
          <div className="sheet-glass sheet-up rounded-[28px] p-4">
            <p className="text-sm font-black text-white mb-3">1 proposition reçue — à toi de choisir :</p>
            <ProposalCard
              proposal={DEMO_PROPOSAL}
              rideType="groupe"
              estimatePrice={1500}
              estimateBreakdown="500 FCFA prise en charge + 4,8 km × 210 FCFA/km"
              etaMin={4}
              secondsLeft={52}
              busy={false}
              dropOffPoint={null}
              destinationLabel="Centre-ville"
              onAccept={() => undefined}
              onDecline={() => undefined}
              onCounter={async () => true}
            />
          </div>
        </div>
      )}

      {screen === 'pin' && (
        <div data-tuto-ecran="pin" className="mx-auto max-w-[420px] px-4 py-6">
          <PinDisplay pinCode="4827" />
          <p className="text-xs text-slate-500 mt-3 text-center">
            Code démo — le vrai code est généré à l’acceptation de la course.
          </p>
        </div>
      )}

      {screen === 'pin-saisie' && (
        <div data-tuto-ecran="pin-saisie" className="mx-auto max-w-[420px] px-4 py-6">
          <PinEntry rideId="demo-ride-1" />
        </div>
      )}

      {screen === 'demande' && (
        <div data-tuto-ecran="demande">
          <RequestPopup
            ride={DEMO_RIDE}
            passenger={{ name: 'Passager démo', phone: null }}
            driverSeats={4}
            freeSeats={3}
            onClose={() => undefined}
            onProposed={() => undefined}
          />
        </div>
      )}

      {screen === 'places' && (
        <div data-tuto-ecran="places">
          <SeatsPopup capacity={4} freeSeats={3} onClose={() => undefined} onSaved={() => undefined} />
        </div>
      )}

      {screen === 'mise-en-ligne' && (
        <div data-tuto-ecran="mise-en-ligne" className="mx-auto max-w-[420px] px-4 py-6">
          <div className="sheet-glass sheet-up rounded-[28px] p-4">
            <DriverHome profile={DEMO_PROFILE} />
          </div>
        </div>
      )}

      {/* Modales entières (vérification) : ouvrent le vrai tutoriel
          pour contrôler que les 6 images chargent et que la navigation
          entre étapes fonctionne. */}
      {screen === 'tuto-passager' && (
        <div data-tuto-ecran="tuto-passager" className="mx-auto max-w-[420px] px-4 py-6 space-y-3">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(TUTO_PASSENGER_OPEN_EVENT))}
            className="w-full py-3.5 rounded-full bg-rose-500 text-night-900 font-black"
          >
            Ouvrir le tutoriel passager
          </button>
          <PassengerTutorial />
        </div>
      )}
      {screen === 'formation' && (
        <div data-tuto-ecran="formation" className="mx-auto max-w-[420px] px-4 py-6 space-y-3">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(TUTO_DRIVER_OPEN_EVENT))}
            className="w-full py-3.5 rounded-full bg-rose-500 text-night-900 font-black"
          >
            Ouvrir la formation chauffeur
          </button>
          <DriverTutorial />
        </div>
      )}
    </div>
  );
}
