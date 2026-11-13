"use client";

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { DriverProfile, Ride } from '@/types';
import { RideCard } from './RideCard';
import { NEIGHBORHOODS } from '@/lib/neighborhoods';

type SortKey = 'time' | 'price-asc' | 'price-desc';

/** Liste des courses publiées avec recherche, filtres et tri (côté client,
 *  données lues depuis la base côté serveur). */
export function RideDashboard({
  rides,
  drivers,
}: {
  rides: Ride[];
  drivers: Record<string, DriverProfile>;
}) {
  const [query, setQuery] = useState('');
  const [departure, setDeparture] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [rideType, setRideType] = useState<'all' | 'solo' | 'partagee'>('all');
  const [minSeats, setMinSeats] = useState(1);
  const [sort, setSort] = useState<SortKey>('time');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rides.filter((r) => {
      if (q) {
        const hay = `${r.departure} ${r.destination} ${r.vehicleLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (departure && r.departure !== departure) return false;
      if (destination && r.destination !== destination) return false;
      if (date) {
        const day = new Date(r.departureTime).toISOString().slice(0, 10);
        if (day !== date) return false;
      }
      if (rideType !== 'all' && r.rideType !== rideType) return false;
      if (r.seatsAvailable < minSeats) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === 'price-asc') return a.price - b.price;
      if (sort === 'price-desc') return b.price - a.price;
      return new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime();
    });
  }, [rides, query, departure, destination, date, rideType, minSeats, sort]);

  const hasFilter =
    query || departure || destination || date || rideType !== 'all' || minSeats > 1;

  function reset() {
    setQuery('');
    setDeparture('');
    setDestination('');
    setDate('');
    setRideType('all');
    setMinSeats(1);
    setSort('time');
  }

  return (
    <div className="space-y-6">
      {/* Barre de recherche + filtres */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-sm p-4 sm:p-5 space-y-4">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un départ, une destination, un véhicule…"
            className="w-full pl-11 pr-10 py-3.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center hover:bg-slate-300"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Départ</span>
            <select
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
            >
              <option value="">Tous</option>
              {NEIGHBORHOODS.filter((n) => n !== 'Autre').map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Destination</span>
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
            >
              <option value="">Toutes</option>
              {NEIGHBORHOODS.filter((n) => n !== 'Autre').map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Type</span>
            <select
              value={rideType}
              onChange={(e) => setRideType(e.target.value as typeof rideType)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
            >
              <option value="all">Solo + partagée</option>
              <option value="solo">Solo</option>
              <option value="partagee">Partagée</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Places min.</span>
            <select
              value={minSeats}
              onChange={(e) => setMinSeats(Number(e.target.value))}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>{n} place{n > 1 ? 's' : ''}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Trier par</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none"
            >
              <option value="time">Départ le plus proche</option>
              <option value="price-asc">Prix croissant</option>
              <option value="price-desc">Prix décroissant</option>
            </select>
          </label>
        </div>

        {hasFilter && (
          <button
            type="button"
            onClick={reset}
            className="text-sm font-bold text-stacks-green hover:underline"
          >
            Effacer les filtres
          </button>
        )}
      </div>

      <p className="text-sm font-bold text-slate-500">
        {filtered.length} course{filtered.length > 1 ? 's' : ''} trouvée{filtered.length > 1 ? 's' : ''}
        {rides.length === 0 && ' — aucune course publiée pour le moment'}
      </p>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center space-y-2">
          <p className="text-lg font-black text-slate-900">Aucune course ne correspond</p>
          <p className="text-sm text-slate-500">
            Essaie d’élargir ta recherche ou reviens un peu plus tard — les
            chauffeurs publient leurs courses au fur et à mesure.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              driver={drivers[ride.driverId ?? `demo-${ride.id}`] ?? {
                id: ride.driverId ?? 'demo',
                name: 'Chauffeur Stacks Drive',
                phone: null,
                vehicleType: ride.vehicleType,
                vehicleLabel: ride.vehicleLabel,
                seats: ride.seatsTotal,
                isVerified: false,
                isOnline: false,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
