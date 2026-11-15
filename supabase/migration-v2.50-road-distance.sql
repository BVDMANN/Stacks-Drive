-- Migration v2.50 — distance et durée routières de la course (ADR 0025).
--
-- Depuis la v2.50, l'estimation est calculée sur la DISTANCE ROUTIÈRE
-- OSRM entre les points exacts du trajet (et non plus sur le vol
-- d'oiseau). La demande de course stocke la distance et la durée de
-- la route au moment de la demande ; l'acceptation d'une proposition
-- les revalide sur les points exacts (la route peut différer si le
-- chauffeur a accepté depuis un autre point de départ).
--
-- EXÉCUTION : UNE SEULE FOIS, dans le SQL Editor Supabase (projet
-- stacks-drive), après approbation du propriétaire. NE PAS réexécuter.
-- Idempotente (add column if not exists) : une seconde exécution ne
-- fait rien.
--
-- Règle de repli : si la migration n'est pas appliquée, l'insert de
-- la demande échoue avec 42703 et `app/api/rides/route.ts` retente
-- sans ces deux colonnes (la demande reste valable, sans distance
-- stockée).

alter table public.rides
  add column if not exists distance_km numeric;

alter table public.rides
  add column if not exists duration_min integer;

comment on column public.rides.distance_km is
  'Distance routière OSRM (ou vol d''oiseau en repli, voir le journal d''audit fare_computed) du trajet, en km — celle de l''estimation serveur au moment de la demande, revalidée à l''acceptation de la proposition.';

comment on column public.rides.duration_min is
  'Durée routière OSRM (ou estimée à 25 km/h en repli) du trajet, en minutes.';
