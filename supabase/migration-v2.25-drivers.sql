-- ============================================================
-- Stacks Drive v2.25 — Chauffeurs : onboarding, parrainage,
-- relances, dépôt (lot C).
--
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.25. Le script est idempotent
-- (IF NOT EXISTS + CREATE OR REPLACE + gardes) : le relancer est
-- sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql /
-- migration-v2.2.sql / migration-v2.3.sql / migration-v2.4.sql /
-- migration-v2.6.sql / migration-v2.10.sql /
-- migration-v2.15-disputes.sql / migration-v2.17-mode-rules.sql /
-- migration-v2.19-seats.sql / migration-v2.20-driver-privacy.sql /
-- migration-v2.23-p0a.sql / migration-v2.24-realtime-emails.sql.
--
-- Contenu :
--  1. Onboarding autonome : bienvenue in-app (drapeau
--     `profiles.driver_welcome_seen_at`) + rappels « dossier
--     incomplet » à 48 h puis à J+7 (drapeaux de déduplication,
--     un seul e-mail par étape).
--  2. Parrainage chauffeurs (SILENCIEUX — jamais annoncé sur les
--     pages publiques) : code unique par chauffeur vérifié
--     (`profiles.referral_code`), table `driver_referrals`
--     (parrain → filleul), bonus en POINTS du système existant
--     (1 000 au parrain + 500 au filleul quand le filleul est
--     vérifié ET a terminé 5 courses — `driver_points`, kind
--     'parrainage'). Le parrainage passager vient dans un lot
--     ultérieur — pas ici.
--  3. Relances inactifs : `profiles.last_online_at` (posée par
--     trigger à chaque mise en ligne) + drapeau
--     `inactive_reminder_sent_at` (max 1 e-mail/semaine).
--  4. Dépôt / dette au plafond : aucun changement de règle — le
--     blocage existe déjà (v2.2) ; ce lot ajoute seulement le
--     message côté chauffeur (code applicatif, pas de SQL).
--
-- Règles métier inchangées : commission 5 % / 8 % / plafond 10 %
-- (`lib/commission.ts` non touchée), prix côté serveur uniquement,
-- Groupe = 1 place, Solo = véhicule entier.
-- ============================================================

-- ---------- 1. Profils : parrainage, relances, bienvenue ----------
alter table public.profiles
  add column if not exists referral_code text,
  add column if not exists referred_by uuid references public.profiles (id) on delete set null,
  add column if not exists last_online_at timestamptz,
  add column if not exists driver_welcome_seen_at timestamptz,
  add column if not exists incomplete_reminder_sent_at timestamptz,
  add column if not exists incomplete_reminder_2_sent_at timestamptz,
  add column if not exists inactive_reminder_sent_at timestamptz;

-- Un code de parrainage ne sert qu'à un seul chauffeur.
create unique index if not exists profiles_referral_code_unique_idx
  on public.profiles (referral_code)
  where referral_code is not null;

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by)
  where referred_by is not null;

create index if not exists profiles_last_online_idx
  on public.profiles (last_online_at)
  where role = 'chauffeur';

-- ---------- 2. Table des parrainages ----------
-- Une ligne par filleul (un chauffeur n'a qu'un seul parrain).
-- `rewarded_at` = bonus versé (parrain + filleul, en points).
create table if not exists public.driver_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referee_id uuid not null references public.profiles (id) on delete cascade,
  referral_code text not null,
  created_at timestamptz not null default now(),
  rewarded_at timestamptz,
  unique (referee_id)
);

create index if not exists driver_referrals_referrer_idx
  on public.driver_referrals (referrer_id, created_at desc);
create index if not exists driver_referrals_unrewarded_idx
  on public.driver_referrals (created_at)
  where rewarded_at is null;

alter table public.driver_referrals enable row level security;

