import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Car, MapPin, ShieldCheck, Users, Wallet } from 'lucide-react';
import { AmountToPay } from '@/components/rides/AmountToPay';
import { RideReceiptCard } from '@/components/rides/RideReceipt';
import { AutoPrintOnParam } from '@/components/rides/AutoPrintOnParam';
import { TrustedSharePanel } from '@/components/rides/TrustedSharePanel';
import { buildRideReceipt } from '@/lib/receipt';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { RideLiveTracking } from '@/components/rides/RideLiveTracking';
import { RideCheckPanel } from '@/components/rides/RideCheckPanel';
import { RideChat } from '@/components/rides/RideChat';
import { DriverCard } from '@/components/home/DriverCard';
import { RideActions } from '@/components/rides/RideActions';
import { PinEntry } from '@/components/driver/PinEntry';
import { FeedbackForm } from '@/components/rides/FeedbackForm';
import { DisputeForm } from '@/components/rides/DisputeForm';
import { RideStatusBadge } from '@/components/shared/StatusBadge';
import { getRideRequestById } from '@/lib/rides';
import { mapDriverProfile, stripDriverPhone } from '@/lib/db-types';
import { getSessionUser, createClient, hasDriverAccount } from '@/lib/supabase/server';
import { formatFcfa } from '@/lib/commission';
import { estimateTrip } from '@/lib/pricing';
import { fetchRoadRoute } from '@/lib/routing';
import { PAYMENT_LABELS, NEIGHBORHOOD_COORDS, type Neighborhood } from '@/lib/neighborhoods';
import { formatDepartureTime, timeAgo } from '@/lib/dates';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const STEPS = [
  { key: 'recherche', label: 'Demande envoyée' },
  { key: 'propositions', label: 'Propositions reçues' },
  { key: 'acceptee', label: 'Chauffeur confirmé' },
  { key: 'en_cours', label: 'Course en cours' },
  { key: 'terminee', label: 'Terminée' },
] as const;

/** Suivi d'une course : carte en direct, chauffeur assigné, statut,
 *  annulation, note après course. */
