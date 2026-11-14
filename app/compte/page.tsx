import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { ProfileForm } from '@/components/compte/ProfileForm';
import { VerificationForm } from '@/components/driver/VerificationForm';
import { RideStatusBadge } from '@/components/shared/StatusBadge';
import { getSessionUser } from '@/lib/supabase/server';
import { getPassengerRideHistory } from '@/lib/rides';
import { formatFcfa } from '@/lib/commission';
import { formatDepartureTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function ComptePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !sessionUser.profile) redirect('/connexion?next=/compte');

  const profile = sessionUser.profile;
  const isDriver = profile.role === 'chauffeur';
  // Historique (v2.10) : tes courses passées, visibles par toi seul.
  // Ni code PIN, ni position, ni messages ici.
  const history = isDriver ? [] : await getPassengerRideHistory(sessionUser.id, 10);

  return (
    <PageShell
      title="Mon compte"
      subtitle={`Bonjour ${profile.full_name ?? ''} — tes informations${isDriver ? ' et ton véhicule' : ''}.`}
      user={{ id: sessionUser.id, email: sessionUser.email }}
      actions={
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3.5 bg-white border border-slate-200 text-stacks-navy font-bold rounded-full hover:border-stacks-green/40 transition-colors"
        >
          ← Retour à la carte
        </Link>
      }
    >
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        <ProfileForm profile={profile} />
      </div>

      {isDriver && (
        <div id="verification" className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm scroll-mt-24">
          <VerificationForm
            verificationStatus={
              (profile.verification_status ?? 'non_verifie') as
                | 'non_verifie'
                | 'en_attente'
                | 'verifie'
                | 'refuse'
            }
            verificationNote={profile.verification_note}
            accountName={profile.full_name}
          />
        </div>
      )}

      {/* Historique de mes courses (v2.10, passagers) : date, trajet,
          type, prix payé, chauffeur, statut, note donnée. Tes courses
          passées — visibles par toi seul. */}
      {!isDriver && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-black text-lg text-slate-900">Historique de mes courses</h2>
            <Link href="/mes-courses" className="text-sm font-bold text-stacks-green hover:underline">
              Voir tout l’historique →
            </Link>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune course terminée pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {history.map(({ ride, driverName }) => {
                const { date, time } = formatDepartureTime(ride.createdAt);
                const typeLabel =
                  ride.vehiclePreference === 'moto'
                    ? 'Moto'
                    : ride.rideType === 'groupe'
                      ? `Groupe · ${ride.seats} pass.`
                      : 'Solo';
                return (
                  <li key={ride.id} className="py-3 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <Link href={`/courses/${ride.id}`} className="text-sm font-bold text-slate-900 hover:text-stacks-green">
                        {ride.pickup} → {ride.destination}
                      </Link>
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-900">
                          {ride.loyaltyFree
                            ? '0 FCFA — offerte'
                            : ride.proposedPrice !== null
                              ? formatFcfa(ride.proposedPrice)
                              : '—'}
                        </span>
                        <RideStatusBadge status={ride.status} />
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {date} · {time} · {typeLabel}
                      {driverName ? ` · Chauffeur : ${driverName}` : ''}
                      {ride.ratingDriver ? ` · Ta note : ${ride.ratingDriver}/5` : ''}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </PageShell>
  );
}
