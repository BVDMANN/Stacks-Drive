'use client';

import { useState } from 'react';
import { PassengerPhotoForm } from './PassengerPhotoForm';

/** En-tête du profil passager (v2.49) : photo, nom, téléphone, et
 *  indicateur de complétion RÉEL — 2 éléments comptés, photo et
 *  téléphone. Aucun chiffre inventé : la photo vient de
 *  /api/profile/photo, le téléphone du profil. */

export function PassengerProfileHeader({
  name,
  phone,
}: {
  name: string | null;
  phone: string | null;
}) {
  const [hasPhoto, setHasPhoto] = useState(false);
  const done = (hasPhoto ? 1 : 0) + (phone ? 1 : 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <PassengerPhotoForm name={name} onPhotoChange={setHasPhoto} />
        <div className="min-w-0">
          <p className="font-black text-xl text-slate-900 truncate">{name ?? 'Passager'}</p>
          <p className="text-sm text-slate-500 truncate">{phone ?? 'Téléphone non renseigné'}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-bold text-slate-700">Profil complété à {done}/2</span>
          <span className="text-slate-500">
            {done === 2 ? 'Tout est en place.' : 'Ajoute ce qui manque pour être reconnu par ton chauffeur.'}
          </span>
        </div>
        <div
          className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden"
          role="progressbar"
          aria-valuenow={done}
          aria-valuemin={0}
          aria-valuemax={2}
          aria-label="Complétion du profil"
        >
          <div
            className="h-full bg-rose-500 rounded-full transition-all duration-500"
            style={{ width: `${(done / 2) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
