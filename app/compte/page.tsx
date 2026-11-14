import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { ProfileForm } from '@/components/compte/ProfileForm';
import { TrustedContactsForm } from '@/components/compte/TrustedContactsForm';
import { PassengerTutorial } from '@/components/tuto/PassengerTutorial';
import { TutoReplayButton } from '@/components/tuto/TutoReplayButton';
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

      {/* Contacts de confiance (v2.23) : au départ de chaque course,
          ton lien de suivi part automatiquement vers ces contacts. */}
      {!isDriver && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="font-black text-lg text-slate-900">Contacts de confiance</h2>
          <TrustedContactsForm />
        </div>
      )}

      {/* Tutoriel passager (v2.21) : rejouable depuis le compte — le
          premier lancement l'affiche une seule fois, ici on le revoit. */}
      {!isDriver && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-3">
          <h2 className="font-black text-lg text-slate-900">Besoin d’aide ?</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Revois comment commander une course : estimation, propositions des
            chauffeurs, prix figé, code PIN et paiement — en 6 écrans, avec
            les vrais écrans de l’appli.
          </p>
          <TutoReplayButton kind="passager" />
          <PassengerTutorial />
          <p className="text-sm text-slate-600 leading-relaxed">
            Une autre question ? La{' '}
            <Link href="/aide" className="font-bold text-stacks-green hover:underline">
              page d’aide
            </Link>{' '}
            répond aux questions courantes (prix, code PIN, paiement, annulation, Solo ou Groupe).
          </p>
        </div>
      )}

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
                      ? 'Groupe · 1 place'
                      : 'Solo · véhicule entier';
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
                      {ride.status === 'terminee' && (
                        <>
                          {ride.distanceKm !== null ? ` · ~${Math.max(1, Math.round(ride.distanceKm))} km` : ''}
                          {ride.durationMin !== null ? ` · ~${ride.durationMin} min` : ''}
                          {!ride.loyaltyFree && ride.proposedPrice !== null
                            ? ` · commission ${formatFcfa(ride.platformFee)}`
                            : ''}
                        </>
                      )}
                      {ride.status === 'annulee' && ride.cancelReason ? ` · Annulée — ${ride.cancelReason}` : ''}
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
