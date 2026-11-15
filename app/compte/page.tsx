import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DriveCash, DriveChevronRight, DriveGift, DriveHelp, DriveHistory, DrivePin, DriveSettings, DriveShield, DriveSmartphone, DriveSos, DriveUser } from '@/components/icons/DriveUi';
import { DriveCarMini } from '@/components/icons/DriveCar';
import { PageShell } from '@/components/shared/PageShell';
import { ProfileForm } from '@/components/compte/ProfileForm';
import { TrustedContactsForm } from '@/components/compte/TrustedContactsForm';
import { PassengerProfileHeader } from '@/components/compte/PassengerProfileHeader';
import { MapReportForm } from '@/components/compte/MapReportForm';
import { PassengerTutorial } from '@/components/tuto/PassengerTutorial';
import { TutoReplayButton } from '@/components/tuto/TutoReplayButton';
import { VerificationForm } from '@/components/driver/VerificationForm';
import { RideStatusBadge } from '@/components/shared/StatusBadge';
import { getSessionUser } from '@/lib/supabase/server';
import { getPassengerLoyaltyProgress, getPassengerRideHistory } from '@/lib/rides';
import { formatFcfa } from '@/lib/commission';
import { formatDepartureTime } from '@/lib/dates';

export const dynamic = 'force-dynamic';

function Card({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
      {children}
    </div>
  );
}

function RoundButton({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-2 group">
      <span className="w-14 h-14 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center group-hover:bg-rose-500/10 group-hover:text-rose-600 transition-colors">
        {icon}
      </span>
      <span className="text-xs font-bold text-slate-700">{label}</span>
    </Link>
  );
}

/** Ligne de la liste groupée (v2.51, façon Bolt, langage v2.52) :
 *  icône Drive + libellé (+ sous-titre réel quand il y en a un) +
 *  chevron, qui ancre vers la carte existante ci-dessous. Aucune
 *  fonctionnalité nouvelle : juste un accès rapide à ce qui existe
 *  déjà. Pas de Bolt Plus, pas de Promotions, pas de Profil
 *  familial ni professionnel (interdits) — la fidélité réelle
 *  remplace les promos. */
function GroupRow({
  href,
  icon,
  label,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-5 py-4 hover:bg-white/5 transition-colors">
      <span className="w-10 h-10 rounded-full bg-white/10 border border-white/10 text-slate-200 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-black text-white">{label}</span>
        {subtitle && <span className="block text-sm text-slate-400 truncate">{subtitle}</span>}
      </span>
      <DriveChevronRight size={18} className="text-slate-500 shrink-0" />
    </Link>
  );
}

const VERIFICATION_SUBTITLES: Record<string, string> = {
  non_verifie: 'Non vérifié',
  en_attente: 'Vérification en cours',
  verifie: 'Vérifié',
  refuse: 'Vérification refusée',
};

