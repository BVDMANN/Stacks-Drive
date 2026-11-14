"use client";

import { useState } from 'react';
import { PremiumButton } from '@/components/shared/PremiumButton';
import { VerificationStatusBadge } from '@/components/shared/StatusBadge';
import {
  SELECTABLE_NEIGHBORHOODS,
  VEHICLE_TYPES,
  type Neighborhood,
  type VehicleType,
} from '@/lib/neighborhoods';
import type { SessionProfile } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

const inputCls =
  'w-full px-4 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none';
const labelCls = 'text-xs font-black uppercase tracking-widest text-slate-500';

/** Formulaire de profil : identité + véhicule et disponibilité (chauffeurs). */
export function ProfileForm({ profile }: { profile: SessionProfile }) {
  const isDriver = profile.role === 'chauffeur';
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone ?? '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    (profile.vehicle_type as VehicleType) ?? 'Berline'
  );
  const [vehicleBrand, setVehicleBrand] = useState(profile.vehicle_brand ?? '');
  const [vehicleModel, setVehicleModel] = useState(profile.vehicle_model ?? '');
  const [vehicleColor, setVehicleColor] = useState(profile.vehicle_color ?? '');
  const [plate, setPlate] = useState(profile.plate ?? '');
  const [seats, setSeats] = useState(profile.seats ?? 4);
  const [currentArea, setCurrentArea] = useState<Neighborhood | ''>(
    (profile.current_area as Neighborhood | '') ?? ''
  );
  const [isOnline, setIsOnline] = useState(profile.is_online);
  // Lieux favoris (v2.30) : domicile / travail — quartier + précision
  // libre, modifiables et supprimables ici.
  const [homeNeighborhood, setHomeNeighborhood] = useState<Neighborhood | ''>(
    (profile.home_neighborhood as Neighborhood | '') ?? ''
  );
  const [homeDetail, setHomeDetail] = useState(profile.home_detail ?? '');
  const [workNeighborhood, setWorkNeighborhood] = useState<Neighborhood | ''>(
    (profile.work_neighborhood as Neighborhood | '') ?? ''
  );
  const [workDetail, setWorkDetail] = useState(profile.work_detail ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setLoading(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: fullName.trim(),
        phone: phone.trim(),
        // Lieux favoris (v2.30) : null = supprimer le lieu.
        homeNeighborhood: homeNeighborhood || null,
        homeDetail: homeDetail.trim() || null,
        workNeighborhood: workNeighborhood || null,
        workDetail: workDetail.trim() || null,
        ...(isDriver
          ? {
              vehicleType,
              vehicleBrand: vehicleBrand.trim(),
              vehicleModel: vehicleModel.trim(),
              vehicleColor: vehicleColor.trim(),
              plate: plate.trim().toUpperCase(),
              seats,
              currentArea: currentArea || undefined,
              isOnline,
            }
          : {}),
      }),
    });
    const data = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(data?.error ?? 'Enregistrement impossible. Réessaie.');
      return;
    }
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          Profil enregistré.
        </p>
      )}

      {/* Statut */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-slate-100 text-slate-700">
          Compte {isDriver ? 'chauffeur' : 'passager'}
        </span>
        {isDriver && (
          <VerificationStatusBadge
            status={profile.verification_status ?? 'non_verifie'}
          />
        )}
        {profile.is_admin && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-stacks-navy text-white">
            Admin
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label htmlFor="full-name" className={labelCls}>Nom complet</label>
          <input
            id="full-name"
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="phone" className={labelCls}>Téléphone</label>
          <input
            id="phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      <p className="text-sm text-slate-500">
        E-mail du compte : <strong className="text-slate-700">{profile.email}</strong>
      </p>

      {/* Lieux favoris (v2.30) : domicile / travail — raccourcis 1 tap
          sur l'accueil pour définir le départ ou la destination.
          Vider le quartier + la précision supprime le lieu. */}
      <div className="border-t border-slate-100 pt-5 space-y-5">
        <h3 className="font-black text-slate-900">Mes lieux — Maison &amp; Travail</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="home-neighborhood" className={labelCls}>🏠 Maison — quartier</label>
            <select
              id="home-neighborhood"
              value={homeNeighborhood}
              onChange={(e) => setHomeNeighborhood(e.target.value as Neighborhood | '')}
              className={inputCls}
            >
              <option value="">Pas de domicile enregistré</option>
              {SELECTABLE_NEIGHBORHOODS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <input
              id="home-detail"
              type="text"
              maxLength={120}
              value={homeDetail}
              onChange={(e) => setHomeDetail(e.target.value)}
              placeholder="Précision libre — ex : près de la pharmacie"
              className={inputCls}
            />
            {homeNeighborhood && (
              <button
                type="button"
                onClick={() => {
                  setHomeNeighborhood('');
                  setHomeDetail('');
                }}
                className="text-xs font-black text-red-600 hover:underline"
              >
                Supprimer « Maison »
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="work-neighborhood" className={labelCls}>💼 Travail — quartier</label>
            <select
              id="work-neighborhood"
              value={workNeighborhood}
              onChange={(e) => setWorkNeighborhood(e.target.value as Neighborhood | '')}
              className={inputCls}
            >
              <option value="">Pas de lieu de travail enregistré</option>
              {SELECTABLE_NEIGHBORHOODS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <input
              id="work-detail"
              type="text"
              maxLength={120}
              value={workDetail}
              onChange={(e) => setWorkDetail(e.target.value)}
              placeholder="Précision libre — ex : entrée principale"
              className={inputCls}
            />
            {workNeighborhood && (
              <button
                type="button"
                onClick={() => {
                  setWorkNeighborhood('');
                  setWorkDetail('');
                }}
                className="text-xs font-black text-red-600 hover:underline"
              >
                Supprimer « Travail »
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Sur l’accueil, « Maison » et « Travail » deviennent des raccourcis : 1 tap pour les
          mettre en départ ou en destination.
        </p>
      </div>

      {isDriver && (
        <>
          <div className="border-t border-slate-100 pt-5 space-y-5">
            <h3 className="font-black text-slate-900">Ton véhicule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="vehicle-type" className={labelCls}>Type de véhicule</label>
                <select
                  id="vehicle-type"
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className={inputCls}
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="seats" className={labelCls}>Nombre de places (toi compris ? non — passagers)</label>
                <input
                  id="seats"
                  type="number"
                  min={1}
                  max={9}
                  required
                  value={seats}
                  onChange={(e) => setSeats(Number(e.target.value))}
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="vehicle-brand" className={labelCls}>Marque</label>
                <input
                  id="vehicle-brand"
                  type="text"
                  value={vehicleBrand}
                  onChange={(e) => setVehicleBrand(e.target.value)}
                  placeholder="Ex : Toyota"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="vehicle-model" className={labelCls}>Modèle</label>
                <input
                  id="vehicle-model"
                  type="text"
                  value={vehicleModel}
                  onChange={(e) => setVehicleModel(e.target.value)}
                  placeholder="Ex : Corolla"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="vehicle-color" className={labelCls}>Couleur</label>
                <input
                  id="vehicle-color"
                  type="text"
                  value={vehicleColor}
                  onChange={(e) => setVehicleColor(e.target.value)}
                  placeholder="Ex : Blanche"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="plate" className={labelCls}>Plaque d’immatriculation</label>
                <input
                  id="plate"
                  type="text"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  placeholder="Ex : LL 351 AA"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="current-area" className={labelCls}>Quartier où tu te trouves</label>
                <select
                  id="current-area"
                  value={currentArea}
                  onChange={(e) => setCurrentArea(e.target.value as Neighborhood | '')}
                  className={inputCls}
                >
                  <option value="">Choisir un quartier…</option>
                  {SELECTABLE_NEIGHBORHOODS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400">
                  C’est là que les passagers te verront sur la carte quand tu es en ligne.
                </p>
              </div>
            </div>

            {/* Disponibilité */}
            <button
              type="button"
              role="switch"
              aria-checked={isOnline}
              onClick={() => setIsOnline(!isOnline)}
              className={cn(
                'w-full flex items-center justify-between gap-3 rounded-2xl border-2 p-4 text-left transition-colors',
                isOnline ? 'border-stacks-green bg-green-50/60' : 'border-slate-200 bg-white'
              )}
            >
              <span>
                <span className="block font-black text-slate-900">
                  {isOnline ? 'En ligne — visible pour les passagers' : 'Hors ligne'}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Passe en ligne quand tu es disponible pour prendre des courses.
                </span>
              </span>
              <span
                className={cn(
                  'shrink-0 w-12 h-7 rounded-full p-1 transition-colors',
                  isOnline ? 'bg-stacks-green' : 'bg-slate-300'
                )}
              >
                <span
                  className={cn(
                    'block w-5 h-5 rounded-full bg-white shadow transition-transform',
                    isOnline && 'translate-x-5'
                  )}
                />
              </span>
            </button>

            {!profile.is_verified && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
                Pour te mettre en ligne et recevoir des demandes, fais vérifier
                ton compte juste en dessous : selfie + pièce d’identité (ou
                permis). C’est obligatoire, pour la sécurité des passagers.
              </p>
            )}
          </div>
        </>
      )}

      <PremiumButton type="submit" isLoading={loading} className="w-full sm:w-auto justify-center px-8">
        Enregistrer mon profil
      </PremiumButton>
    </form>
  );
}
