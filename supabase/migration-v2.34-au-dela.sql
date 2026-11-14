-- ============================================================
-- Stacks Drive v2.34 — Lot « Au-delà » : RideCheck, audio de
-- trajet, chauffeur favori, retour, classe Confort, file
-- aéroport, arrondi des prix acceptés, parrainage doublé.
--
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.34. Le script est idempotent
-- (IF NOT EXISTS + CREATE OR REPLACE + gardes) : le relancer est
-- sans danger.
--
-- ⚠️ DÉCISION EN ATTENTE (propriétaire, à valider avant le push) :
-- l'arrondi du prix accepté à 50 FCFA près (item 7 du lot) est
-- implémenté côté serveur mais ne part pas en ligne sans sa
-- validation — le code est prêt, la décision reste à trancher.
--
-- NE JAMAIS réexécuter les migrations précédentes (voir README).
--
-- Contenu :
--  1. RideCheck : table `ridecheck_events` (signaux confirmés,
--     check-in passager, alerte admin) — jamais de blocage auto.
--  2. Audio de trajet : table `trip_audio` (chiffré + clé transmis
--     UNIQUEMENT avec un litige ouvert, suppression après 7 jours
--     sans litige).
--  3. Chauffeur favori : table `favorite_drivers` + colonnes
--     `rides.preferred_driver_id` / `rides.preferred_until`.
--  4. Retour : `profiles.return_destination` +
--     `profiles.return_filter_enabled`.
--  5. Classe Confort : `profiles.has_air_conditioning` +
--     `rides.comfort` (Solo + clim + note ≥ 4,5, vérifié serveur).
--  6. File aéroport : table `airport_queue` (premier arrivé,
--     premier servi).
--  7. Arrondi : aucune colonne — le prix figé est arrondi côté
--     serveur à l'acceptation (lib/price-rounding.ts).
--  8. Parrainage doublé : `credit_referral_bonus` remplacée —
--     2 000 points au parrain, 1 000 au filleul (au lieu de
--     1 000 / 500). Montants repris des constantes
--     `REFERRAL_BONUS_REFERRER_POINTS` /
--     `REFERRAL_BONUS_REFEREE_POINTS` (lib/driver-lifecycle.ts).
--
-- Règles métier inchangées : commission 5 % / 8 % / plafond 10 %
-- (`lib/commission.ts` non touchée), prix côté serveur uniquement,
-- Groupe = 1 place, Solo = véhicule entier, les chauffeurs ne
-- publient rien, l'application ne touche jamais l'argent.
-- ============================================================

-- ---------- 1. Profils : Confort + retour ----------
alter table public.profiles
  add column if not exists has_air_conditioning boolean not null default false,
  add column if not exists return_destination text,
  add column if not exists return_filter_enabled boolean not null default false;

-- ---------- 2. Courses : Confort + chauffeur favori ----------
alter table public.rides
  add column if not exists comfort boolean not null default false,
  add column if not exists preferred_driver_id uuid references public.profiles (id) on delete set null,
  add column if not exists preferred_until timestamptz;

create index if not exists rides_preferred_driver_idx
  on public.rides (preferred_driver_id, created_at desc)
  where preferred_driver_id is not null;
create index if not exists rides_comfort_idx
  on public.rides (comfort, created_at desc)
  where comfort is true;

-- ---------- 3. Chauffeurs favoris ----------
create table if not exists public.favorite_drivers (
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (passenger_id, driver_id)
);

alter table public.favorite_drivers enable row level security;

drop policy if exists "Passengers manage their favorite drivers" on public.favorite_drivers;
create policy "Passengers manage their favorite drivers"
  on public.favorite_drivers for all
  using (auth.uid() = passenger_id)
  with check (auth.uid() = passenger_id);

drop policy if exists "Admins read favorite drivers" on public.favorite_drivers;
create policy "Admins read favorite drivers"
  on public.favorite_drivers for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 4. File d'attente aéroport ----------
create table if not exists public.airport_queue (
  driver_id uuid primary key references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now()
);

alter table public.airport_queue enable row level security;

drop policy if exists "Drivers manage their airport queue entry" on public.airport_queue;
create policy "Drivers manage their airport queue entry"
  on public.airport_queue for all
  using (auth.uid() = driver_id)
  with check (auth.uid() = driver_id);

drop policy if exists "Admins read airport queue" on public.airport_queue;
create policy "Admins read airport queue"
  on public.airport_queue for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 5. RideCheck ----------
create table if not exists public.ridecheck_events (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  signal text not null check (signal in ('long_stop', 'deviation', 'long_ride')),
  consecutive_count int not null default 1,
  checkin_status text not null default 'pending'
    check (checkin_status in ('pending', 'ok', 'problem', 'no_response', 'none')),
  detail text,
  alerted_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ride_id, signal)
);

create index if not exists ridecheck_events_ride_idx
  on public.ridecheck_events (ride_id, created_at desc);

alter table public.ridecheck_events enable row level security;

drop policy if exists "Ride parties read ridecheck events" on public.ridecheck_events;
create policy "Ride parties read ridecheck events"
  on public.ridecheck_events for select
  using (
    exists (select 1 from public.rides r
      where r.id = ridecheck_events.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid()))
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Écriture UNIQUEMENT via les routes API serveur (service role /
-- fonctions SECURITY DEFINER) : aucun insert direct côté client.
drop policy if exists "Admins manage ridecheck events" on public.ridecheck_events;
create policy "Admins manage ridecheck events"
  on public.ridecheck_events for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 6. Audio de trajet ----------
-- Le chiffré et la clé ne sont présents QUE si un litige est ouvert
-- sur la course (envoi au moment de l'ouverture du litige) ; sans
-- litige, la ligne n'existe pas ou reste vide, et tout est supprimé
-- après 7 jours (TRIP_AUDIO_RETENTION_DAYS, lib/trip-audio.ts).
create table if not exists public.trip_audio (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  encrypted_blob text,
  key_b64 text,
  dispute_id uuid references public.disputes (id) on delete set null,
  uploaded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

alter table public.trip_audio enable row level security;

drop policy if exists "Admins read trip audio" on public.trip_audio;
create policy "Admins read trip audio"
  on public.trip_audio for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 7. Parrainage doublé (v2.34) ----------
-- Remplace la fonction v2.25 : 2 000 points au parrain, 1 000 au
-- filleul. Mêmes gardes (filleul vérifié + 5 courses, idempotence
-- par `rewarded_at`). Le parrainage reste SILENCIEUX : jamais
-- annoncé sur les pages publiques.
create or replace function public.credit_referral_bonus(p_referrer_id uuid, p_referee_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rewarded_at timestamptz;
  v_verified boolean;
  v_rides int;
begin
  select rewarded_at into v_rewarded_at
    from public.driver_referrals
    where referrer_id = p_referrer_id and referee_id = p_referee_id
    for update;
  if not found or v_rewarded_at is not null then
    return false;
  end if;
  select is_verified into v_verified from public.profiles where id = p_referee_id;
  if coalesce(v_verified, false) is not true then
    return false;
  end if;
  select count(*) into v_rides from public.driver_earnings where driver_id = p_referee_id;
  if v_rides < 5 then
    return false;
  end if;
  insert into public.driver_points (driver_id, ride_id, points, kind)
  values (p_referrer_id, null, 2000, 'parrainage');
  insert into public.driver_points (driver_id, ride_id, points, kind)
  values (p_referee_id, null, 1000, 'parrainage');
  update public.driver_referrals set rewarded_at = now()
    where referrer_id = p_referrer_id and referee_id = p_referee_id;
  return true;
end;
$$;
