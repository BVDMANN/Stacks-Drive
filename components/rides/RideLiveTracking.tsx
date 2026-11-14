'use client';

import { useEffect, useRef, useState } from 'react';
import { Navigation } from 'lucide-react';
import { TrackingMap } from './TrackingMap';
import type { MapDriver, MapPoint } from '@/components/map/LibrevilleMap';
import { haversineKm } from '@/lib/geo';

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

  // --- Côté chauffeur : partage de la position (~10 s). ---
  useEffect(() => {
    if (!isTracking || role !== 'chauffeur') return;
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
  }, [isTracking, role, rideId]);

  // Position du chauffeur affichée : en direct si disponible (position
  // partagée côté passager, position du navigateur côté chauffeur),
  // sinon celle du profil (quartier, avec dérive démo pour les démos).
  const shownDriver: MapDriver | null =
    driver && live
      ? { ...driver, lat: live.lat, lng: live.lng }
      : driver && selfLive
        ? { ...driver, lat: selfLive.lat, lng: selfLive.lng }
        : driver;

  // ETA passager : distance restante / 30 km/h. Moins de 200 m = arrivé.
  let etaMin: number | null = null;
  let arrived = false;
  if (role === 'passager' && isTracking && live && pickup) {
    const distKm = haversineKm(live.lat, live.lng, pickup.lat, pickup.lng);
    if (distKm < 0.2) arrived = true;
    else etaMin = Math.max(1, Math.round((distKm / CITY_SPEED_KMH) * 60));
  }

  return (
    <div className="space-y-3">
      {/* Bandeau ETA (passager, course acceptée). */}
      {role === 'passager' && isTracking && (
        <div className="bg-night-900 border border-white/10 rounded-2xl px-4 py-3 flex items-center gap-3 text-slate-100">
          <Navigation size={18} className="text-gold shrink-0" />
          {arrived ? (
            <p className="text-sm font-black">Ton chauffeur est arrivé au point de départ !</p>
          ) : etaMin !== null ? (
            <p className="text-sm">
              <strong className="font-black">Ton chauffeur arrive</strong> — Arrivée dans ~{etaMin} min
            </p>
          ) : (
            <p className="text-sm text-slate-300">
              En attente de la position en direct de ton chauffeur…
            </p>
          )}
        </div>
      )}

      {/* Bandeau partage (chauffeur, course acceptée). */}
      {role === 'chauffeur' && isTracking && (
        <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
          <Navigation size={18} className="text-stacks-green shrink-0" />
          {sharing === 'active' ? (
            <p className="text-sm text-green-800">
              <strong className="font-black">Partage de position actif</strong> — ton passager te voit arriver
              en direct. Le partage s’arrête quand tu démarres la course.
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

      <div className="h-[380px] sm:h-[440px] rounded-3xl overflow-hidden border border-slate-200 shadow-sm relative">
        <TrackingMap pickup={pickup} destination={destination} driver={shownDriver} />
      </div>
    </div>
  );
}
