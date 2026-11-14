'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFcfa } from '@/lib/commission';
import { formatDepartureTime, timeAgo } from '@/lib/dates';
import { pollingIntervalMs, useRealtimeSubscription } from '@/lib/realtime';
import { RideStatusBadge, VerificationStatusBadge } from '@/components/shared/StatusBadge';
import { DriverStatusBadge } from '@/components/driver/DriverStatusBadge';
import type { DriverStatus } from '@/types';

/* ------------------------------------------------------------------ */
/* Types — contrat exact GET /api/admin/live (v2.40).                  */
/* ------------------------------------------------------------------ */

interface LiveCounters {
  usersTotal: number;
  passengersTotal: number;
  driversTotal: number;
  driversVerified: number;
  driversPending: number;
  driversOnline: number;
  activeRides: number;
  ridesToday: number;
  commissionToday: number;
  commissionWeek: number;
  openDisputes: number;
  openTickets: number;
  openFraudCases: number;
}

interface OnlineDriver {
  id: string;
  fullName: string | null;
  phone: string | null;
  vehicleLabel: string | null;
  plate: string | null;
  driverStatus: DriverStatus;
  freeSeats: number | null;
  currentArea: string | null;
  lastOnlineAt: string | null;
}

interface ActiveRide {
  id: string;
  pickup: string;
  destination: string;
  rideType: string | null;
  status: string;
  passengerName: string | null;
  driverName: string | null;
  price: number | null;
  createdAt: string;
}

interface PassengerNow {
  id: string;
  fullName: string | null;
  rideId: string | null;
  pickup: string | null;
  destination: string | null;
  status: string | null;
}

interface LiveEvent {
  id: string;
  kind: string;
  label: string;
  detail: string | null;
  at: string;
  rideId: string | null;
  personId: string | null;
}

interface LiveData {
  generatedAt: string;
  counters: LiveCounters;
  driversOnline: OnlineDriver[];
  activeRides: ActiveRide[];
  passengersNow: PassengerNow[];
  events: LiveEvent[];
}

interface PersonRow {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  verificationStatus: string | null;
  isOnline: boolean | null;
  isVerified: boolean | null;
  isDemo: boolean | null;
  createdAt: string | null;
  currentArea: string | null;
  vehicleLabel: string | null;
  freeSeats: number | null;
  driverStatus: DriverStatus | null;
  ridesCompleted: number | null;
  ridesCancelled: number | null;
  lastActivityAt: string | null;
}

interface PersonDetail {
  person: PersonRow;
  rides: Array<{
    id: string;
    pickup: string | null;
    destination: string | null;
    status: string | null;
    price: number | null;
    otherName: string | null;
    createdAt: string | null;
  }>;
  money: {
    totalCommission: number | null;
    totalSettled: number | null;
    owed: number | null;
    depositPaid: boolean | null;
    depositAmount: number | null;
    pointsBalance: number | null;
    completedRides: number | null;
  } | null;
  loyalty: { completedRides: number | null; freeRides: number | null } | null;
  disputes: Array<{ id: string; label: string | null; status: string | null; createdAt: string | null }>;
  cancellations: Array<{ id: string; label: string | null; createdAt: string | null }>;
}

interface RideTrace {
  ride: {
    id: string;
    pickup: string | null;
    destination: string | null;
    rideType: string | null;
    status: string | null;
    passengerName: string | null;
    driverName: string | null;
    price: number | null;
    createdAt: string | null;
  };
  proposals: Array<{
    id: string;
    driverName: string | null;
    price: number | null;
    status: string | null;
    createdAt: string | null;
  }>;
  messagesCount: number | null;
  cancellations: Array<{ id: string; label: string | null; createdAt: string | null }>;
  feedback: Array<{ id: string; label: string | null; createdAt: string | null }>;
  audit: Array<{ id: string; label: string | null; createdAt: string | null }>;
  timeline: Array<{ at: string; label: string; detail: string | null }>;
}

/* ------------------------------------------------------------------ */
/* Petits helpers                                                      */
/* ------------------------------------------------------------------ */

