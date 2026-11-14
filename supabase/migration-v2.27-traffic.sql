-- ============================================================
-- Stacks Drive v2.27 — Trafic : itinéraire routier, trafic
-- communautaire, zones sans chauffeur (lot E).
--
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.27. Le script est idempotent
-- (IF NOT EXISTS + CREATE OR REPLACE + gardes) : le relancer est
-- sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql /
-- migration-v2.2.sql / migration-v2.3.sql / migration-v2.4.sql /
-- migration-v2.6.sql / migration-v2.10.sql /
-- migration-v2.15-disputes.sql / migration-v2.17-mode-rules.sql /
-- migration-v2.19-seats.sql / migration-v2.20-driver-privacy.sql /
-- migration-v2.23-p0a.sql / migration-v2.24-realtime-emails.sql /
-- migration-v2.25-drivers.sql / migration-v2.26-fraud.sql.
--
-- Contenu :
--  1. Itinéraire routier (phase 1) : AUCUNE table — la route API
--     `/api/route` appelle OSRM (serveur démo public, sans clé) et
--     met en cache 5 min côté serveur ; le prix reste calculé sur la
--     distance à vol d'oiseau (`lib/pricing.ts`, inchangé).
--  2. Trafic communautaire (phase 2) : table `traffic_reports`
--     (type, position, auteur, expiration 30–60 min selon le type,
--     posée par trigger) + table `traffic_confirmations` (un
--     chauffeur = une confirmation par signalement). RLS : seuls les
--     chauffeurs signalent et confirment, tout le monde lit les
--     marqueurs (lecture publique — aucune donnée personnelle : ni
--     nom, ni téléphone, l'auteur n'est jamais exposé par l'API).
--     Modération auto : un signalement confirmé par au moins 2
--     chauffeurs est affiché en évidence ; sinon il expire
--     (30–60 min) sans être mis en avant.
--  3. Zones sans chauffeur : table `unanswered_zones` (une ligne par
--     demande sans proposition depuis plus de 2 min — unicité
--     `ride_id` : une seule alerte par demande, sans spam), visible
--     dans /admin pour cibler le recrutement.
--
-- Règles métier inchangées : commission 5 % / 8 % / plafond 10 %
-- (`lib/commission.ts` non touchée), prix côté serveur uniquement,
-- Groupe = 1 place, Solo = véhicule entier.
-- ============================================================

-- ---------- 1. Table des signalements trafic ----------
create table if not exists public.traffic_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  ride_id uuid references public.rides (id) on delete set null,
  type text not null check (type in ('embouteillage', 'accident', 'travaux', 'route_fermee')),
  lat double precision not null check (lat between -0.5 and 1.5),
  lng double precision not null check (lng between 8.5 and 10.5),
  neighborhood text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  created_at timestamptz not null default now()
);

create index if not exists traffic_reports_active_idx
  on public.traffic_reports (expires_at desc)
  where expires_at > now();

create index if not exists traffic_reports_reporter_idx
  on public.traffic_reports (reporter_id, created_at desc);

-- Expiration automatique (30–60 min selon le type) : posée à
-- l'insertion — l'API la pose aussi, le trigger fait foi si elle
-- est absente ou incohérente.
create or replace function public.set_traffic_expires_at()
returns trigger
language plpgsql
as $$
begin
  new.expires_at := now() + case new.type
    when 'embouteillage' then interval '30 minutes'
    when 'accident' then interval '60 minutes'
    when 'travaux' then interval '60 minutes'
    when 'route_fermee' then interval '60 minutes'
    else interval '30 minutes'
  end;
  return new;
end;
$$;

drop trigger if exists traffic_reports_set_expires on public.traffic_reports;
create trigger traffic_reports_set_expires
  before insert on public.traffic_reports
  for each row execute function public.set_traffic_expires_at();

-- ---------- 2. Table des confirmations ----------
create table if not exists public.traffic_confirmations (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.traffic_reports (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Un chauffeur = une confirmation par signalement (anti-spam +
-- modération auto : le compteur ne peut pas être gonflé).
create unique index if not exists traffic_confirmations_one_idx
  on public.traffic_confirmations (report_id, driver_id);

create index if not exists traffic_confirmations_report_idx
  on public.traffic_confirmations (report_id);

-- ---------- 3. Table des zones sans chauffeur ----------
create table if not exists public.unanswered_zones (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides (id) on delete cascade,
  pickup text not null,
  destination text not null,
  ride_type text not null check (ride_type in ('solo', 'groupe')),
  alerted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists unanswered_zones_alerted_idx
  on public.unanswered_zones (alerted_at desc);

-- ---------- RLS ----------
alter table public.traffic_reports enable row level security;
alter table public.traffic_confirmations enable row level security;
alter table public.unanswered_zones enable row level security;

-- Signalements : lecture publique (marqueurs sur la carte — aucune
-- donnée personnelle dans les colonnes lues par l'API) ; insertion
-- réservée aux chauffeurs (le contrôle « en course active » est
-- fait par l'API, la RLS verrouille le rôle).
drop policy if exists traffic_reports_select_all on public.traffic_reports;
create policy traffic_reports_select_all on public.traffic_reports
  for select using (true);

drop policy if exists traffic_reports_insert_driver on public.traffic_reports;
create policy traffic_reports_insert_driver on public.traffic_reports
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'chauffeur'
    )
  );

-- Confirmations : lecture publique (le compteur) ; insertion
-- réservée aux chauffeurs (pas sa propre confirmation : contrôlé
-- par l'API — la RLS ne voit pas l'auteur du signalement ici).
drop policy if exists traffic_confirmations_select_all on public.traffic_confirmations;
create policy traffic_confirmations_select_all on public.traffic_confirmations
  for select using (true);

drop policy if exists traffic_confirmations_insert_driver on public.traffic_confirmations;
create policy traffic_confirmations_insert_driver on public.traffic_confirmations
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'chauffeur'
    )
  );

-- Zones sans chauffeur : lecture réservée aux chauffeurs (alerte de
-- proximité) et à l'administrateur (journal de recrutement) ;
-- insertion réservée aux chauffeurs (vérification serveur lors du
-- sondage des demandes entrantes).
drop policy if exists unanswered_zones_select_staff on public.unanswered_zones;
create policy unanswered_zones_select_staff on public.unanswered_zones
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and (role = 'chauffeur' or is_admin = true)
    )
  );

drop policy if exists unanswered_zones_insert_driver on public.unanswered_zones;
create policy unanswered_zones_insert_driver on public.unanswered_zones
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'chauffeur'
    )
  );