-- Le parrain lit ses filleuls, le filleul lit sa propre ligne,
-- l'admin lit tout. Écriture UNIQUEMENT via les fonctions SECURITY
-- DEFINER ci-dessous (jamais d'insert direct).
drop policy if exists "Referrers and referees read their referrals" on public.driver_referrals;
create policy "Referrers and referees read their referrals"
  on public.driver_referrals for select
  using (
    auth.uid() = referrer_id
    or auth.uid() = referee_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "Admins manage referrals" on public.driver_referrals;
create policy "Admins manage referrals"
  on public.driver_referrals for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 3. Points : kind 'parrainage' ----------
-- Le registre `driver_points` (v2.3) n'acceptait que course /
-- quête / échange. On ajoute le kind parrainage (bonus au parrain
-- et au filleul, jamais en argent : des points, comme les quêtes).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'driver_points_kind_check'
      and conrelid = 'public.driver_points'::regclass
  ) then
    alter table public.driver_points drop constraint driver_points_kind_check;
  end if;
end $$;

alter table public.driver_points
  add constraint driver_points_kind_check
  check (kind in ('course', 'quete_jour', 'quete_semaine', 'echange', 'parrainage'));

-- ---------- 4. Dernière mise en ligne (trigger) ----------
-- Posée à chaque passage hors ligne → en ligne. C'est elle qui
-- définit l'inactivité (7 jours sans mise en ligne). Les chauffeurs
-- déjà en ligne au moment de la migration gardent last_online_at à
-- NULL : ils sont traités comme « jamais en ligne » (relance si
-- inscrits depuis plus de 7 jours) — le cron ne relance qu'une fois
-- par semaine, la gêne est bornée.
create or replace function public.track_last_online()
returns trigger
language plpgsql
as $$
begin
  if new.is_online is true and coalesce(old.is_online, false) is not true then
    new.last_online_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_track_last_online on public.profiles;
create trigger profiles_track_last_online
  before update on public.profiles
  for each row execute function public.track_last_online();

-- ---------- 5. Code de parrainage à la création du profil ----------
-- `handle_new_user` (schema.sql) est REMPLACÉE ici, à l'identique
-- plus le parrainage : si l'inscription porte un code (`metadata
-- referral_code`), le parrain est retrouvé et `referred_by` est posé
-- (jamais soi-même, jamais si le code n'existe pas). Le code du
-- nouveau chauffeur lui-même est créé à sa vérification
-- (`ensure_referral_code`), pas à l'inscription : seuls les
-- chauffeurs vérifiés parrainent.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_code text;
begin
  v_code = nullif(new.raw_user_meta_data ->> 'referral_code', '');
  if v_code is not null then
    select id into v_referrer_id
      from public.profiles
      where referral_code = upper(v_code)
        and role = 'chauffeur'
      limit 1;
    if v_referrer_id = new.id then
      v_referrer_id = null;
    end if;
  end if;
  insert into public.profiles (id, email, full_name, phone, role, referred_by)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case when new.raw_user_meta_data ->> 'role' in ('passager', 'chauffeur')
      then new.raw_user_meta_data ->> 'role'
      else 'passager' end,
    v_referrer_id
  )
  on conflict (id) do nothing;
  -- Le parrainage est aussi tracé dans driver_referrals (ligne
  -- visible par le parrain et l'admin) — sauf si déjà présent.
  if v_referrer_id is not null then
    insert into public.driver_referrals (referrer_id, referee_id, referral_code)
    values (v_referrer_id, new.id, upper(v_code))
    on conflict (referee_id) do nothing;
  end if;
  return new;
end;
$$;

-- ---------- 6. Fonctions SECURITY DEFINER (API + cron, sans session) ----------
-- Code de parrainage d'un chauffeur (créé à la vérification, ou à la
-- première visite du tableau de bord). Déterministe : nom + hash
-- court de l'id. Idempotent : ne touche pas à un code existant.
create or replace function public.ensure_referral_code(p_driver_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_existing text;
  v_name text;
begin
  select referral_code, full_name into v_existing, v_name
    from public.profiles where id = p_driver_id;
  if v_existing is not null then
    return v_existing;
  end if;
  v_code := 'SD-' || upper(substr(regexp_replace(coalesce(v_name, 'DRIVER'), '[^A-Za-z]', '', 'g'), 1, 8))
    || '-' || upper(substr(md5(p_driver_id::text), 1, 4));
  if length(regexp_replace(coalesce(v_name, ''), '[^A-Za-z]', '', 'g')) = 0 then
    v_code := 'SD-DRIVER-' || upper(substr(md5(p_driver_id::text), 1, 4));
  end if;
  begin
    update public.profiles set referral_code = v_code where id = p_driver_id;
  exception when unique_violation then
    -- Collision de code (quasi impossible : hash de l'id) — on
    -- rallonge avec 4 caractères de hash supplémentaires.
    v_code := v_code || upper(substr(md5(p_driver_id::text), 5, 4));
    update public.profiles set referral_code = v_code where id = p_driver_id;
  end;
  return v_code;
end;
$$;

-- Enregistre un parrainage saisi après l'inscription (code tapé dans
-- le tableau de bord). Appelée par le filleul lui-même : le parrain
-- doit être un chauffeur vérifié, différent du filleul, et le filleul
-- ne doit pas déjà avoir de parrain. Renvoie l'id du parrain, ou NULL.
create or replace function public.record_referral(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_referee_id uuid := auth.uid();
  v_existing uuid;
begin
  if v_referee_id is null then
    return null;
  end if;
  select referred_by into v_existing from public.profiles where id = v_referee_id;
  if v_existing is not null then
    return v_existing;
  end if;
  if exists (select 1 from public.driver_referrals where referee_id = v_referee_id) then
    select referrer_id into v_existing from public.driver_referrals where referee_id = v_referee_id;
    return v_existing;
  end if;
  select id into v_referrer_id
    from public.profiles
    where referral_code = upper(nullif(trim(p_code), ''))
      and role = 'chauffeur'
      and is_verified = true
      and id <> v_referee_id
    limit 1;
  if v_referrer_id is null then
    return null;
  end if;
  update public.profiles set referred_by = v_referrer_id where id = v_referee_id;
  insert into public.driver_referrals (referrer_id, referee_id, referral_code)
  values (v_referrer_id, v_referee_id, upper(trim(p_code)))
  on conflict (referee_id) do nothing;
  return v_referrer_id;
end;
$$;

-- Crédite le bonus de parrainage (cron hebdo) : 1 000 points au
-- parrain, 500 points au filleul, en `driver_points` (kind
-- 'parrainage'). Revérifie en base : filleul vérifié ET 5 courses
-- terminées (`driver_earnings`), parrainage non encore récompensé.
-- Atomique et idempotent : un double passage ne paie jamais deux
-- fois (la ligne est verrouillée, `rewarded_at` fait foi).
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
  values (p_referrer_id, null, 1000, 'parrainage');
  insert into public.driver_points (driver_id, ride_id, points, kind)
  values (p_referee_id, null, 500, 'parrainage');
  update public.driver_referrals set rewarded_at = now()
    where referrer_id = p_referrer_id and referee_id = p_referee_id;
  return true;
end;
$$;

-- Marque un rappel chauffeur comme envoyé (cron hebdo) :
-- 'incomplete_1' (48 h), 'incomplete_2' (J+7), 'inactive' (inactif).
create or replace function public.mark_driver_reminder_sent(p_driver_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind = 'incomplete_1' then
    update public.profiles set incomplete_reminder_sent_at = now() where id = p_driver_id;
  elsif p_kind = 'incomplete_2' then
    update public.profiles set incomplete_reminder_2_sent_at = now() where id = p_driver_id;
  elsif p_kind = 'inactive' then
    update public.profiles set inactive_reminder_sent_at = now() where id = p_driver_id;
  end if;
end;
$$;