function txt(v: unknown): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

const EVENT_STYLES: Array<{ match: string; className: string }> = [
  { match: 'annul', className: 'bg-red-100 text-red-700' },
  { match: 'termin', className: 'bg-green-100 text-green-700' },
  { match: 'accept', className: 'bg-blue-100 text-blue-700' },
  { match: 'propos', className: 'bg-amber-100 text-amber-800' },
  { match: 'litige', className: 'bg-red-100 text-red-700' },
  { match: 'fraude', className: 'bg-red-100 text-red-700' },
  { match: 'en_ligne', className: 'bg-green-100 text-green-700' },
  { match: 'online', className: 'bg-green-100 text-green-700' },
  { match: 'verif', className: 'bg-violet-100 text-violet-700' },
  { match: 'paiement', className: 'bg-emerald-100 text-emerald-700' },
];

function eventStyle(kind: string): string {
  const k = kind.toLowerCase();
  const hit = EVENT_STYLES.find((s) => k.includes(s.match));
  return hit ? hit.className : 'bg-slate-100 text-slate-600';
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
      <h2 className="font-black text-lg text-slate-900">
        {title}
        {typeof count === 'number' ? ` (${count})` : ''}
      </h2>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
      {message}
    </p>
  );
}

function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <p className="text-sm text-slate-500 inline-flex items-center gap-2">
      <Loader2 size={16} className="animate-spin" /> {label}
    </p>
  );
}

const ROLE_FILTERS = [
  { value: '', label: 'Tous' },
  { value: 'passager', label: 'Passagers' },
  { value: 'chauffeur', label: 'Chauffeurs' },
] as const;

const STATUS_FILTERS = [
  { value: '', label: 'Tous statuts' },
  { value: 'verifie', label: 'Vérifiés' },
  { value: 'en_attente', label: 'En attente' },
  { value: 'non_verifie', label: 'Non vérifiés' },
  { value: 'refuse', label: 'Refusés' },
] as const;

const PEOPLE_LIMIT = 50;

/* ------------------------------------------------------------------ */
/* Composant principal                                                 */
/* ------------------------------------------------------------------ */

