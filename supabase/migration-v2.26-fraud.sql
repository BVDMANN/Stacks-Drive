-- ============================================================
-- Stacks Drive v2.26 — Sécurité & qualité (lot D).
--
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.26. Le script est idempotent
-- (IF NOT EXISTS + CREATE OR REPLACE + gardes) : le relancer est
-- sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql /
-- migration-v2.2.sql / migration-v2.3.sql / migration-v2.4.sql /
-- migration-v2.6.sql / migration-v2.10.sql /
-- migration-v2.15-disputes.sql / migration-v2.17-mode-rules.sql /
-- migration-v2.19-seats.sql / migration-v2.20-driver-privacy.sql /
-- migration-v2.23-p0a.sql / migration-v2.24-realtime-emails.sql /
-- migration-v2.25-drivers.sql.
--
-- Contenu :
--  1. Détection de fraude auto (`lib/fraud.ts`) : marqueur
--     `profiles.fraud_blocked` (+ motif + date), table
--     `fraud_cases` (un seul dossier ouvert par utilisateur et par
--     signal — anti-rafale en base), fonctions SECURITY DEFINER
--     `report_fraud_case` (enregistre + met hors ligne) et
--     `resolve_fraud_case` (déblocage admin). Le blocage ne touche
--     JAMAIS le paiement ni la dette : il coupe seulement la mise
--     en ligne et la réception des demandes.
--  2. Nettoyage auto des données — RGPD (`lib/data-cleanup.ts`) :
--     fonction SECURITY DEFINER `run_data_cleanup` (appelée par le
--     cron hebdo existant `/api/cron/weekly-report`, AUCUN nouveau
--     cron) : supprime les positions chauffeur de plus de 24 h ou
--     d'une course qui n'est plus `acceptee`, fait passer les
--     propositions `pending` échues à `expired` (historique
--     conservé, rien n'est supprimé), COMPTE les comptes inactifs
--     (≥ 12 mois sans activité) sans jamais les supprimer ni les
--     anonymiser — la politique de confidentialité ne prévoit
--     aucune suppression automatique de compte. Chaque passage est
--     journalisé dans `data_cleanups` (visible dans /admin).
--  3. Garde anti-escalade étendue : `fraud_blocked` ne peut être
--     modifié que par un administrateur (ou par les fonctions
--     SECURITY DEFINER du présent lot, via un marqueur de session
--     interne) — un chauffeur bloqué ne peut pas se débloquer
--     lui-même en appelant PostgREST directement.
--
-- Règles métier inchangées : commission 5 % / 8 % / plafond 10 %
-- (`lib/commission.ts` non touchée), prix côté serveur uniquement,
-- Groupe = 1 place, Solo = véhicule entier. Seuils fraude dans
-- `lib/fraud.ts` (annulations 6+ et taux > 40 %, vitesse > 150
-- km/h, 2 courses verrouillées PIN sur 30 jours, téléphone partagé
-- par 2+ comptes — blocage dès 3).
-- ============================================================

-- ---------- 1. Marqueur « à vérifier » sur les profils ----------
alter table public.profiles
  add column if not exists fraud_blocked boolean not null default false,
  add column if not exists fraud_blocked_at timestamptz,
  add column if not exists fraud_blocked_reason text;

create index if not exists profiles_fraud_blocked_idx
  on public.profiles (fraud_blocked_at desc)
  where fraud_blocked is true;

-- ---------- 2. Table des dossiers de fraude ----------
create table if not exists public.fraud_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  signal text not null check (signal in ('cancellations', 'impossible_speed', 'pin_repeated', 'shared_phone')),
  status text not null default 'ouvert' check (status in ('ouvert', 'resolu', 'rejete')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

-- Un seul dossier ouvert par utilisateur et par signal : un signal
-- répété ne recrée ni dossier ni alerte (anti-rafale en base).
create unique index if not exists fraud_cases_one_open_idx
  on public.fraud_cases (user_id, signal)
  where status = 'ouvert';

create index if not exists fraud_cases_user_idx
  on public.fraud_cases (user_id, created_at desc);
create index if not exists fraud_cases_open_idx
  on public.fraud_cases (created_at desc)
  where status = 'ouvert';

alter table public.fraud_cases enable row level security;

-- L'utilisateur lit ses propres dossiers, l'admin lit tout.
-- Écriture directe : uniquement son propre dossier (repli si la
-- fonction SECURITY DEFINER est indisponible) ; l'admin gère tout.
drop policy if exists "Users read their fraud cases" on public.fraud_cases;
create policy "Users read their fraud cases"
  on public.fraud_cases for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "Users insert their own fraud case" on public.fraud_cases;
create policy "Users insert their own fraud case"
  on public.fraud_cases for insert
  with check (auth.uid() = user_id);

drop policy if exists "Admins manage fraud cases" on public.fraud_cases;
create policy "Admins manage fraud cases"
  on public.fraud_cases for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 3. Journal des nettoyages ----------
create table if not exists public.data_cleanups (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  locations_deleted int not null default 0 check (locations_deleted >= 0),
  proposals_expired int not null default 0 check (proposals_expired >= 0),
  inactive_accounts int not null default 0 check (inactive_accounts >= 0)
);

create index if not exists data_cleanups_run_idx
  on public.data_cleanups (run_at desc);

alter table public.data_cleanups enable row level security;

-- Lecture admin uniquement. Aucune écriture directe : seul
-- `run_data_cleanup` (SECURITY DEFINER) insère ici.
drop policy if exists "Admins read data cleanups" on public.data_cleanups;
create policy "Admins read data cleanups"
  on public.data_cleanups for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 4. Garde anti-escalade étendue (fraud_blocked) ----------
-- `prevent_privilege_escalation` (schema.sql) est REMPLACÉE ici, à
-- l'identique plus le marqueur fraude : `fraud_blocked` (et ses
-- colonnes associées) ne peut être modifié que par un
-- administrateur. Exception : les fonctions SECURITY DEFINER du
-- présent lot posent un marqueur de session transactionnel
-- (`stacks_drive.fraud_guard_bypass`) avant d'écrire — un client
-- PostgREST ne peut pas poser ce marqueur, donc un chauffeur bloqué
-- ne peut pas se débloquer lui-même. Les écritures SQL directes
-- (auth.uid() null, premier admin) restent possibles.
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
  bypass text;
begin
  if new.is_verified is distinct from old.is_verified
     or new.is_admin is distinct from old.is_admin
     or new.fraud_blocked is distinct from old.fraud_blocked
     or new.fraud_blocked_at is distinct from old.fraud_blocked_at
     or new.fraud_blocked_reason is distinct from old.fraud_blocked_reason then
    bypass := coalesce(current_setting('stacks_drive.fraud_guard_bypass', true), '');
    if bypass <> '1' and auth.uid() is not null then
      select p.is_admin into caller_is_admin
        from public.profiles p where p.id = auth.uid();
      if coalesce(caller_is_admin, false) is not true then
        raise exception 'Seul un administrateur peut modifier la vérification, le rôle admin ou le blocage fraude.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ---------- 5. Fonctions SECURITY DEFINER (API + cron, sans session) ----------
-- Enregistre un cas de fraude et, si demandé, bloque temporairement
-- le compte (mise hors ligne + marqueur « à vérifier »). Idempotent :
-- si un dossier ouvert existe déjà pour (utilisateur, signal), ne
-- fait rien et renvoie false (pas de deuxième alerte, pas de
-- deuxième blocage). Ne touche jamais au paiement ni à la dette.
create or replace function public.report_fraud_case(
  p_user_id uuid,
  p_signal text,
  p_details jsonb,
  p_block boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created boolean := false;
begin
  if p_signal not in ('cancellations', 'impossible_speed', 'pin_repeated', 'shared_phone') then
    return false;
  end if;
  -- Marqueur de session : autorise l'écriture de fraud_blocked
  -- malgré la garde anti-escalade (voir §4).
  perform set_config('stacks_drive.fraud_guard_bypass', '1', true);
  insert into public.fraud_cases (user_id, signal, status, details)
  values (p_user_id, p_signal, 'ouvert', coalesce(p_details, '{}'::jsonb))
  on conflict (user_id, signal) where status = 'ouvert' do nothing
  returning true into v_created;
  if coalesce(v_created, false) is not true then
    return false;
  end if;
  if coalesce(p_block, false) then
    update public.profiles
      set is_online = false,
          fraud_blocked = true,
          fraud_blocked_at = now(),
          fraud_blocked_reason = p_signal
      where id = p_user_id;
  else
    -- Alerte sans mise hors ligne (téléphone partagé par 2 comptes) :
    -- on pose seulement le motif, visible dans /admin.
    update public.profiles
      set fraud_blocked_reason = p_signal
      where id = p_user_id
        and fraud_blocked is not true;
  end if;
  return true;
end;
$$;

-- Débloque un compte (admin) : marqueur levé, dossiers ouverts du
-- compte marqués résolus. Le chauffeur devra se remettre en ligne
-- lui-même. Renvoie true si le compte existait.
create or replace function public.resolve_fraud_case(
  p_user_id uuid,
  p_admin_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_found boolean := false;
begin
  perform set_config('stacks_drive.fraud_guard_bypass', '1', true);
  update public.profiles
    set fraud_blocked = false,
        fraud_blocked_at = null,
        fraud_blocked_reason = null
    where id = p_user_id
    returning true into v_found;
  if coalesce(v_found, false) is not true then
    return false;
  end if;
  update public.fraud_cases
    set status = 'resolu',
        resolved_at = now(),
        resolved_by = p_admin_id
    where user_id = p_user_id
      and status = 'ouvert';
  return true;
end;
$$;

-- Nettoyage hebdomadaire des données (RGPD) — appelé par le cron
-- existant `/api/cron/weekly-report`, jamais par un autre cron :
--   1. positions chauffeur : supprimées si la course n'est plus
--      `acceptee` ou si la position a plus de 24 h ;
--   2. propositions `pending` échues (`expires_at` dépassée) :
--      statut `expired` (historique conservé) ;
--   3. comptes inactifs (≥ 12 mois sans course ni mise en ligne) :
--      COMPTÉS seulement — jamais supprimés ni anonymisés (la
--      politique de confidentialité ne prévoit aucune suppression
--      automatique de compte).
-- Chaque passage est journalisé dans `data_cleanups`. Renvoie les
-- compteurs en JSON. Tolère l'absence de `profiles.last_online_at`
-- (migration v2.25 non appliquée) : l'inactivité retombe alors sur
-- la date d'inscription et les courses.
create or replace function public.run_data_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locations int := 0;
  v_proposals int := 0;
  v_inactive int := 0;
  v_has_last_online boolean := false;
  v_query text;
begin
  delete from public.driver_locations dl
    using public.rides r
    where dl.ride_id = r.id
      and (r.status <> 'acceptee'
           or dl.updated_at < now() - interval '24 hours');
  get diagnostics v_locations = row_count;

  update public.ride_proposals
    set status = 'expired'
    where status = 'pending'
      and expires_at < now();
  get diagnostics v_proposals = row_count;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'last_online_at'
  ) into v_has_last_online;

  v_query := $q$
    select count(*) from public.profiles p
    where p.created_at < now() - interval '365 days'
      and not exists (
        select 1 from public.rides r
        where (r.passenger_id = p.id or r.driver_id = p.id)
          and r.created_at > now() - interval '365 days'
      )
  $q$;
  if v_has_last_online then
    v_query := v_query || $q$
      and (p.last_online_at is null or p.last_online_at < now() - interval '365 days')
    $q$;
  end if;
  execute v_query into v_inactive;

  insert into public.data_cleanups (locations_deleted, proposals_expired, inactive_accounts)
  values (v_locations, v_proposals, v_inactive);

  return jsonb_build_object(
    'locations_deleted', v_locations,
    'proposals_expired', v_proposals,
    'inactive_accounts', v_inactive
  );
end;
$$;
