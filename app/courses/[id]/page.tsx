import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, BadgeCheck, Car, KeyRound, MapPin, ShieldCheck, Users, Wallet } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { TrackingMap } from '@/components/rides/TrackingMap';
import { DriverCard } from '@/components/home/DriverCard';
import { RideActions } from '@/components/rides/RideActions';
import { PinEntry } from '@/components/driver/PinEntry';
import { FeedbackForm } from '@/components/rides/FeedbackForm';
import { RideStatusBadge } from '@/components/shared/StatusBadge';
import { getRideRequestById } from '@/lib/rides';
import { getSessionUser, createClient } from '@/lib/supabase/server';
import { formatFcfa } from '@/lib/commission';
import { estimateFare } from '@/lib/pricing';
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

  // Note moyenne du chauffeur assigné.
  let driver = row.driver
    ? {
        id: row.driver.id,
        name: row.driver.full_name ?? 'Chauffeur Stacks Drive',
        phone: row.driver.phone,
        vehicleType: row.driver.vehicle_type,
        vehicleLabel: [row.driver.vehicle_brand, row.driver.vehicle_model, row.driver.vehicle_color]
          .filter(Boolean)
          .join(' '),
        plate: row.driver.plate,
        seats: row.driver.seats,
        isVerified: row.driver.is_verified,
        isOnline: row.driver.is_online,
        rating: null as number | null,
        trips: 0,
        area: row.driver.current_area,
        lat: row.driver.last_lat ?? NEIGHBORHOOD_COORDS[row.driver.current_area as Neighborhood]?.lat ?? null,
        lng: row.driver.last_lng ?? NEIGHBORHOOD_COORDS[row.driver.current_area as Neighborhood]?.lng ?? null,
        isDemo: row.driver.is_demo,
      }
    : null;
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
      : estimateFare(
          ride.pickup as Neighborhood,
          ride.destination as Neighborhood,
          ride.rideType,
          ride.vehiclePreference
        );
  const passenger = row.passenger ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
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
              {ride.rideType === 'groupe' ? `Groupe · ${ride.seats} passager${ride.seats > 1 ? 's' : ''}` : 'Solo'}
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

        {/* Code PIN (v2.2) — le passager le donne au chauffeur pour démarrer. */}
        {isPassenger && ride.pinCode && ['acceptee', 'en_cours'].includes(ride.status) && (
          <div className="bg-night-900 border border-white/10 rounded-3xl p-6 shadow-sm text-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-black text-lg flex items-center gap-2">
                <KeyRound size={20} className="text-gold" />
                Ton code de démarrage
              </p>
              <p className="text-sm text-slate-300 mt-1">
                Donne ce code à ton chauffeur quand il arrive — c’est lui qui
                démarre le trajet avec. Ne le partage avec personne d’autre.
              </p>
            </div>
            <p className="font-black text-5xl tracking-[0.3em] text-gold" aria-label={`Code : ${ride.pinCode.split('').join(' ')}`}>
              {ride.pinCode}
            </p>
          </div>
        )}
        {isPassenger && ride.pinLocked && ride.status === 'acceptee' && (
          <p role="alert" className="text-sm font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl p-4">
            Course verrouillée après 5 codes faux. Contacte Stacks Drive pour
            la débloquer, ou annule la course.
          </p>
        )}

        {/* Vue chauffeur (v2.2) : passager, trajet, temps, distance, prix, paiement. */}
        {isDriver && (
          <div className="bg-white border-2 border-stacks-green rounded-3xl p-6 shadow-sm space-y-3">
            <h2 className="font-black text-lg text-slate-900">Ta course</h2>
            <p className="text-sm text-slate-600">
              Passager : <strong className="text-slate-900">{passenger?.full_name ?? 'Passager'}</strong>
              {passenger?.phone ? ` · ${passenger.phone}` : ''}
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
                  {formatFcfa(ride.proposedPrice ?? ride.estimatedPrice)}
                </p>
                <p className="text-xs text-slate-400">dont {formatFcfa(ride.driverShare)} pour toi</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Paiement</p>
                <p className="font-black text-stacks-navy mt-1">{PAYMENT_LABELS[ride.paymentMethod]}</p>
                <p className="text-xs text-slate-400">directement par le passager</p>
              </div>
            </div>
            {ride.status === 'acceptee' && <PinEntry rideId={ride.id} refreshOnStart />}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Carte + détails */}
          <section className="lg:col-span-2 space-y-6">
            <div className="h-[380px] sm:h-[440px] rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
              <TrackingMap
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
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
              <h2 className="font-black text-lg text-slate-900">Détails de la course</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div className="bg-slate-50 rounded-2xl p-3">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Prix</p>
                  <p className="font-black text-stacks-navy mt-1">
                    {ride.loyaltyFree
                      ? '0 FCFA — offerte'
                      : formatFcfa(ride.proposedPrice ?? ride.estimatedPrice)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {ride.loyaltyFree
                      ? '10e course offerte'
                      : ride.proposedPrice !== null
                        ? 'prix proposé et accepté'
                        : 'prix estimé (fixe)'}
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
                    <Users size={16} /> {ride.seats}
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
                Prix garanti · Commission Stacks Drive 5 % au lancement
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

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <RideActions
                rideId={ride.id}
                canStart={isDriver && ride.status === 'acceptee'}
                canComplete={isDriver && ride.status === 'en_cours'}
                canCancel={
                  (isPassenger || isDriver) &&
                  ['recherche', 'propositions', 'acceptee'].includes(ride.status)
                }
              />
            </div>

            {/* Avis après course (v2.2) : note, plainte ou recommandation. */}
            {ride.status === 'terminee' && (
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                <h2 className="font-black text-slate-900">Ton avis sur cette course</h2>
                <FeedbackForm rideId={ride.id} isPassenger={isPassenger} />
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