export function LiveAdmin() {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // « Les gens » : recherche + filtres + liste paginée.
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [peopleTotal, setPeopleTotal] = useState(0);
  const [peopleLoading, setPeopleLoading] = useState(true);
  const [peopleLoadingMore, setPeopleLoadingMore] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleOffset, setPeopleOffset] = useState(0);

  // Flux : pagination « Charger plus » sur les événements.
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [eventsLoadingMore, setEventsLoadingMore] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [eventsExhausted, setEventsExhausted] = useState(false);

  // Tiroirs plein écran : fiche personne / trace de course.
  const [drawer, setDrawer] = useState<
    | { type: 'person'; id: string }
    | { type: 'ride'; id: string }
    | null
  >(null);
  const [personDetail, setPersonDetail] = useState<PersonDetail | null>(null);
  const [rideTrace, setRideTrace] = useState<RideTrace | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  /* ----- Vue d'ensemble ----- */
  const fetchLive = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/live');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? 'Lecture impossible.');
        return;
      }
      setData(json as LiveData);
      setEvents((json.events ?? []) as LiveEvent[]);
      setEventsExhausted(false);
    } catch {
      setError('Connexion impossible.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLive(true);
  }, [fetchLive]);

  /* ----- Temps réel : les changements ne font que déclencher un
   *  rechargement via l'API — jamais de données directes du canal. */
  const { live: ridesLive } = useRealtimeSubscription({
    table: 'rides',
    enabled: true,
    onChange: () => void fetchLive(),
  });
  const { live: proposalsLive } = useRealtimeSubscription({
    table: 'ride_proposals',
    enabled: true,
    onChange: () => void fetchLive(),
  });
  const live = ridesLive || proposalsLive;

  // Sondage : rapide (15 s) en repli, lent (60 s) quand le direct fonctionne.
  useEffect(() => {
    const ms = pollingIntervalMs(live, 15000, 60000);
    const t = setInterval(() => void fetchLive(), ms);
    return () => clearInterval(t);
  }, [live, fetchLive]);

  /* ----- « Les gens » ----- */
  const buildPeopleUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams({
        limit: String(PEOPLE_LIMIT),
        offset: String(offset),
      });
      if (q.trim()) params.set('q', q.trim());
      if (role) params.set('role', role);
      if (status) params.set('status', status);
      if (onlineOnly) params.set('online', 'true');
      return `/api/admin/live/people?${params.toString()}`;
    },
    [q, role, status, onlineOnly]
  );

  const fetchPeople = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setPeopleLoadingMore(true);
      else setPeopleLoading(true);
      setPeopleError(null);
      try {
        const res = await fetch(buildPeopleUrl(offset));
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          setPeopleError(json?.error ?? 'Lecture impossible.');
          return;
        }
        const rows = (json.people ?? []) as PersonRow[];
        setPeople((prev) => (append ? [...prev, ...rows] : rows));
        setPeopleTotal(json.total ?? rows.length);
        setPeopleOffset(offset + rows.length);
      } catch {
        setPeopleError('Connexion impossible.');
      } finally {
        setPeopleLoading(false);
        setPeopleLoadingMore(false);
      }
    },
    [buildPeopleUrl]
  );

  // Recherche avec un léger délai pour ne pas requêter à chaque frappe.
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => void fetchPeople(0, false), 400);
    return () => {
      if (qTimer.current) clearTimeout(qTimer.current);
    };
  }, [q, fetchPeople]);

  useEffect(() => {
    void fetchPeople(0, false);
  }, [role, status, onlineOnly, fetchPeople]);

  /* ----- Flux : charger plus d'événements ----- */
  const loadMoreEvents = useCallback(async () => {
    if (events.length === 0) return;
    setEventsLoadingMore(true);
    setEventsError(null);
    try {
      const before = events[events.length - 1].at;
      const res = await fetch(
        `/api/admin/live/events?before=${encodeURIComponent(before)}&limit=30`
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setEventsError(json?.error ?? 'Lecture impossible.');
        return;
      }
      const rows = (json.events ?? []) as LiveEvent[];
      if (rows.length === 0) setEventsExhausted(true);
      setEvents((prev) => [...prev, ...rows]);
    } catch {
      setEventsError('Connexion impossible.');
    } finally {
      setEventsLoadingMore(false);
    }
  }, [events]);

  /* ----- Tiroirs ----- */
  const openPerson = useCallback(async (id: string) => {
    setDrawer({ type: 'person', id });
    setPersonDetail(null);
    setRideTrace(null);
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const res = await fetch(`/api/admin/live/person/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setDrawerError(json?.error ?? 'Lecture impossible.');
        return;
      }
      setPersonDetail(json as PersonDetail);
    } catch {
      setDrawerError('Connexion impossible.');
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const openRide = useCallback(async (id: string) => {
    setDrawer({ type: 'ride', id });
    setRideTrace(null);
    setPersonDetail(null);
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const res = await fetch(`/api/admin/live/ride/${id}`);
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setDrawerError(json?.error ?? 'Lecture impossible.');
        return;
      }
      setRideTrace(json as RideTrace);
    } catch {
      setDrawerError('Connexion impossible.');
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setPersonDetail(null);
    setRideTrace(null);
    setDrawerError(null);
  }, []);

  const counters = data?.counters;

  /* ----- Chargement initial (RÈGLE 1) ----- */
  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
        <Spinner label="Chargement…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête live */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-wrap items-center gap-3">
        {live ? (
          <span className="inline-flex items-center gap-2 text-sm font-black text-green-700">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            ● En direct
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm font-black text-amber-700">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
            Mise à jour toutes les 15 s
          </span>
        )}
        {data?.generatedAt && (
          <span className="text-sm text-slate-500">
            Dernière mise à jour {timeAgo(data.generatedAt)}
          </span>
        )}
        <button
          type="button"
          onClick={() => void fetchLive()}
          disabled={refreshing}
          className="ml-auto inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-stacks-green disabled:opacity-50"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {error && <ErrorAlert message={error} />}

      {/* En ce moment */}
      <Section title="En ce moment">
        {counters ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: counters.usersTotal, label: 'Utilisateurs' },
              { value: counters.passengersTotal, label: 'Passagers' },
              { value: counters.driversTotal, label: 'Chauffeurs inscrits' },
              { value: counters.driversVerified, label: 'Chauffeurs vérifiés' },
              { value: counters.driversPending, label: 'Vérifications en attente' },
              { value: counters.driversOnline, label: 'Chauffeurs en ligne' },
              { value: counters.activeRides, label: 'Courses actives' },
              { value: counters.ridesToday, label: 'Courses du jour' },
              { value: formatFcfa(counters.commissionToday), label: 'Commission du jour' },
              { value: formatFcfa(counters.commissionWeek), label: 'Commission de la semaine' },
              { value: counters.openDisputes, label: 'Litiges ouverts' },
              { value: counters.openTickets, label: 'Tickets ouverts' },
              { value: counters.openFraudCases, label: 'Dossiers de fraude ouverts' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <p className="text-xl font-black text-stacks-navy break-words">{s.value}</p>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Aucune donnée pour le moment.</Empty>
        )}

        <div className="space-y-3 pt-2">
          <h3 className="font-black text-slate-900">
            Chauffeurs en ligne ({data?.driversOnline.length ?? 0})
          </h3>
          {(data?.driversOnline.length ?? 0) === 0 ? (
            <Empty>Aucun chauffeur en ligne pour le moment.</Empty>
          ) : (
            <ul className="space-y-3">
              {data!.driversOnline.map((d) => (
                <li
                  key={d.id}
                  className="border border-slate-200 rounded-2xl p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void openPerson(d.id)}
                      className="text-sm font-black text-slate-900 hover:text-stacks-green text-left"
                    >
                      {d.fullName ?? 'Sans nom'}
                    </button>
                    <DriverStatusBadge status={d.driverStatus} freeSeats={d.freeSeats} capacity={null} />
                  </div>
                  <p className="text-sm text-slate-500">
                    {txt(d.vehicleLabel)}
                    {d.plate ? ` · ${d.plate}` : ''}
                    {d.currentArea ? ` · ${d.currentArea}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">
                    {d.phone ? `${d.phone} · ` : ''}
                    {d.lastOnlineAt ? `en ligne depuis ${timeAgo(d.lastOnlineAt)}` : 'En ligne'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="font-black text-slate-900">
            Passagers avec une course en cours ({data?.passengersNow.length ?? 0})
          </h3>
          {(data?.passengersNow.length ?? 0) === 0 ? (
            <Empty>Aucun passager avec une course en cours pour le moment.</Empty>
          ) : (
            <ul className="space-y-3">
              {data!.passengersNow.map((p) => (
                <li key={p.id} className="border border-slate-200 rounded-2xl p-4 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => void openPerson(p.id)}
                    className="text-sm font-black text-slate-900 hover:text-stacks-green text-left"
                  >
                    {p.fullName ?? 'Sans nom'}
                  </button>
                  <p className="text-sm text-slate-500">
                    {txt(p.pickup)} → {txt(p.destination)}
                  </p>
                  {p.rideId && (
                    <button
                      type="button"
                      onClick={() => void openRide(p.rideId!)}
                      className="text-sm font-bold text-stacks-green hover:underline"
                    >
                      Voir la course →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="font-black text-slate-900">
            Courses actives ({data?.activeRides.length ?? 0})
          </h3>
          {(data?.activeRides.length ?? 0) === 0 ? (
            <Empty>Aucune course active pour le moment.</Empty>
          ) : (
            <ul className="space-y-3">
              {data!.activeRides.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => void openRide(r.id)}
                    className="w-full text-left border border-slate-200 rounded-2xl p-4 space-y-2 hover:border-stacks-green"
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-black text-slate-900">
                        {r.pickup} → {r.destination}
                      </span>
                      <RideStatusBadge status={r.status} />
                    </span>
                    <span className="block text-sm text-slate-500">
                      {r.rideType === 'groupe' ? 'Groupe' : r.rideType === 'solo' ? 'Solo' : txt(r.rideType)}
                      {' · '}Passager : {txt(r.passengerName)}
                      {' · '}Chauffeur : {txt(r.driverName)}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {r.price !== null ? formatFcfa(r.price) : 'Prix non fixé'}
                      {' · '}{timeAgo(r.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* Flux en direct */}
      <Section title="Flux en direct" count={events.length}>
        {events.length === 0 ? (
          <Empty>Aucun événement pour le moment.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((e) => {
              const target = e.rideId
                ? () => void openRide(e.rideId!)
                : e.personId
                  ? () => void openPerson(e.personId!)
                  : null;
              const inner = (
                <>
                  <span
                    className={cn(
                      'inline-flex px-2.5 py-1 rounded-full text-xs font-black shrink-0',
                      eventStyle(e.kind)
                    )}
                  >
                    {e.kind}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900">{e.label}</span>
                    {e.detail && <span className="block text-sm text-slate-500">{e.detail}</span>}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(e.at)}</span>
                </>
              );
              return (
                <li key={e.id} className="py-3">
                  {target ? (
                    <button
                      type="button"
                      onClick={target}
                      className="w-full flex items-start gap-3 text-left rounded-xl hover:bg-slate-50 p-1 -m-1"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex items-start gap-3">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {eventsError && <ErrorAlert message={eventsError} />}
        {!eventsExhausted && events.length > 0 && (
          <button
            type="button"
            onClick={() => void loadMoreEvents()}
            disabled={eventsLoadingMore}
            className="inline-flex items-center gap-2 text-sm font-bold text-stacks-green hover:underline disabled:opacity-50"
          >
            {eventsLoadingMore && <Loader2 size={15} className="animate-spin" />}
            Charger plus
          </button>
        )}
        {eventsExhausted && <p className="text-xs text-slate-400">Fin du flux.</p>}
      </Section>

      {/* Les gens */}
      <Section title="Les gens" count={peopleTotal}>
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un nom, un e-mail ou un téléphone…"
            aria-label="Rechercher une personne"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:border-stacks-green"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {ROLE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setRole(f.value)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-black whitespace-nowrap transition-colors',
                role === f.value ? 'bg-stacks-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatus(f.value)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-black whitespace-nowrap transition-colors',
                status === f.value ? 'bg-stacks-navy text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              )}
            >
              {f.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOnlineOnly((v) => !v)}
            aria-pressed={onlineOnly}
            className={cn(
              'px-4 py-2 rounded-full text-sm font-black whitespace-nowrap transition-colors',
              onlineOnly ? 'bg-green-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            En ligne
          </button>
        </div>

        {peopleError && <ErrorAlert message={peopleError} />}
        {peopleLoading && <Spinner />}
        {!peopleLoading && people.length === 0 && (
          <Empty>Aucune personne trouvée pour ces critères.</Empty>
        )}
        <ul className="space-y-3">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void openPerson(p.id)}
                className="w-full text-left border border-slate-200 rounded-2xl p-4 space-y-2 hover:border-stacks-green"
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-black text-slate-900">
                    {p.fullName ?? 'Sans nom'}
                    {p.isDemo ? ' · Démo' : ''}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {p.isOnline && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-700">
                        <span className="w-2 h-2 rounded-full bg-green-500" /> En ligne
                      </span>
                    )}
                    {p.verificationStatus && (
                      <VerificationStatusBadge status={p.verificationStatus} />
                    )}
                  </span>
                </span>
                <span className="block text-sm text-slate-500">
                  {p.role === 'chauffeur' ? 'Chauffeur' : p.role === 'passager' ? 'Passager' : txt(p.role)}
                  {p.phone ? ` · ${p.phone}` : ''}
                  {p.email ? ` · ${p.email}` : ''}
                </span>
                {p.vehicleLabel && (
                  <span className="block text-sm text-slate-500">{p.vehicleLabel}</span>
                )}
                {p.driverStatus && (
                  <DriverStatusBadge status={p.driverStatus} freeSeats={p.freeSeats} capacity={null} />
                )}
                <span className="block text-xs text-slate-400">
                  {p.ridesCompleted ?? 0} course{(p.ridesCompleted ?? 0) > 1 ? 's' : ''} terminée{(p.ridesCompleted ?? 0) > 1 ? 's' : ''}
                  {' · '}{p.ridesCancelled ?? 0} annulée{(p.ridesCancelled ?? 0) > 1 ? 's' : ''}
                  {p.lastActivityAt ? ` · dernière activité ${timeAgo(p.lastActivityAt)}` : ''}
                  {p.currentArea ? ` · ${p.currentArea}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {people.length > 0 && people.length < peopleTotal && (
          <button
            type="button"
            onClick={() => void fetchPeople(peopleOffset, true)}
            disabled={peopleLoadingMore}
            className="inline-flex items-center gap-2 text-sm font-bold text-stacks-green hover:underline disabled:opacity-50"
          >
            {peopleLoadingMore && <Loader2 size={15} className="animate-spin" />}
            Afficher plus ({people.length} / {peopleTotal})
          </button>
        )}
      </Section>

      {/* Courses en direct */}
      <Section title="Courses en direct" count={data?.activeRides.length ?? 0}>
        {(data?.activeRides.length ?? 0) === 0 ? (
          <Empty>Aucune course en direct pour le moment.</Empty>
        ) : (
          <ul className="space-y-3">
            {data!.activeRides.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => void openRide(r.id)}
                  className="w-full text-left border border-slate-200 rounded-2xl p-4 space-y-2 hover:border-stacks-green"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-black text-slate-900">
                      {r.pickup} → {r.destination}
                    </span>
                    <RideStatusBadge status={r.status} />
                  </span>
                  <span className="block text-sm text-slate-500">
                    {r.rideType === 'groupe' ? 'Groupe' : r.rideType === 'solo' ? 'Solo' : txt(r.rideType)}
                    {' · '}Passager : {txt(r.passengerName)}
                    {' · '}Chauffeur : {txt(r.driverName)}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {r.price !== null ? formatFcfa(r.price) : 'Prix non fixé'}
                    {' · '}{timeAgo(r.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Tiroir plein écran : fiche personne / trace de course */}
      {drawer && (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <h2 className="font-black text-lg text-slate-900">
              {drawer.type === 'person' ? 'Fiche personne' : 'Trace de la course'}
            </h2>
            <button
              type="button"
              onClick={closeDrawer}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-black"
            >
              <X size={16} /> Fermer
            </button>
          </div>
          <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto space-y-6">
            {drawerLoading && <Spinner label="Chargement de la fiche…" />}
            {drawerError && <ErrorAlert message={drawerError} />}
            {!drawerLoading && !drawerError && drawer.type === 'person' && personDetail && (
              <PersonSheet
                detail={personDetail}
                onOpenRide={(id) => void openRide(id)}
              />
            )}
            {!drawerLoading && !drawerError && drawer.type === 'ride' && rideTrace && (
              <RideSheet trace={rideTrace} />
            )}
            {!drawerLoading && !drawerError && ((drawer.type === 'person' && !personDetail) || (drawer.type === 'ride' && !rideTrace)) && (
              <Empty>Aucune donnée pour le moment.</Empty>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche personne (tiroir)                                             */
/* ------------------------------------------------------------------ */

function PersonSheet({
  detail,
  onOpenRide,
}: {
  detail: PersonDetail;
  onOpenRide: (id: string) => void;
}) {
  const { person: p, money, loyalty } = detail;
  const { date, time } = p.createdAt ? formatDepartureTime(p.createdAt) : { date: '', time: '' };
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-2xl font-black text-slate-900">{p.fullName ?? 'Sans nom'}</p>
        <div className="flex flex-wrap items-center gap-2">
          {p.verificationStatus && <VerificationStatusBadge status={p.verificationStatus} />}
          {p.isOnline && (
            <span className="inline-flex items-center gap-1.5 text-xs font-black text-green-700 bg-green-100 px-3 py-1 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500" /> En ligne
            </span>
          )}
          {p.isDemo && (
            <span className="text-xs font-black bg-slate-100 text-slate-600 px-3 py-1 rounded-full">Démo</span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {p.role === 'chauffeur' ? 'Chauffeur' : p.role === 'passager' ? 'Passager' : txt(p.role)}
          {p.email ? ` · ${p.email}` : ''}
          {p.phone ? ` · ${p.phone}` : ''}
        </p>
        {p.currentArea && <p className="text-sm text-slate-500">Quartier : {p.currentArea}</p>}
        {p.createdAt && (
          <p className="text-sm text-slate-500">
            Inscrit(e) le {date} à {time}
          </p>
        )}
        <p className="text-sm text-slate-500">
          Dernière activité visible :{' '}
          {p.lastActivityAt ? timeAgo(p.lastActivityAt) : 'aucune activité enregistrée'}
        </p>
      </div>

      {p.vehicleLabel && (
        <div className="border border-slate-200 rounded-2xl p-4 space-y-1">
          <h3 className="font-black text-slate-900">Véhicule</h3>
          <p className="text-sm text-slate-600">{p.vehicleLabel}</p>
          {p.driverStatus && (
            <DriverStatusBadge status={p.driverStatus} freeSeats={p.freeSeats} capacity={null} />
          )}
        </div>
      )}

      {money && p.role === 'chauffeur' && (
        <div className="border border-slate-200 rounded-2xl p-4 space-y-1">
          <h3 className="font-black text-slate-900">Gains & règlement</h3>
          <p className="text-sm text-slate-600">
            Commission totale : {money.totalCommission !== null ? formatFcfa(money.totalCommission) : '—'}
          </p>
          <p className="text-sm text-slate-600">
            Réglé : {money.totalSettled !== null ? formatFcfa(money.totalSettled) : '—'}
          </p>
          <p className="text-sm text-slate-600">
            Dette : {money.owed !== null ? formatFcfa(money.owed) : '—'}
          </p>
          <p className="text-sm text-slate-600">
            Dépôt :{' '}
            {money.depositPaid
              ? `payé${money.depositAmount !== null ? ` (${formatFcfa(money.depositAmount)})` : ''}`
              : 'non payé'}
          </p>
          <p className="text-sm text-slate-600">
            Points : {money.pointsBalance ?? 0}
          </p>
          <p className="text-sm text-slate-600">
            Courses terminées : {money.completedRides ?? 0}
          </p>
        </div>
      )}

      {loyalty && p.role !== 'chauffeur' && (
        <div className="border border-slate-200 rounded-2xl p-4 space-y-1">
          <h3 className="font-black text-slate-900">Fidélité</h3>
          <p className="text-sm text-slate-600">
            Courses terminées : {loyalty.completedRides ?? 0}
          </p>
          <p className="text-sm text-slate-600">
            Courses offertes : {loyalty.freeRides ?? 0}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <h3 className="font-black text-slate-900">
          Historique des courses ({detail.rides.length})
        </h3>
        {detail.rides.length === 0 ? (
          <Empty>Aucune course pour le moment.</Empty>
        ) : (
          <ul className="space-y-3">
            {detail.rides.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpenRide(r.id)}
                  className="w-full text-left border border-slate-200 rounded-2xl p-4 space-y-1.5 hover:border-stacks-green"
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-black text-slate-900">
                      {txt(r.pickup)} → {txt(r.destination)}
                    </span>
                    {r.status && <RideStatusBadge status={r.status} />}
                  </span>
                  <span className="block text-sm text-slate-500">
                    {r.price !== null ? formatFcfa(r.price) : 'Prix non fixé'}
                    {r.otherName ? ` · avec ${r.otherName}` : ''}
                    {r.createdAt ? ` · ${timeAgo(r.createdAt)}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-black text-slate-900">Litiges ({detail.disputes.length})</h3>
        {detail.disputes.length === 0 ? (
          <Empty>Aucun litige pour le moment.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {detail.disputes.map((d) => (
              <li key={d.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{txt(d.label)}</span>
                <span className="text-xs text-slate-400">
                  {txt(d.status)}
                  {d.createdAt ? ` · ${timeAgo(d.createdAt)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-black text-slate-900">
          Annulations ({detail.cancellations.length})
        </h3>
        {detail.cancellations.length === 0 ? (
          <Empty>Aucune annulation pour le moment.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {detail.cancellations.map((c) => (
              <li key={c.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{txt(c.label)}</span>
                <span className="text-xs text-slate-400">
                  {c.createdAt ? timeAgo(c.createdAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trace de course (tiroir)                                            */
/* ------------------------------------------------------------------ */

function RideSheet({ trace }: { trace: RideTrace }) {
  const { ride } = trace;
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-2xl font-black text-slate-900">
          {txt(ride.pickup)} → {txt(ride.destination)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {ride.status && <RideStatusBadge status={ride.status} />}
          <span className="text-sm font-bold text-slate-500">
            {ride.rideType === 'groupe' ? 'Groupe' : ride.rideType === 'solo' ? 'Solo' : txt(ride.rideType)}
          </span>
        </div>
        <p className="text-sm text-slate-600">
          Passager : {txt(ride.passengerName)}
          {' · '}Chauffeur : {txt(ride.driverName)}
        </p>
        <p className="text-sm text-slate-600">
          Prix : {ride.price !== null ? formatFcfa(ride.price) : 'Prix non fixé'}
          {ride.createdAt ? ` · créée ${timeAgo(ride.createdAt)}` : ''}
        </p>
        <p className="text-sm text-slate-600">
          Messages in-app : {trace.messagesCount ?? 0}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-black text-slate-900">Chronologie</h3>
        {trace.timeline.length === 0 ? (
          <Empty>Aucun événement enregistré pour cette course.</Empty>
        ) : (
          <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
            {trace.timeline.map((t, i) => (
              <li key={`${t.at}-${i}`} className="space-y-0.5">
                <p className="text-sm font-bold text-slate-900">{t.label}</p>
                {t.detail && <p className="text-sm text-slate-500">{t.detail}</p>}
                <p className="text-xs text-slate-400">{timeAgo(t.at)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-black text-slate-900">
          Propositions ({trace.proposals.length})
        </h3>
        {trace.proposals.length === 0 ? (
          <Empty>Aucune proposition pour le moment.</Empty>
        ) : (
          <ul className="space-y-3">
            {trace.proposals.map((p) => (
              <li key={p.id} className="border border-slate-200 rounded-2xl p-4 space-y-1">
                <p className="text-sm font-bold text-slate-900">{txt(p.driverName)}</p>
                <p className="text-sm text-slate-500">
                  {p.price !== null ? formatFcfa(p.price) : 'Prix non fixé'}
                  {p.status ? ` · ${p.status}` : ''}
                  {p.createdAt ? ` · ${timeAgo(p.createdAt)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-black text-slate-900">
          Annulations ({trace.cancellations.length})
        </h3>
        {trace.cancellations.length === 0 ? (
          <Empty>Aucune annulation pour cette course.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {trace.cancellations.map((c) => (
              <li key={c.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{txt(c.label)}</span>
                <span className="text-xs text-slate-400">
                  {c.createdAt ? timeAgo(c.createdAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="font-black text-slate-900">
          Litiges liés ({trace.feedback.length})
        </h3>
        {trace.feedback.length === 0 ? (
          <Empty>Aucun litige lié à cette course.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {trace.feedback.map((f) => (
              <li key={f.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{txt(f.label)}</span>
                <span className="text-xs text-slate-400">
                  {f.createdAt ? timeAgo(f.createdAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {trace.audit.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-black text-slate-900">Journal ({trace.audit.length})</h3>
          <ul className="divide-y divide-slate-100">
            {trace.audit.map((a) => (
              <li key={a.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">{txt(a.label)}</span>
                <span className="text-xs text-slate-400">
                  {a.createdAt ? timeAgo(a.createdAt) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