export default async function CoursePage({ params }: Ctx) {
  const { id } = await params;
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect(`/connexion?next=/courses/${id}`);
  const found = await getRideRequestById(id, sessionUser.id);

  const user = {
    id: sessionUser.id,
    email: sessionUser.email,
    role: sessionUser.profile?.role ?? 'passager',
    isAdmin: sessionUser.profile?.is_admin ?? false,
    canSwitchToDriver: hasDriverAccount(sessionUser.profile),
  };

  if (!found) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header user={user} />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-3">
            <p className="text-lg font-black text-slate-900">Course introuvable</p>
            <p className="text-sm text-slate-500">
              Cette course n’existe plus, ou tu n’y as pas accès.
            </p>
            <Link href="/" className="inline-block text-stacks-green font-bold hover:underline">
              Retour à la carte
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { ride, row } = found;
  const { date, time } = formatDepartureTime(ride.createdAt);
  const isPassenger = sessionUser.id === ride.passengerId;
  const isDriver = sessionUser.id === ride.driverId;
  // Note du passager (v2.30) : le chauffeur la voit sur la carte de
  // course — même source que les demandes entrantes.
  if (isDriver && ride.passengerId) {
    const { getPassengerRating } = await import('@/lib/rides');
    ride.passengerRating = await getPassengerRating(ride.passengerId);
  }
  // Heure prévue d'une course planifiée (v2.30).
  const scheduled = ride.scheduledAt ? formatDepartureTime(ride.scheduledAt) : null;

  // Note moyenne du chauffeur assigné.
  // v2.20 : jamais de téléphone chauffeur sérialisé vers le passager
  // (DriverCard est un composant client — ses props partent dans la
  // page). La messagerie in-app remplace l'appel direct.
  let driver = row.driver ? stripDriverPhone(mapDriverProfile(row.driver)) : null;
  if (driver) {
    const supabase = await createClient();
    const { data: rated } = await supabase
      .from('rides')
      .select('rating_driver')
      .eq('driver_id', driver.id)
      .eq('status', 'terminee')
      .not('rating_driver', 'is', null);
    const ratings = (rated ?? []).map((r: { rating_driver: number | null }) => r.rating_driver ?? 0);
    if (ratings.length > 0) {
      driver.rating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
      driver.trips = ratings.length;
    }
  }

  const pickupCoords = NEIGHBORHOOD_COORDS[ride.pickup as Neighborhood];
  const destCoords = NEIGHBORHOOD_COORDS[ride.destination as Neighborhood];
  const currentStep =
    ride.status === 'annulee'
      ? -1
      : STEPS.findIndex((s) => s.key === ride.status);

  // Trajet estimé (distance / durée figées à l'acceptation, sinon recalcul).
  const tripEstimate =
    ride.distanceKm !== null && ride.durationMin !== null
      ? { distanceKm: ride.distanceKm, durationMin: ride.durationMin }
      : estimateTrip(ride.pickup as Neighborhood, ride.destination as Neighborhood);
  // Itinéraire routier (v2.27) : durée et distance par la route
  // (OSRM) — affichées en complément, le prix ne change pas. En cas
  // d'indisponibilité d'OSRM, la route retombe sur la ligne droite :
  // on n'affiche la ligne « Par la route » que si OSRM a répondu.
  const roadRoute = await fetchRoadRoute(pickupCoords, destCoords);
  const passenger = row.passenger ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Suspense fallback={null}>
        <AutoPrintOnParam />
      </Suspense>
      <Header user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-stacks-green">
          <ArrowLeft size={16} /> Retour à la carte
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stacks-navy tracking-tight">
              {ride.pickup} → {ride.destination}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Demandée {date} · {time} ({timeAgo(ride.createdAt)}) ·{' '}
              {ride.rideType === 'groupe' ? 'Groupe · 1 place' : 'Solo · véhicule entier'}
            </p>
          </div>
          <RideStatusBadge status={ride.status} />
        </div>

        {/* Étapes */}
        {ride.status !== 'annulee' && (
          <ol className="flex flex-wrap items-center gap-2">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black ${
                    i <= currentStep ? 'bg-stacks-green text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {i <= currentStep ? '✓' : i + 1} {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-slate-300">›</span>}
              </li>
            ))}
          </ol>
        )}

        {/* Course planifiée (v2.30) : heure prévue + envoi aux
            chauffeurs ~15 min avant. Expirée = heure passée sans
            chauffeur, relançable (bouton dans RideActions ci-dessous
            via canCancel / relance). */}
        {ride.status === 'planifiee' && scheduled && (
          <div className="bg-violet-50 border border-violet-200 rounded-3xl p-5 shadow-sm">
            <p className="text-sm font-black text-violet-900">
              Course planifiée pour {scheduled.date} à {scheduled.time}
            </p>
            <p className="text-sm text-violet-800 mt-1">
              Ta demande partira automatiquement aux chauffeurs proches environ 15 minutes avant
              l’heure prévue. Tu peux encore l’annuler jusque-là.
            </p>
          </div>
        )}
        {ride.status === 'expiree' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm">
            <p className="text-sm font-black text-slate-900">
              L’heure prévue est passée sans chauffeur disponible.
            </p>
            <p className="text-sm text-slate-600 mt-1">
              Relance la même course maintenant, ou planifie une nouvelle heure depuis l’accueil.
            </p>
          </div>
        )}

        {/* Code PIN (v2.2, visible dès le matching v2.23) : affiché EN
            GRAND sur la carte chauffeur ci-contre — le passager le
            donne au chauffeur quand il arrive. */}
        {isPassenger && ride.pinLocked && ride.status === 'acceptee' && (
          <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
            Course verrouillée après 5 codes faux. Contacte Stacks Drive pour
            la débloquer, ou annule la course.
          </p>
        )}

        {/* Montant exact à payer (v2.23) : à l'arrivée, le prix figé —
            zéro négociation au moment de payer. */}
        {ride.status === 'en_cours' && ride.proposedPrice !== null && (
          <AmountToPay
            amountLabel={
              ride.loyaltyFree ? '0 FCFA — course offerte' : formatFcfa(ride.proposedPrice)
            }
            paymentLabel={PAYMENT_LABELS[ride.paymentMethod]}
            forDriver={isDriver}
          />
        )}

        {/* Annulation (v2.23) : qui a annulé, avec quel motif. */}
        {ride.status === 'annulee' && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-2">
            <h2 className="font-black text-lg text-slate-900">Course annulée</h2>
            <p className="text-sm text-slate-600">
              {ride.cancelledBy
                ? `Annulée par ${ride.cancelledBy === 'passager' ? 'le passager' : 'le chauffeur'}`
                : 'Annulée'}
              {ride.cancelReason ? ` — motif : ${ride.cancelReason}` : ' — aucun motif indiqué'}.
              {ride.driverId && isPassenger
                ? ' Ton chauffeur a été prévenu immédiatement.'
                : ''}
              {ride.driverId && isDriver ? ' Ton passager a été prévenu immédiatement.' : ''}
            </p>
          </div>
        )}

        {/* Vue chauffeur (v2.2) : passager, trajet, temps, distance, prix, paiement. */}
        {isDriver && (
          <div className="bg-white border-2 border-stacks-green rounded-3xl p-6 shadow-sm space-y-3">
            <h2 className="font-black text-lg text-slate-900">Ta course</h2>
            <p className="text-sm text-slate-600">
              Passager : <strong className="text-slate-900">{passenger?.full_name ?? 'Passager'}</strong>
              {passenger?.phone ? ` · ${passenger.phone}` : ''}
              {/* Note du passager (v2.30) : moyenne des notes données
                  par les chauffeurs après ses courses terminées. */}
              {ride.passengerRating
                ? ` · ★ ${ride.passengerRating.average}/5 (${ride.passengerRating.count} course${ride.passengerRating.count > 1 ? 's' : ''} notée${ride.passengerRating.count > 1 ? 's' : ''})`
                : ' · nouveau passager'}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Temps estimé</p>
                <p className="font-black text-stacks-navy mt-1">~{tripEstimate.durationMin} min</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Distance</p>
                <p className="font-black text-stacks-navy mt-1">~{Math.max(1, Math.round(tripEstimate.distanceKm))} km</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Prix</p>
                <p className="font-black text-stacks-navy mt-1">
                  {ride.proposedPrice !== null
                    ? formatFcfa(ride.proposedPrice)
                    : 'En attente des propositions'}
                </p>
                <p className="text-xs text-slate-400">
                  {ride.proposedPrice !== null
                    ? `dont ${formatFcfa(ride.driverShare)} pour toi`
                    : `estimation indicative : ${formatFcfa(ride.estimatedPrice)}`}
                </p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Paiement</p>
                <p className="font-black text-stacks-navy mt-1">{PAYMENT_LABELS[ride.paymentMethod]}</p>
                <p className="text-xs text-slate-400">directement par le passager</p>
              </div>
            </div>
            {/* Itinéraire routier (v2.27) : durée et distance par la
                route (OSRM) — le prix, lui, ne change pas. */}
            {roadRoute.source === 'osrm' && (
              <p className="text-sm font-bold text-slate-600">
                Par la route : ~{roadRoute.durationMin} min ·{' '}
                {roadRoute.distanceKm.toFixed(1).replace('.', ',')} km
              </p>
            )}
            {ride.status === 'acceptee' && <PinEntry rideId={ride.id} refreshOnStart />}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Carte + détails */}
          <section className="lg:col-span-2 space-y-6">
            {/* Suivi en direct (v2.10) : position du chauffeur jusqu'au
                pickup + ETA côté passager, partage de position côté
                chauffeur. Hors course acceptée : carte statique. */}
            <RideLiveTracking
              rideId={ride.id}
              role={isPassenger ? 'passager' : 'chauffeur'}
              status={ride.status}
              pickup={pickupCoords ? { ...pickupCoords, label: ride.pickup } : null}
              destination={destCoords ? { ...destCoords, label: ride.destination } : null}
              driver={
                driver && driver.lat !== null && driver.lng !== null
                  ? {
                      id: driver.id,
                      name: driver.name,
                      lat: driver.lat,
                      lng: driver.lng,
                      vehicleLabel: driver.vehicleLabel,
                      vehicleType: driver.vehicleType ?? '',
                      rating: driver.rating,
                      isDemo: driver.isDemo,
                    }
                  : null
              }
            />

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="font-black text-lg text-slate-900">Détails de la course</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-slate-50 rounded-2xl p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Prix</p>
                  <p className="font-black text-stacks-navy mt-1">
                    {ride.loyaltyFree
                      ? '0 FCFA — offerte'
                      : ride.proposedPrice !== null
                        ? formatFcfa(ride.proposedPrice)
                        : ride.status === 'annulee'
                          ? '—'
                          : 'En attente des propositions'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {ride.loyaltyFree
                      ? '10e course offerte'
                      : ride.proposedPrice !== null
                        ? 'prix convenu et accepté — figé'
                        : ride.status === 'annulee'
                          ? 'annulée avant acceptation'
                          : `estimation indicative : ${formatFcfa(ride.estimatedPrice)}`}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Paiement</p>
                  <p className="font-black text-stacks-navy mt-1 flex items-center gap-1">
                    <Wallet size={16} /> {PAYMENT_LABELS[ride.paymentMethod]}
                  </p>
                  <p className="text-xs text-slate-400">directement au chauffeur</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Véhicule</p>
                  <p className="font-black text-stacks-navy mt-1 flex items-center gap-1">
                    <Car size={16} /> {driver?.vehicleType ?? '—'}
                  </p>
                  <p className="text-xs text-slate-400 truncate">{driver?.vehicleLabel || '—'}</p>
                </div>
                <div className="bg-slate-50 rounded-2xl p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Passagers</p>
                  <p className="font-black text-stacks-navy mt-1 flex items-center gap-1">
                    <Users size={16} /> {ride.rideType === 'groupe' ? '1 place' : 'Véhicule entier'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {ride.rideType === 'groupe' ? 'course partagée' : 'course privée'}
                  </p>
                </div>
              </div>

              {ride.rideType === 'groupe' && ride.firstStop && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                  <p className="font-black text-green-800 text-sm flex items-center gap-1.5">
                    <MapPin size={15} /> Ordre des arrêts
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    1er arrêt : <strong>{ride.firstStop}</strong>
                    {ride.pickup !== ride.firstStop ? ` — prise en charge à ${ride.pickup} d’abord` : ''}
                    . Les arrêts suivants sont confirmés par ton chauffeur selon les passagers à bord.
                  </p>
                </div>
              )}

              {/* Route non bitumée (v2.6) : point de dépôt effectif. */}
              {ride.dropOffPoint && ride.unpavedAccepted === false && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="font-black text-amber-800 text-sm flex items-center gap-1.5">
                    <MapPin size={15} /> Point de dépôt
                  </p>
                  <p className="text-sm text-amber-700 mt-1">
                    La course s’arrête à <strong>{ride.dropOffPoint}</strong> — la route non
                    bitumée vers {ride.destination} n’a pas été prise, le supplément a été retiré.
                  </p>
                </div>
              )}
              {ride.dropOffPoint && ride.unpavedAccepted === true && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
                  <p className="font-black text-green-800 text-sm flex items-center gap-1.5">
                    <MapPin size={15} /> Route non bitumée acceptée
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    Le chauffeur continue jusqu’à <strong>{ride.destination}</strong> — supplément
                    de 800 FCFA inclus dans le prix.
                  </p>
                </div>
              )}

              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-stacks-green" />
                Prix figé une fois accepté · Commission Stacks Drive 5 % au lancement
                (8 % ensuite, 10 % maximum) — le chauffeur garde le reste.
              </p>
            </div>
          </section>

          {/* Chauffeur + actions */}
          <aside className="space-y-6">
            {driver ? (
              <DriverCard
                driver={driver}
                ride={ride}
                etaMin={null}
                pinCode={isPassenger ? ride.pinCode : null}
                shareUrl={ride.shareToken ? `/suivi/${ride.shareToken}` : `/courses/${ride.id}`}
                detailUrl={`/courses/${ride.id}`}
              />
            ) : (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-2">
                <h2 className="font-black text-lg text-slate-900">Chauffeur</h2>
                <p className="text-sm text-slate-500">
                  {ride.status === 'recherche' || ride.status === 'propositions'
                    ? 'En attente d’une proposition — les chauffeurs en ligne autour de toi reçoivent ta demande.'
                    : 'Aucun chauffeur assigné pour le moment.'}
                </p>
                {(ride.status === 'recherche' || ride.status === 'propositions') && (
                  <Link href="/" className="inline-block text-stacks-green font-bold text-sm hover:underline">
                    Voir les propositions sur la carte →
                  </Link>
                )}
              </div>
            )}

            {/* Messagerie de course (v2.10) : passager ↔ chauffeur, en
                cours de course uniquement. Aucun numéro affiché. */}
            {['acceptee', 'en_cours'].includes(ride.status) && (isPassenger || isDriver) && (
              <RideChat
                rideId={ride.id}
                myRole={isPassenger ? 'passager' : 'chauffeur'}
                otherName={
                  isPassenger
                    ? driver?.name ?? 'Ton chauffeur'
                    : passenger?.full_name ?? 'Ton passager'
                }
              />
            )}

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <RideActions
                rideId={ride.id}
                myRole={isPassenger ? 'passager' : 'chauffeur'}
                canStart={isDriver && ride.status === 'acceptee'}
                canComplete={isDriver && ride.status === 'en_cours'}
                canCancel={
                  (isPassenger || isDriver) &&
                  ['recherche', 'propositions', 'acceptee', 'planifiee'].includes(ride.status)
                }
                canRelaunch={isPassenger && ride.status === 'expiree'}
              />
            </div>

            {/* Partage automatique du suivi (v2.23) : au départ de la
                course, le lien est envoyé aux contacts de confiance
                (e-mail) — renvoi en 1 tap ici pour les autres. */}
            {isPassenger && ['acceptee', 'en_cours'].includes(ride.status) && (
              <TrustedSharePanel
                shareUrl={ride.shareToken ? `/suivi/${ride.shareToken}` : `/courses/${ride.id}`}
                pickup={ride.pickup}
                destination={ride.destination}
                driverName={driver?.name ?? null}
                plate={driver?.plate ?? null}
                priceLabel={
                  ride.loyaltyFree
                    ? '0 FCFA — 10e course offerte'
                    : ride.proposedPrice !== null
                      ? formatFcfa(ride.proposedPrice)
                      : `estimation ${formatFcfa(ride.estimatedPrice)}`
                }
              />
            )}

            {/* Reçu détaillé (v2.23) : prix, distance, durée, chauffeur,
                commission — montants figés à l'acceptation. */}
            {ride.status === 'terminee' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
                <RideReceiptCard
                  receipt={buildRideReceipt({
                    ride,
                    driverName: driver?.name ?? null,
                    vehicleLabel: driver?.vehicleLabel ?? null,
                    plate: driver?.plate ?? null,
                    paymentLabel: PAYMENT_LABELS[ride.paymentMethod],
                  })}
                />
              </div>
            )}

            {/* RideCheck + audio du trajet (v2.34) : check-in passager
                en cas d'anomalie (long arrêt, déviation, course trop
                longue) + enregistrement audio chiffré, envoyé
                uniquement en cas de litige. Visible pendant la course,
                pour les deux parties. */}
            {ride.status === 'en_cours' && (isPassenger || isDriver) && (
              <RideCheckPanel rideId={ride.id} role={isPassenger ? 'passager' : 'chauffeur'} />
            )}

            {/* Avis après course (v2.2) : note, plainte ou recommandation. */}
            {ride.status === 'terminee' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <h2 className="font-black text-slate-900">Ton avis sur cette course</h2>
                <FeedbackForm rideId={ride.id} isPassenger={isPassenger} />
              </div>
            )}

            {/* Litige (v2.15) : un problème sur la course — Stacks Drive
                examine le dossier et tranche (ajustement si besoin). */}
            {(ride.status === 'terminee' || ride.status === 'annulee') && (isPassenger || isDriver) && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <h2 className="font-black text-slate-900">Un problème avec cette course ?</h2>
                <DisputeForm
                  rideId={ride.id}
                  myRole={isPassenger ? 'passager' : 'chauffeur'}
                  rideStatus={ride.status as 'terminee' | 'annulee'}
                />
              </div>
            )}

            {ride.status === 'terminee' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-2">
                <h2 className="font-black text-slate-900 flex items-center gap-1.5">
                  <BadgeCheck size={18} className="text-stacks-green" /> Course terminée
                </h2>
                <p className="text-sm text-slate-500">
                  Merci d’avoir roulé avec Stacks Drive. Ta note aide les autres
                  passagers et chauffeurs de Libreville.
                </p>
              </div>
            )}
          </aside>
        </div>

        <Footer />
      </main>
    </div>
  );
}
