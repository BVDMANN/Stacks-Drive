-- ============================================================
-- Stacks Drive v2.2 — Migration ADDITIVE (à exécuter UNE fois)
-- Dashboard Supabase > SQL Editor, après le déploiement de la v2.2.
-- Ne JAMAIS réexécuter schema.sql (v1) ni migration-v2.sql.
--
-- Contenu :
--  1. Code PIN de démarrage (4 chiffres, 5 échecs = verrouillage).
--  2. Tableau de bord chauffeur : gains figés par course
--     (table driver_earnings, 1 ligne par course, idempotente),
--     règlements hebdomadaires (driver_settlements), dépôt de
--     garantie + niveau sur profiles.
--  3. Gamification : badges (driver_badges), bonus de quête
--     (quest_bonus_claims, 1 seul versement par période).
--  4. Recommandations & plaintes (ride_feedback, les deux côtés).
--  5. Journal d'audit (audit_log) : tarifs, commissions, PIN,
--     dépôts, règlements, anomalies.
--  6. Fonctions SECURITY DEFINER : verify_ride_pin(),
--     finalize_ride_earnings() (idempotente), get_driver_of_week().
--  7. RLS sur toutes les nouvelles tables.
--
-- Modèle économique (décisions Randy, 13/11/2026) — inchangé :
--  commission 5 % au lancement puis 8 %, plafond 10 % ; le passager
--  paie le chauffeur directement (espèces / Airtel / Moov) ; l'appli
--  ne touche jamais l'argent, elle compte seulement ; dépôt 5 000 FCFA ;
--  plafond de dette ~5 000 FCFA. Pas de wallet, pas d'abonnement.
-- ============================================================

-- ---------- 1. Profils : dépôt + niveau ----------
alter table public.profiles
  add column if not exists deposit_paid boolean not null default false,
  add column if not exists deposit_amount int not null default 0
    check (deposit_amount >= 0),
  add column if not exists deposit_paid_at timestamptz,
  add column if not exists tier text not null default 'Bronze'
    check (tier in ('Bronze', 'Argent', 'Or', 'Diamant'));

-- ---------- 2. Courses : PIN + gains figés ----------
alter table public.rides
  add column if not exists pin_code text
    check (pin_code is null or pin_code ~ '^[0-9]{4}$'),
  add column if not exists pin_attempts int not null default 0
    check (pin_attempts >= 0),
  add column if not exists pin_locked boolean not null default false,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists distance_km numeric,
  add column if not exists duration_min int,
  add column if not exists commission_rate numeric
    check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 0.1)),
  add column if not exists is_double_ride boolean not null default false,
  add column if not exists platform_cost int not null default 0
    check (platform_cost >= 0);

create index if not exists rides_driver_completed_idx
  on public.rides (driver_id, completed_at)
  where status = 'terminee';

-- ---------- 3. Gains chauffeur (1 ligne par course terminée) ----------
-- Idempotence : unique (ride_id) — terminer deux fois la même course
-- (double envoi, double clic) ne crée JAMAIS une deuxième commission.
create table if not exists public.driver_earnings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  fare_amount int not null check (fare_amount >= 0),
  commission_rate numeric not null check (commission_rate >= 0 and commission_rate <= 0.1),
  commission_amount int not null check (commission_amount >= 0),
  driver_kept_amount int not null check (driver_kept_amount >= 0),
  is_double_ride boolean not null default false,
  quest_bonus int not null default 0 check (quest_bonus >= 0),
  platform_cost int not null default 0 check (platform_cost >= 0),
  period_day date not null,
  period_week date not null,
  period_month date not null,
  created_at timestamptz not null default now()
);

create index if not exists driver_earnings_driver_day_idx
  on public.driver_earnings (driver_id, period_day);
create index if not exists driver_earnings_driver_week_idx
  on public.driver_earnings (driver_id, period_week);

alter table public.driver_earnings enable row level security;

drop policy if exists "Drivers read their own earnings" on public.driver_earnings;
create policy "Drivers read their own earnings"
  on public.driver_earnings for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
-- Écriture UNIQUEMENT via la fonction SECURITY DEFINER
-- finalize_ride_earnings() : aucun insert / update / delete direct.

