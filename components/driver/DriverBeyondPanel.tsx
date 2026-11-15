'use client';

import { useEffect, useState } from 'react';
import { DrivePlane, DriveSnowflake, DriveUndo } from '@/components/icons/DriveUi';
import { type Neighborhood } from '@/lib/neighborhoods';
import { NeighborhoodSelect } from '@/components/shared/NeighborhoodSelect';
import { COMFORT_MIN_RATING } from '@/lib/comfort';

/** Panneau chauffeur « Au-delà » (v2.34) : climatisation (classe
 *  Confort), destination de retour (filtre désactivable), file
 *  d'attente virtuelle aéroport. Tout est modifiable à tout moment ;
 *  rien ici ne bloque une course en cours. */
export function DriverBeyondPanel() {
  const [ac, setAc] = useState<boolean | null>(null);
  const [acBusy, setAcBusy] = useState(false);
  const [returnDest, setReturnDest] = useState<Neighborhood | ''>('');
  const [returnEnabled, setReturnEnabled] = useState(false);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnMsg, setReturnMsg] = useState<string | null>(null);
  const [queuePos, setQueuePos] = useState<number | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [queueMsg, setQueueMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/profile')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok && typeof d.hasAirConditioning === 'boolean') setAc(d.hasAirConditioning);
      })
      .catch(() => undefined);
    fetch('/api/driver/return-trip')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) {
          setReturnDest((d.returnDestination ?? '') as Neighborhood | '');
          setReturnEnabled(!!d.enabled);
        }
      })
      .catch(() => undefined);
    fetch('/api/driver/airport-queue')
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setQueuePos(d.position ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function toggleAc(next: boolean) {
    setAcBusy(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hasAirConditioning: next }),
      });
      if (res.ok) setAc(next);
    } finally {
      setAcBusy(false);
    }
  }

  async function saveReturn() {
    setReturnBusy(true);
    setReturnMsg(null);
    try {
      const res = await fetch('/api/driver/return-trip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnDestination: returnDest || null, enabled: returnEnabled }),
      });
      const data = await res.json().catch(() => null);
      setReturnMsg(res.ok ? 'Retour enregistré.' : (data?.error ?? 'Enregistrement impossible.'));
    } finally {
      setReturnBusy(false);
    }
  }

  async function queueAction(action: 'join' | 'leave') {
    setQueueBusy(true);
    setQueueMsg(null);
    try {
      const res = await fetch('/api/driver/airport-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setQueuePos(data?.position ?? null);
      } else {
        setQueueMsg(data?.error ?? 'Action impossible.');
      }
    } finally {
      setQueueBusy(false);
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
      <h2 className="font-black text-lg text-slate-900">Tes options chauffeur</h2>

      {/* Climatisation — classe Confort (v2.34) : clim garantie +
          note ≥ 4,5★ pour recevoir les courses Confort. */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 font-black text-slate-900 text-sm">
          <DriveSnowflake size={16} className="text-cyan-600" /> Climatisation — classe Confort
        </p>
        <p className="text-xs text-slate-500 leading-snug">
          Avec la clim déclarée et une note moyenne de {COMFORT_MIN_RATING}★ ou plus, tu reçois
          aussi les courses Confort (même prix que Solo).
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={acBusy || ac === true}
            onClick={() => toggleAc(true)}
            aria-pressed={ac === true}
            className="px-4 py-2 rounded-full text-sm font-black border-2 disabled:opacity-50 border-cyan-600 bg-cyan-50 text-cyan-800"
          >
            Climatisée
          </button>
          <button
            type="button"
            disabled={acBusy || ac === false}
            onClick={() => toggleAc(false)}
            aria-pressed={ac === false}
            className="px-4 py-2 rounded-full text-sm font-black border-2 disabled:opacity-50 border-slate-300 text-slate-700"
          >
            Pas de clim
          </button>
        </div>
      </div>

      {/* Destination de retour (v2.34) : filtre visible et
          désactivable à tout moment. */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 font-black text-slate-900 text-sm">
          <DriveUndo size={16} className="text-stacks-green" /> Courses sur le chemin du retour
        </p>
        <p className="text-xs text-slate-500 leading-snug">
          Définis ton quartier de retour : tu ne reçois alors que les demandes qui vont dans cette
          direction. Désactive le filtre à tout moment pour tout recevoir.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 min-w-52">
            <NeighborhoodSelect
              id="return-destination"
              label="Quartier de retour"
              value={returnDest}
              onChange={(v) => setReturnDest(v as Neighborhood | '')}
              placeholder="Quartier de retour"
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={returnEnabled}
              onChange={(e) => setReturnEnabled(e.target.checked)}
            />
            Filtre actif
          </label>
          <button
            type="button"
            disabled={returnBusy}
            onClick={saveReturn}
            className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-black hover:bg-slate-700 disabled:opacity-50"
          >
            Enregistrer
          </button>
        </div>
        {returnMsg && <p className="text-xs font-bold text-slate-600">{returnMsg}</p>}
      </div>

      {/* File d'attente aéroport (v2.34) : premier arrivé, premier servi. */}
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 font-black text-slate-900 text-sm">
          <DrivePlane size={16} className="text-amber-600" /> File d’attente aéroport
        </p>
        <p className="text-xs text-slate-500 leading-snug">
          Présent à l’aéroport Léon-Mba ? Rejoins la file : la prochaine demande depuis l’aéroport
          part d’abord au premier de la file. Sortie possible à tout moment.
        </p>
        {queuePos !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-900">
              Ta position dans la file : <span className="text-amber-700">n°{queuePos}</span>
            </p>
            <button
              type="button"
              disabled={queueBusy}
              onClick={() => queueAction('leave')}
              className="px-4 py-2 rounded-full bg-white border-2 border-slate-300 text-sm font-black text-slate-800 hover:border-slate-500 disabled:opacity-50"
            >
              Quitter la file
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={queueBusy}
            onClick={() => queueAction('join')}
            className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-black hover:bg-slate-700 disabled:opacity-50"
          >
            Rejoindre la file aéroport
          </button>
        )}
        {queueMsg && <p className="text-xs font-bold text-red-600">{queueMsg}</p>}
      </div>
    </section>
  );
}
