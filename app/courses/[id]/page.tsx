import Link from 'next/link';
import { ArrowLeft, BadgeCheck, CalendarClock, Car, MapPin, Users, Wallet } from 'lucide-react';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { BookingForm } from '@/components/rides/BookingForm';
import { formatDepartureTime } from '@/components/rides/RideCard';
import { getRideById, hasBooked } from '@/lib/rides';
import { getSessionUser } from '@/lib/supabase/server';
import { COMMISSION_RATE, formatFcfa } from '@/lib/commission';
import { PAYMENT_LABELS } from '@/lib/neighborhoods';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export default async function CoursePage({ params }: Ctx) {
  const { id } = await params;
  const sessionUser = await getSessionUser();
  const found = await getRideById(id, sessionUser?.id ?? null);

  const user = sessionUser
    ? {
        id: sessionUser.id,
        email: sessionUser.email,
        role: sessionUser.profile?.role ?? 'passager',
        isAdmin: sessionUser.profile?.is_admin ?? false,
      }
    : null;

  if (!found) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header user={user} />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm text-center space-y-3">
            <p className="text-lg font-black text-slate-900">Course introuvable</p>
            <p className="text-sm text-slate-500">
              Cette course n’existe plus, ou elle n’est plus publiée.
            </p>
            <Link href="/" className="inline-block text-stacks-green font-bold hover:underline">
              Retour aux courses
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const { ride, driver } = found;
  const { date, time } = formatDepartureTime(ride.departureTime);
  const isPast = new Date(ride.departureTime).getTime() < Date.now();
  const isOwner = sessionUser?.id === ride.driverId;
  const alreadyBooked = sessionUser ? await hasBooked(sessionUser.id, ride.id) : false;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Header user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-stacks-green">
          <ArrowLeft size={16} /> Toutes les courses
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Détail de la course */}
          <section className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`badge-ride ${ride.rideType === 'partagee' ? 'partagee' : 'solo'}`}>
                  {ride.rideType === 'partagee' ? 'Course partagée' : 'Course solo'}
                </span>
                {ride.isDemo && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                    Course démo
                  </span>
                )}
              </div>
              <span className="text-sm font-bold text-slate-500 flex items-center gap-1.5">
                <CalendarClock size={16} /> {date} · {time}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-3 font-black text-2xl text-slate-900">
                <MapPin size={22} className="text-stacks-green shrink-0" />
                {ride.departure}
              </div>
              <div className="flex items-center gap-3 pl-1 text-2xl font-black text-slate-900">
                <span className="w-[22px] flex flex-col items-center">
                  <span className="w-px h-5 bg-slate-300" />
                  <span className="text-slate-400 text-base">↓</span>
                </span>
                {ride.destination}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Prix</p>
                <p className="font-black text-stacks-navy mt-1">{formatFcfa(ride.price)}</p>
                <p className="text-xs text-slate-400">{ride.rideType === 'partagee' ? 'par passager' : 'la course'}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Places</p>
                <p className="font-black text-stacks-navy mt-1 flex items-center gap-1">
                  <Users size={16} /> {ride.seatsAvailable}/{ride.seatsTotal}
                </p>
                <p className="text-xs text-slate-400">restantes / total</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Véhicule</p>
                <p className="font-black text-stacks-navy mt-1 flex items-center gap-1">
                  <Car size={16} /> {ride.vehicleType}
                </p>
                <p className="text-xs text-slate-400 truncate">{ride.vehicleLabel || '—'}</p>
              </div>
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Paiement</p>
                <p className="font-black text-stacks-navy mt-1 flex items-center gap-1">
                  <Wallet size={16} /> {ride.paymentMethods.map((m) => PAYMENT_LABELS[m]).join(', ')}
                </p>
                <p className="text-xs text-slate-400">directement au chauffeur</p>
              </div>
            </div>

            {ride.note && (
              <div className="space-y-1">
                <h3 className="font-black text-slate-900">Précisions du chauffeur</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{ride.note}</p>
              </div>
            )}

            {/* Chauffeur */}
            <div className="border-t border-slate-100 pt-5 space-y-2">
              <h3 className="font-black text-slate-900">Ton chauffeur</h3>
              <p className="text-sm text-slate-600 flex flex-wrap items-center gap-2">
                <span className="font-bold text-slate-900">{driver.name}</span>
                {driver.isVerified && (
                  <span className="inline-flex items-center gap-1 text-xs font-black text-stacks-green">
                    <BadgeCheck size={14} /> Vérifié
                  </span>
                )}
                {driver.phone && (
                  <a href={`tel:${driver.phone.replace(/[^+0-9]/g, '')}`} className="text-stacks-green font-bold hover:underline">
                    {driver.phone}
                  </a>
                )}
              </p>
              <p className="text-xs text-slate-400">
                Commission Stacks Drive : {Math.round(COMMISSION_RATE * 100)} % au
                lancement (8 % ensuite, 10 % maximum) — le chauffeur garde le reste.
              </p>
            </div>
          </section>

          {/* Réservation */}
          <aside className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm h-fit lg:sticky lg:top-24">
            <h2 className="font-black text-xl text-slate-900">Réserver</h2>
            <p className="text-sm text-slate-500 mt-1">
              {formatFcfa(ride.price)} {ride.rideType === 'partagee' ? 'par place' : 'la course'} · prix fixe.
            </p>
            <div className="mt-5">
              {isPast ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  Cette course est déjà passée.
                </p>
              ) : ride.seatsAvailable <= 0 ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  Cette course est complète.
                </p>
              ) : isOwner ? (
                <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  C’est ta course — gère-la depuis ton{' '}
                  <Link href="/tableau-de-bord" className="text-stacks-green font-bold hover:underline">
                    tableau de bord
                  </Link>
                  .
                </p>
              ) : alreadyBooked ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-4">
                  Tu as déjà réservé cette course — retrouve-la dans{' '}
                  <Link href="/mes-courses" className="font-bold hover:underline">
                    Mes courses
                  </Link>
                  .
                </p>
              ) : !user ? (
                <div className="space-y-3">
                  <p className="text-sm text-slate-600">
                    Connecte-toi pour réserver ta place.
                  </p>
                  <Link
                    href={`/connexion?next=/courses/${ride.id}`}
                    className="block text-center bg-stacks-green text-white font-black px-6 py-4 rounded-full hover:bg-stacks-greenLight transition-colors"
                  >
                    Se connecter pour réserver
                  </Link>
                  <Link
                    href={`/inscription?next=/courses/${ride.id}`}
                    className="block text-center text-sm font-bold text-stacks-green hover:underline"
                  >
                    Créer un compte (gratuit)
                  </Link>
                </div>
              ) : (
                <BookingForm ride={ride} />
              )}
            </div>
          </aside>
        </div>

        <Footer />
      </main>
    </div>
  );
}