-- ---------- 4. Règlements hebdomadaires (admin) ----------
create table if not exists public.driver_settlements (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null check (amount > 0),
  method text not null default 'mobile_money'
    check (method in ('mobile_money', 'especes', 'autre')),
  period_start date,
  period_end date,
  note text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists driver_settlements_driver_idx
  on public.driver_settlements (driver_id, created_at);

alter table public.driver_settlements enable row level security;

drop policy if exists "Drivers and admins read settlements" on public.driver_settlements;
create policy "Drivers and admins read settlements"
  on public.driver_settlements for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "Admins record settlements" on public.driver_settlements;
create policy "Admins record settlements"
  on public.driver_settlements for insert
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---------- 5. Recommandations & plaintes (les deux côtés) ----------
create table if not exists public.ride_feedback (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  from_role text not null check (from_role in ('passager', 'chauffeur')),
  to_user_id uuid references public.profiles (id) on delete set null,
  rating int check (rating is null or (rating between 1 and 5)),
  comment text,
  category text
    check (category is null or category in ('retard', 'comportement', 'proprete', 'itineraire', 'paiement', 'autre')),
  kind text not null check (kind in ('note', 'plainte', 'recommandation')),
  created_at timestamptz not null default now(),
  -- Un seul retour de chaque type par personne et par course.
  unique (ride_id, from_user_id, kind)
);

create index if not exists ride_feedback_ride_idx on public.ride_feedback (ride_id, kind);
create index if not exists ride_feedback_kind_idx on public.ride_feedback (kind, created_at);

alter table public.ride_feedback enable row level security;

drop policy if exists "Feedback readable by parties and admins" on public.ride_feedback;
create policy "Feedback readable by parties and admins"
  on public.ride_feedback for select
  using (
    auth.uid() = from_user_id
    or auth.uid() = to_user_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "Users file their own feedback" on public.ride_feedback;
create policy "Users file their own feedback"
  on public.ride_feedback for insert
  with check (auth.uid() = from_user_id);

-- ---------- 6. Journal d'audit ----------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  event text not null,
  ride_id uuid references public.rides (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_event_idx on public.audit_log (event, created_at);
create index if not exists audit_log_ride_idx on public.audit_log (ride_id, created_at);

alter table public.audit_log enable row level security;

drop policy if exists "Admins read the audit log" on public.audit_log;
create policy "Admins read the audit log"
  on public.audit_log for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Users log their own audit events" on public.audit_log;
create policy "Users log their own audit events"
  on public.audit_log for insert
  with check (auth.uid() = actor_id);

-- ---------- 7. Badges chauffeur ----------
create table if not exists public.driver_badges (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  badge text not null,
  awarded_at timestamptz not null default now(),
  unique (driver_id, badge)
);

create index if not exists driver_badges_driver_idx on public.driver_badges (driver_id);

alter table public.driver_badges enable row level security;

drop policy if exists "Drivers and admins read badges" on public.driver_badges;
create policy "Drivers and admins read badges"
  on public.driver_badges for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
-- Attribution UNIQUEMENT via finalize_ride_earnings() (SECURITY DEFINER).

-- ---------- 8. Bonus de quête (1 seul versement par période) ----------
create table if not exists public.quest_bonus_claims (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  period_type text not null check (period_type in ('jour', 'semaine')),
  period_start date not null,
  bonus_amount int not null check (bonus_amount >= 0),
  ride_id uuid references public.rides (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (driver_id, period_type, period_start)
);

alter table public.quest_bonus_claims enable row level security;

drop policy if exists "Drivers and admins read quest claims" on public.quest_bonus_claims;
create policy "Drivers and admins read quest claims"
  on public.quest_bonus_claims for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
-- Versement UNIQUEMENT via finalize_ride_earnings() (SECURITY DEFINER).

-- ---------- 9. Vérification du code PIN ----------
-- Appelée par l'API au démarrage d'une course. Verrouille la ligne
-- (SELECT ... FOR UPDATE) : deux tentatives simultanées ne peuvent pas
-- dépasser 5 échecs. Retourne un JSON { ok, attempts_left, locked, error }.
create or replace function public.verify_ride_pin(p_ride_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride record;
  v_attempts int;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('ok', false, 'error', 'Code à 4 chiffres requis.');
  end if;

  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Course introuvable.');
  end if;

  -- Seul le chauffeur assigné peut saisir le code.
  if v_ride.driver_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'Seul le chauffeur de cette course peut démarrer.');
  end if;

  if v_ride.status <> 'acceptee' then
    return jsonb_build_object('ok', false, 'error', 'La course doit être confirmée pour démarrer.');
  end if;

  if v_ride.pin_locked then
    insert into public.audit_log (actor_id, event, ride_id, details)
      values (auth.uid(), 'pin_failed', p_ride_id, '{"reason": "locked"}'::jsonb);
    return jsonb_build_object('ok', false, 'locked', true,
      'error', 'Course verrouillée après 5 codes faux. Contacte Stacks Drive pour la débloquer.');
  end if;

  if v_ride.pin_code is not null and v_ride.pin_code = p_pin then
    update public.rides
      set status = 'en_cours', started_at = now(), pin_attempts = 0
      where id = p_ride_id;
    return jsonb_build_object('ok', true, 'attempts_left', 5);
  end if;

  -- Code faux : on compte la tentative, verrouillage au 5e échec.
  v_attempts := coalesce(v_ride.pin_attempts, 0) + 1;
  update public.rides
    set pin_attempts = v_attempts,
        pin_locked = (v_attempts >= 5)
    where id = p_ride_id;
  insert into public.audit_log (actor_id, event, ride_id, details)
    values (auth.uid(), 'pin_failed', p_ride_id,
            jsonb_build_object('attempts', v_attempts));
  if v_attempts >= 5 then
    insert into public.audit_log (actor_id, event, ride_id, details)
      values (auth.uid(), 'pin_locked', p_ride_id,
              jsonb_build_object('attempts', v_attempts));
    return jsonb_build_object('ok', false, 'locked', true, 'attempts_left', 0,
      'error', 'Course verrouillée après 5 codes faux. Contacte Stacks Drive pour la débloquer.');
  end if;
  return jsonb_build_object('ok', false, 'attempts_left', 5 - v_attempts,
    'error', 'Code faux. Essaie encore.');
end;
$$;

grant execute on function public.verify_ride_pin(uuid, text) to authenticated;

-- ---------- 10. Clôture d'une course : gains + gamification ----------
-- Idempotente : si une ligne driver_earnings existe déjà pour cette
-- course, elle est renvoyée telle quelle (double envoi, double clic,
-- retry réseau = jamais de double commission).
-- Constantes gamification (miroir de lib/gamification.ts — les modifier
-- là-bas ET ici) : quête jour 8 courses / 1 000 FCFA ; quête semaine
-- 40 courses / 5 000 FCFA ; niveaux Bronze 0 / Argent 20 / Or 50
-- (note ≥ 4,5) / Diamant 100 (note ≥ 4,5).
create or replace function public.finalize_ride_earnings(p_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride record;
  v_existing public.driver_earnings%rowtype;
  v_fare int;
  v_rate numeric;
  v_commission int;
  v_kept int;
  v_platform_cost int;
  v_quest_bonus int := 0;
  v_today date;
  v_week date;
  v_month date;
  v_completed_count int;
  v_avg_rating numeric;
  v_tier text;
  v_night_count int;
  v_streak int;
  v_day date;
  v_has_day boolean;
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Course introuvable.');
  end if;
  if v_ride.status <> 'terminee' then
    return jsonb_build_object('ok', false, 'error', 'La course doit être terminée.');
  end if;
  if v_ride.driver_id is null then
    return jsonb_build_object('ok', false, 'error', 'Aucun chauffeur sur cette course.');
  end if;

  -- Idempotence : déjà clôturée ?
  select * into v_existing from public.driver_earnings where ride_id = p_ride_id;
  if found then
    return jsonb_build_object(
      'ok', true, 'already_recorded', true,
      'fare', v_existing.fare_amount,
      'commission', v_existing.commission_amount,
      'kept', v_existing.driver_kept_amount,
      'is_double_ride', v_existing.is_double_ride,
      'quest_bonus', v_existing.quest_bonus,
      'platform_cost', v_existing.platform_cost
    );
  end if;

  -- ---- Garde-fous : anomalie = on bloque, on journalise, on ne paie pas.
  v_fare := coalesce(v_ride.proposed_price, v_ride.estimated_price, 0);
  v_rate := coalesce(v_ride.commission_rate, 0.05);
  if v_fare < 0 or (v_fare = 0 and coalesce(v_ride.distance_km, 0) > 0)
     or v_fare < 500 or v_fare > 50000 or v_rate < 0 or v_rate > 0.1 then
    insert into public.audit_log (actor_id, event, ride_id, details)
      values (v_ride.driver_id, 'anomaly_detected', p_ride_id,
              jsonb_build_object('fare', v_fare, 'rate', v_rate,
                                 'distance_km', v_ride.distance_km));
    return jsonb_build_object('ok', false, 'error',
      'Montant incohérent sur cette course — gains bloqués pour vérification par l’admin.');
  end if;

  -- ---- Découpe (fidélité / Course Double : commission offerte).
  if v_ride.loyalty_free then
    v_commission := 0;
    v_kept := v_fare;
    v_platform_cost := v_fare; -- la plateforme absorbe le tarif (course offerte)
  elsif v_ride.is_double_ride then
    v_commission := 0;
    v_kept := v_fare;
    v_platform_cost := round(v_fare * v_rate); -- commission offerte par la plateforme
  else
    v_commission := round(v_fare * v_rate);
    v_kept := v_fare - v_commission;
    v_platform_cost := coalesce(v_ride.platform_cost, 0);
  end if;

  v_today := (now() at time zone 'Africa/Libreville')::date;
  v_week := date_trunc('week', v_today)::date;
  v_month := date_trunc('month', v_today)::date;

  insert into public.driver_earnings
    (ride_id, driver_id, fare_amount, commission_rate, commission_amount,
     driver_kept_amount, is_double_ride, quest_bonus, platform_cost,
     period_day, period_week, period_month)
  values
    (p_ride_id, v_ride.driver_id, v_fare, v_rate, v_commission,
     v_kept, v_ride.is_double_ride, 0, v_platform_cost,
     v_today, v_week, v_month);

  insert into public.audit_log (actor_id, event, ride_id, details)
    values (v_ride.driver_id, 'commission_recorded', p_ride_id,
            jsonb_build_object('fare', v_fare, 'rate', v_rate,
                               'commission', v_commission, 'kept', v_kept,
                               'is_double_ride', v_ride.is_double_ride,
                               'loyalty_free', v_ride.loyalty_free));

  -- ---- Quête du jour (8 courses → 1 000 FCFA) : un seul versement.
  select count(*) into v_completed_count
    from public.driver_earnings
    where driver_id = v_ride.driver_id and period_day = v_today;
  if v_completed_count >= 8 then
    insert into public.quest_bonus_claims
      (driver_id, period_type, period_start, bonus_amount, ride_id)
    values (v_ride.driver_id, 'jour', v_today, 1000, p_ride_id)
    on conflict (driver_id, period_type, period_start) do nothing
    returning bonus_amount into v_quest_bonus;
    if v_quest_bonus is not null then
      update public.driver_earnings
        set quest_bonus = quest_bonus + v_quest_bonus,
            platform_cost = platform_cost + v_quest_bonus
        where ride_id = p_ride_id;
      v_platform_cost := v_platform_cost + v_quest_bonus;
      insert into public.audit_log (actor_id, event, ride_id, details)
        values (v_ride.driver_id, 'quest_bonus_awarded', p_ride_id,
                jsonb_build_object('period_type', 'jour', 'bonus', v_quest_bonus));
    else
      v_quest_bonus := 0;
    end if;
  end if;

  -- ---- Défi hebdomadaire (40 courses → 5 000 FCFA) : un seul versement.
  select count(*) into v_completed_count
    from public.driver_earnings
    where driver_id = v_ride.driver_id and period_week = v_week;
  if v_completed_count >= 40 then
    insert into public.quest_bonus_claims
      (driver_id, period_type, period_start, bonus_amount, ride_id)
    values (v_ride.driver_id, 'semaine', v_week, 5000, p_ride_id)
    on conflict (driver_id, period_type, period_start) do nothing
    returning bonus_amount into v_quest_bonus;
    if v_quest_bonus is not null then
      update public.driver_earnings
        set quest_bonus = quest_bonus + v_quest_bonus,
            platform_cost = platform_cost + v_quest_bonus
        where ride_id = p_ride_id;
      v_platform_cost := v_platform_cost + v_quest_bonus;
      insert into public.audit_log (actor_id, event, ride_id, details)
        values (v_ride.driver_id, 'quest_bonus_awarded', p_ride_id,
                jsonb_build_object('period_type', 'semaine', 'bonus', v_quest_bonus));
    end if;
  end if;

  -- ---- Niveau du chauffeur (recalculé depuis les vraies stats, jamais
  -- depuis la colonne profiles.tier — un chauffeur ne peut pas
  -- s'auto-promouvoir via l'API).
  select count(*), avg(rating_driver) into v_completed_count, v_avg_rating
    from public.rides
    where driver_id = v_ride.driver_id and status = 'terminee';
  v_tier := 'Bronze';
  if v_completed_count >= 20 then v_tier := 'Argent'; end if;
  if v_completed_count >= 50 and coalesce(v_avg_rating, 0) >= 4.5 then v_tier := 'Or'; end if;
  if v_completed_count >= 100 and coalesce(v_avg_rating, 0) >= 4.5 then v_tier := 'Diamant'; end if;
  update public.profiles set tier = v_tier where id = v_ride.driver_id;

  -- ---- Badges (une seule attribution par badge, conflit ignoré).
  insert into public.driver_badges (driver_id, badge)
    values (v_ride.driver_id, 'premiere-course')
    on conflict (driver_id, badge) do nothing;
  if v_completed_count >= 10 then
    insert into public.driver_badges (driver_id, badge)
      values (v_ride.driver_id, 'dix-courses') on conflict (driver_id, badge) do nothing;
  end if;
  if v_completed_count >= 50 then
    insert into public.driver_badges (driver_id, badge)
      values (v_ride.driver_id, 'cinquante-courses') on conflict (driver_id, badge) do nothing;
  end if;
  if v_completed_count >= 100 then
    insert into public.driver_badges (driver_id, badge)
      values (v_ride.driver_id, 'cent-courses') on conflict (driver_id, badge) do nothing;
  end if;
  if coalesce(v_avg_rating, 0) >= 5 and v_completed_count >= 10 then
    insert into public.driver_badges (driver_id, badge)
      values (v_ride.driver_id, 'cinq-etoiles') on conflict (driver_id, badge) do nothing;
  end if;
  select count(*) into v_night_count
    from public.rides
    where driver_id = v_ride.driver_id and status = 'terminee'
      and (extract(hour from completed_at at time zone 'Africa/Libreville') >= 20
           or extract(hour from completed_at at time zone 'Africa/Libreville') < 6);
  if v_night_count >= 10 then
    insert into public.driver_badges (driver_id, badge)
      values (v_ride.driver_id, 'roi-de-la-nuit') on conflict (driver_id, badge) do nothing;
  end if;
  if v_ride.is_double_ride then
    insert into public.driver_badges (driver_id, badge)
      values (v_ride.driver_id, 'course-double') on conflict (driver_id, badge) do nothing;
  end if;

  -- Série : jours consécutifs avec au moins une course, en remontant
  -- depuis aujourd'hui (ou hier si aucune course aujourd'hui).
  v_streak := 0;
  v_day := v_today;
  loop
    select exists (
      select 1 from public.driver_earnings
      where driver_id = v_ride.driver_id and period_day = v_day
    ) into v_has_day;
    if not v_has_day then
      if v_day = v_today then
        v_day := v_day - 1; -- aucune course aujourd'hui : on regarde hier
        continue;
      end if;
      exit;
    end if;
    v_streak := v_streak + 1;
    v_day := v_day - 1;
  end loop;
  if v_streak >= 7 then
    insert into public.driver_badges (driver_id, badge)
      values (v_ride.driver_id, 'serie-7') on conflict (driver_id, badge) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true, 'already_recorded', false,
    'fare', v_fare, 'commission', v_commission, 'kept', v_kept,
    'is_double_ride', v_ride.is_double_ride,
    'quest_bonus', coalesce((
      select quest_bonus from public.driver_earnings where ride_id = p_ride_id
    ), 0),
    'platform_cost', v_platform_cost,
    'tier', v_tier, 'streak', v_streak,
    'completed_count', v_completed_count
  );
end;
$$;

grant execute on function public.finalize_ride_earnings(uuid) to authenticated;

-- ---------- 11. Chauffeur de la semaine ----------
-- Le plus de courses terminées cette semaine (lundi → maintenant),
-- départagé par la note moyenne. Lecture publique du classement :
-- seul le nom et le nombre de courses sont exposés.
create or replace function public.get_driver_of_week()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_build_object(
    'driver_id', d.driver_id,
    'name', p.full_name,
    'rides', d.rides,
    'rating', d.rating
  ), 'null'::jsonb)
  from (
    select e.driver_id,
           count(*) as rides,
           round(avg(r.rating_driver)::numeric, 1) as rating
    from public.driver_earnings e
    left join public.rides r on r.id = e.ride_id
    where e.period_week = date_trunc('week', (now() at time zone 'Africa/Libreville')::date)::date
    group by e.driver_id
    order by count(*) desc, avg(r.rating_driver) desc nulls last
    limit 1
  ) d
  left join public.profiles p on p.id = d.driver_id;
$$;

grant execute on function public.get_driver_of_week() to anon, authenticated;

-- ============================================================
-- Fin de la migration v2.2. Vérifications rapides :
-- select count(*) from public.driver_earnings;      -- 0
-- select count(*) from public.ride_feedback;        -- 0
-- select count(*) from public.audit_log;            -- 0
-- select proname from pg_proc where proname in
--   ('verify_ride_pin', 'finalize_ride_earnings', 'get_driver_of_week');
-- select column_name from information_schema.columns
--   where table_name = 'rides' and column_name in
--   ('pin_code', 'pin_locked', 'is_double_ride', 'commission_rate');
-- ============================================================
