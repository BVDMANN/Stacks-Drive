'use client';

import { useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { TrackingMap } from './TrackingMap';
import { DriverNavigation } from './DriverNavigation';
import type { MapDriver, MapPoint } from '@/components/map/LibrevilleMap';
import { haversineKm } from '@/lib/geo';
import { useRoadRoute } from '@/lib/use-road-route';

/** Vitesse moyenne retenue pour l'ETA en ville (Libreville) : 30 km/h.
 *  L'ETA est une estimation affichée au passager, jamais un engagement. */
const CITY_SPEED_KMH = 30;

type SharingState = 'off' | 'active' | 'denied' | 'unavailable' | 'error';

interface LivePosition {
  lat: number;
  lng: number;
  updatedAt: string;
}

/** Suivi en direct du chauffeur jusqu'au point de départ (v2.10),
 *  style Uber : le passager voit son chauffeur se déplacer sur la
 *  carte en temps réel jusqu'à l'arrivée, avec « Arrivée dans ~X min ».
 *
 *  - Côté passager (course 'acceptee') : la position du chauffeur est
 *    lue toutes les 5 s ; le marqueur suit la position réelle et l'ETA
 *    est calculé sur la distance restante. Sans position en direct, on
 *    affiche la position du profil (quartier) en attendant.
 *  - Côté chauffeur (course 'acceptee') : la géolocalisation du
 *    navigateur est envoyée toutes les ~10 s. Le partage s'arrête tout
 *    seul au pickup (la page se recharge avec le statut 'en_cours').
 *  - Autres statuts : carte statique (itinéraire + chauffeur assigné).
 *
 *  ETA routière (P0b) : dès que la position du chauffeur est connue
 *  (en direct, sinon celle du profil), l'ETA est calculée sur la
 *  distance ROUTIÈRE OSRM chauffeur → passager (durée + distance par
 *  la route, via `/api/route`, recalculée quand le chauffeur bouge
 *  d'environ 100 m ou toutes les 30 s — pas de nouveau sondage
 *  agressif : on réutilise le sondage 5 s / le partage existants).
 *  Si OSRM est indisponible, on retombe sur l'estimation à vol
 *  d'oiseau (30 km/h) — jamais d'écran vide. Le PRIX ne change pas.
 *
 *  Navigation guidée (P0b, chauffeur uniquement) : pendant la course,
 *  itinéraire routier vers le pickup puis vers la destination, avec
 *  instructions virage par virage et bouton « Ouvrir dans l'app
 *  Cartes » (Google Maps, gratuit, sans compte). La géolocalisation
 *  du navigateur reste active en 'en_cours' pour le guidage local —
 *  sans envoi serveur (le partage s'arrête au pickup).
 *
 *  Confidentialité : la position n'est partagée et visible que pendant
 *  la course acceptée, entre ses deux parties — jamais hors course. */
export function RideLiveTracking({
  rideId,
  role,
  status,
  pickup,
  destination,
  driver,
}: {
  rideId: string;
  role: 'passager' | 'chauffeur';
  status: string;
  pickup: MapPoint | null;
  destination: MapPoint | null;
  driver: MapDriver | null;
}) {
  const [live, setLive] = useState<LivePosition | null>(null);
  const [selfLive, setSelfLive] = useState<LivePosition | null>(null);
  const [sharing, setSharing] = useState<SharingState>('off');
  const lastSentRef = useRef(0);

  const isTracking = status === 'acceptee';
  const isNavigating = status === 'acceptee' || status === 'en_cours';

  // --- Côté passager : lecture de la position du chauffeur (5 s). ---
  useEffect(() => {
    if (!isTracking || role !== 'passager') return;
    let cancelled = false;
    async function fetchLocation() {
      try {
        const res = await fetch(`/api/rides/${rideId}/location`);
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) return; // 403 = suivi terminé : on garde la carte statique.
        if (data?.location) {
          setLive({
            lat: data.location.lat,
            lng: data.location.lng,
            updatedAt: data.location.updatedAt,
          });
        }
      } catch {
        // Réseau instable : prochain sondage.
      }
    }
    fetchLocation();
    const t = window.setInterval(fetchLocation, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [isTracking, role, rideId]);

  // --- Côté chauffeur : partage de la position (~10 s, 'acceptee'
  //  uniquement) + géolocalisation locale pour la navigation guidée
  //  ('acceptee' puis 'en_cours', sans envoi serveur après le pickup). ---
  useEffect(() => {
    if (!isNavigating || role !== 'chauffeur') return;
    if (!('geolocation' in navigator)) {
      setSharing('unavailable');
      return;
    }
    setSharing('off');
    async function postLocation(lat: number, lng: number, accuracy?: number) {
      try {
        const res = await fetch(`/api/rides/${rideId}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lat, lng, accuracy }),
        });
        if (res.ok) setSharing('active');
        else if (res.status === 403) setSharing('off'); // course démarrée : partage terminé.
        else setSharing('error');
      } catch {
        setSharing('error');
      }
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setSelfLive({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          updatedAt: new Date().toISOString(),
        });
        // Envoi serveur uniquement avant le pickup.
        if (status !== 'acceptee') return;
        const now = Date.now();
        // Envoi immédiat au premier fix, puis toutes les 10 s max.
        if (now - lastSentRef.current < 10000 && lastSentRef.current !== 0) return;
        lastSentRef.current = now;
        postLocation(pos.coords.latitude, pos.coords.longitude, Math.round(pos.coords.accuracy));
      },
      () => setSharing('denied'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isNavigating, role, rideId, status]);

  // Position du chauffeur affichée : en direct si disponible (position
  // partagée côté passager, position du navigateur côté chauffeur),
  // sinon celle du profil (quartier, avec dérive démo pour les démos).
  const shownDriver: MapDriver | null =
    driver && live
      ? { ...driver, lat: live.lat, lng: live.lng }
      : driver && selfLive
        ? { ...driver, lat: selfLive.lat, lng: selfLive.lng }
        : driver;

  // Position de départ de l'ETA / de la navigation : en direct, sinon
  // navigateur, sinon profil (quartier) — l'ETA s'affiche donc dès
  // l'acceptation, même avant le premier fix GPS.
  const driverPos =
    live ?? selfLive ?? (driver && driver.lat !== null && driver.lng !== null
      ? { lat: driver.lat, lng: driver.lng }
      : null);

  // Cible : le pickup tant que la course n'a pas démarré, puis la
  // destination. Côté passager, la cible n'existe qu'en 'acceptee'
  // (pas de position en direct en 'en_cours').
  const navTarget =
    status === 'acceptee' ? pickup : status === 'en_cours' && role === 'chauffeur' ? destination : null;

  // Itinéraire routier chauffeur → cible (P0b) : recalculé quand le
  // chauffeur bouge d'environ 100 m ou toutes les 30 s (hook partagé,
  // cache 5 min — aucun sondage supplémentaire).
  const { route: roadRoute } = useRoadRoute(driverPos, navTarget, {
    enabled: !!driverPos && !!navTarget && (role === 'chauffeur' ? isNavigating : isTracking),
    refreshMs: 30000,
  });

  // ETA : routière (OSRM) quand elle est là, sinon à vol d'oiseau
  // (30 km/h). Moins de 200 m = arrivé (position en direct only).
  let etaMin: number | null = null;
  let etaDistanceKm: number | null = null;
  let etaIsRoad = false;
  let arrived = false;
  if (driverPos && navTarget) {
    if (roadRoute) {
      etaMin = roadRoute.durationMin;
      etaDistanceKm = roadRoute.distanceKm;
      etaIsRoad = roadRoute.source === 'osrm';
    } else {
      const distKm = haversineKm(driverPos.lat, driverPos.lng, navTarget.lat, navTarget.lng);
      etaDistanceKm = distKm;
      etaMin = Math.max(1, Math.round((distKm / CITY_SPEED_KMH) * 60));
    }
    if (role === 'passager' && isTracking && live) {
      const distKm = haversineKm(live.lat, live.lng, navTarget.lat, navTarget.lng);
      if (distKm < 0.2) arrived = true;
    }
  }

  const etaLabel =
    etaMin !== null
      ? `~${etaMin} min${etaDistanceKm !== null ? ` · ${etaDistanceKm.toFixed(1).replace('.', ',')} km${etaIsRoad ? ' par la route' : ''}` : ''}`
      : null;

  return (
    <div className="space-y-3">
      {/* Bandeau ETA (passager, course acceptée). */}
      {role === 'passager' && isTracking && (
        <div className="bg-night-900 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3 text-slate-100">
          <Navigation size={18} className="text-gold shrink-0" />
          {arrived ? (
            <p className="text-sm font-black">Ton chauffeur est arrivé au point de départ !</p>
          ) : etaLabel !== null ? (
            <p className="text-sm">
              <strong className="font-black">Ton chauffeur arrive</strong> — Arrivée dans {etaLabel}
            </p>
          ) : (
            <p className="text-sm text-slate-300">
              En attente de la position en direct de ton chauffeur…
            </p>
          )}
        </div>
      )}

      {/* Bandeau partage + ETA (chauffeur, course acceptée). */}
      {role === 'chauffeur' && isTracking && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Navigation size={18} className="text-stacks-green shrink-0" />
          {sharing === 'active' ? (
            <p className="text-sm text-green-800">
              <strong className="font-black">Partage de position actif</strong> — ton passager te voit arriver
              en direct{etaLabel !== null ? ` — arrivée au point de départ dans ${etaLabel}` : ''}.
            </p>
          ) : sharing === 'denied' ? (
            <p className="text-sm text-amber-800">
              <strong className="font-black">Géolocalisation refusée</strong> — autorise la position dans ton
              navigateur pour que ton passager te voie arriver.
            </p>
          ) : sharing === 'unavailable' ? (
            <p className="text-sm text-amber-800">
              Ton appareil ne partage pas sa position — ton passager voit ton quartier.
            </p>
          ) : (
            <p className="text-sm text-slate-600">Activation du partage de position…</p>
          )}
        </div>
      )}

      {/* Bandeau ETA destination (chauffeur, course en cours). */}
      {role === 'chauffeur' && status === 'en_cours' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Navigation size={18} className="text-stacks-green shrink-0" />
          <p className="text-sm text-green-800">
            <strong className="font-black">Course en cours</strong>
            {etaLabel !== null ? ` — arrivée à destination dans ${etaLabel}.` : ' — itinéraire ci-dessous.'}
          </p>
        </div>
      )}

      <div className="h-[380px] sm:h-[440px] rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
        <TrackingMap
          pickup={pickup}
          destination={destination}
          driver={shownDriver}
          navRoute={role === 'chauffeur' && isNavigating ? roadRoute : null}
        />
      </div>

      {/* Navigation guidée (chauffeur) : pickup puis destination. */}
      {role === 'chauffeur' && isNavigating && navTarget && (
        <DriverNavigation
          route={roadRoute}
          phase={status === 'en_cours' ? 'destination' : 'pickup'}
          from={driverPos}
          to={navTarget}
          toLabel={navTarget.label}
        />
      )}
    </div>
  );
}