export default async function ComptePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !sessionUser.profile) redirect('/connexion?next=/compte');

  const profile = sessionUser.profile;
  const isDriver = profile.role === 'chauffeur';
  // Historique (v2.10) : tes courses passées, visibles par toi seul.
  // Ni code PIN, ni position, ni messages ici.
  const history = isDriver ? [] : await getPassengerRideHistory(sessionUser.id, 10);
  // Fidélité réelle (v2.49) : progression vers la 10e course offerte.
  const loyalty = isDriver ? null : await getPassengerLoyaltyProgress(sessionUser.id);

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
      {/* Place pour la navigation basse (mobile). */}
      <div className="pb-28 sm:pb-8 space-y-6">
        {/* Liste groupée (v2.51, façon Bolt, langage v2.52 : verre
            nuit à liseré, faisceau) : accès rapide aux cartes
            existantes ci-dessous. L'état de vérification de
            l'e-mail n'est pas exposé par getSessionUser : la ligne
            Profil affiche l'e-mail réel, sans mention d'état
            inventée. */}
        <nav aria-label="Raccourcis du compte" className="ride-card divide-y divide-white/10 overflow-hidden">
          <GroupRow
            href={isDriver ? '#parametres' : '#profil'}
            icon={<DriveUser size={20} />}
            label="Profil"
            subtitle={sessionUser.email}
          />
          {!isDriver && (
            <GroupRow
              href="#paiement"
              icon={<DriveCash size={20} />}
              label="Paiement"
              subtitle="Espèces · Airtel · Moov"
            />
          )}
          <GroupRow href="/aide" icon={<DriveHelp size={20} />} label="Aide" />
          {!isDriver && (
            <GroupRow href="#securite" icon={<DriveShield size={20} />} label="Sécurité" />
          )}
          <GroupRow
            href="#adresses"
            icon={<DrivePin size={20} />}
            label="Lieux sauvegardés"
            subtitle="Maison & Travail"
          />
          {isDriver && (
            <GroupRow
              href="#verification"
              icon={<DriveShield size={20} />}
              label="Vérification chauffeur"
              subtitle={VERIFICATION_SUBTITLES[profile.verification_status ?? 'non_verifie'] ?? 'Non vérifié'}
            />
          )}
          <GroupRow href="#parametres" icon={<DriveSettings size={20} />} label="Paramètres" />
          {!isDriver && (
            <GroupRow
              href="/devenir-chauffeur"
              icon={<DriveCarMini variant="sedan" size={22} tone="light" />}
              label="Devenir chauffeur"
              subtitle="Gagner en conduisant"
            />
          )}
        </nav>

        {!isDriver && (
          <>
            {/* En-tête du profil passager (v2.49) : photo, nom, téléphone,
              complétion réelle X/2, et 4 raccourcis. */}
            <Card id="profil">
              <PassengerProfileHeader name={profile.full_name} phone={profile.phone} />
              <div className="flex justify-around pt-2 border-t border-slate-100">
                <RoundButton href="/activite" icon={<DriveHistory size={22} />} label="Historique" />
                <RoundButton href="/aide" icon={<DriveHelp size={22} />} label="Assistance" />
                <RoundButton href="#adresses" icon={<DrivePin size={22} />} label="Adresses" />
                <RoundButton href="#parametres" icon={<DriveSettings size={22} />} label="Paramètres" />
              </div>
            </Card>

          {/* Ta 10e course offerte (v2.49) : progression RÉELLE — la
              règle serveur est la même que celle qui rend la 10e
              course gratuite (loyaltyFree). Aucun code promotionnel
              n'existe : pas de champ « code promo » inventé. */}
          {loyalty && (
            <Card>
              <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
                <DriveGift size={20} className="text-rose-500" /> Ta 10e course offerte
              </h2>
              {loyalty.nextIsFree ? (
                <p className="text-sm text-slate-600 leading-relaxed">
                  <strong className="text-slate-900">Ta prochaine course est offerte.</strong> Tu as
                  terminé 9 courses — la 10e ne te coûte rien, le chauffeur est payé par Stacks.
                </p>
              ) : (
                <>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Encore <strong className="text-slate-900">{10 - loyalty.towardFree} course{10 - loyalty.towardFree > 1 ? 's' : ''}</strong>{' '}
                    avant ta course offerte — {loyalty.completedCount} course{loyalty.completedCount > 1 ? 's' : ''} terminée{loyalty.completedCount > 1 ? 's' : ''} au total.
                  </p>
                  <div
                    className="h-2 rounded-full bg-slate-100 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={loyalty.towardFree}
                    aria-valuemin={0}
                    aria-valuemax={10}
                    aria-label="Progression vers la course offerte"
                  >
                    <div
                      className="h-full bg-rose-500 rounded-full transition-all duration-500"
                      style={{ width: `${(loyalty.towardFree / 10) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500">{loyalty.towardFree} / 10 vers la course offerte.</p>
                </>
              )}
            </Card>
          )}

          {/* Paiement au chauffeur (v2.49) : les VRAIS moyens — espèces
              ou Mobile Money, payés directement au chauffeur. Simple
              affichage : l'appli ne touche jamais l'argent, aucune
              saisie de carte. */}
          <Card id="paiement">
            <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
              <DriveCash size={20} className="text-sarcelle" /> Paiement au chauffeur
            </h2>
            <ul className="space-y-2 text-sm text-slate-600">
              <li className="flex items-center gap-2">
                <DriveCash size={16} className="text-slate-400 shrink-0" /> Espèces — directement au chauffeur à la fin de la course.
              </li>
              <li className="flex items-center gap-2">
                <DriveSmartphone size={16} className="text-slate-400 shrink-0" /> Airtel Money — transfert direct au chauffeur.
              </li>
              <li className="flex items-center gap-2">
                <DriveSmartphone size={16} className="text-slate-400 shrink-0" /> Moov Money — transfert direct au chauffeur.
              </li>
            </ul>
            <p className="text-xs text-slate-500">
              Le montant à payer s’affiche à l’écran avant l’arrivée, et le reçu est dans ton historique.
            </p>
          </Card>

          {/* Signaler une erreur de carte (v2.49) : lieu manquant,
              quartier mal placé, erreur d'adresse — le signalement
              crée un vrai ticket visible dans /admin. */}
          <Card>
            <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
              <DrivePin size={20} className="text-rose-500" /> Signaler une erreur de carte
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Un lieu manque, un quartier est mal placé, une adresse est fausse ? Dis-le ici — la
              carte est corrigée avec les prochains lots.
            </p>
            <MapReportForm />
          </Card>
        </>
      )}

      {/* Paramètres (v2.49) : nom, téléphone, véhicule (chauffeur) et
          lieux favoris Maison & Travail (ancre #adresses à l'intérieur). */}
      <Card id="parametres">
        <ProfileForm profile={profile} />
      </Card>

      {/* Sécurité (v2.49) : SOS, contacts de confiance, partage de
          course, code PIN — regroupe l'existant, ne réinvente rien. */}
      {!isDriver && (
        <Card id="securite">
          <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
            <DriveShield size={20} className="text-rose-500" /> Sécurité
          </h2>
          <div className="flex flex-wrap gap-2">
            <a
              href="tel:112"
              className="inline-flex items-center gap-2 bg-red-600 text-white text-sm font-black px-5 py-3 rounded-full hover:bg-red-700"
            >
              <DriveSos size={16} /> SOS — appeler le 112
            </a>
            <Link
              href="/aide"
              className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 text-sm font-bold px-5 py-3 rounded-full hover:bg-slate-200"
            >
              Aide & questions →
            </Link>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            En course, ton code PIN s’affiche en grand et ton lien de suivi part automatiquement
            vers tes contacts de confiance ci-dessous.
          </p>
          <h3 className="font-black text-slate-900">Contacts de confiance</h3>
          <TrustedContactsForm />
        </Card>
      )}

      {/* Informations (v2.49) : documents légaux existants. */}
      {!isDriver && (
        <Card>
          <h2 className="font-black text-lg text-slate-900">Informations</h2>
          <ul className="space-y-2 text-sm font-bold">
            <li>
              <Link href="/cgu" className="text-stacks-green hover:underline">Conditions générales d’utilisation</Link>
            </li>
            <li>
              <Link href="/confidentialite" className="text-stacks-green hover:underline">Politique de confidentialité</Link>
            </li>
            <li>
              <Link href="/mentions-legales" className="text-stacks-green hover:underline">Mentions légales</Link>
            </li>
          </ul>
        </Card>
      )}

      {/* Tutoriel passager (v2.21) : rejouable depuis le compte — le
          premier lancement l'affiche une seule fois, ici on le revoit. */}
      {!isDriver && (
        <Card>
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
        </Card>
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
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-black text-lg text-slate-900">Historique de mes courses</h2>
            <Link href="/activite" className="text-sm font-bold text-stacks-green hover:underline">
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
        </Card>
      )}
      </div>
    </PageShell>
  );
}
