import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageShell } from '@/components/shared/PageShell';
import { RideForm } from '@/components/rides/RideForm';
import { getSessionUser } from '@/lib/supabase/server';
import type { VehicleType } from '@/lib/neighborhoods';

export const dynamic = 'force-dynamic';

export default async function PublierCoursePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/connexion?next=/tableau-de-bord/publier');

  if (sessionUser.profile?.role !== 'chauffeur') {
    return (
      <PageShell title="Publier une course" subtitle="Décris ton trajet en quelques minutes.">
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <p className="text-slate-600">
            Seuls les comptes chauffeurs peuvent publier des courses. Ton compte
            actuel est un compte passager.
          </p>
          <Link href="/inscription" className="inline-block px-6 py-3.5 bg-stacks-green text-white font-bold rounded-full hover:bg-stacks-greenLight transition-colors">
            Créer un compte chauffeur
          </Link>
        </div>
      </PageShell>
    );
  }

  const profile = sessionUser.profile;
  const vehicleLabel = [profile?.vehicle_brand, profile?.vehicle_model, profile?.vehicle_color]
    .filter(Boolean)
    .join(' ');
  const defaultVehicle =
    profile?.vehicle_type && vehicleLabel
      ? { vehicleType: profile.vehicle_type as VehicleType, vehicleLabel }
      : undefined;

  const needsVehicle = !profile?.vehicle_brand && !profile?.plate;

  return (
    <PageShell
      title="Publier une course"
      subtitle="Ta course sera visible immédiatement par tous les passagers de Libreville."
    >
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm">
        {needsVehicle && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5">
            Pense à compléter ton véhicule dans{' '}
            <Link href="/compte" className="font-bold underline">Mon compte</Link>{' '}
            (marque, modèle, couleur, plaque) — les passagers le verront sur ta course.
          </p>
        )}
        <RideForm defaultVehicle={defaultVehicle} />
      </div>
    </PageShell>
  );
}
