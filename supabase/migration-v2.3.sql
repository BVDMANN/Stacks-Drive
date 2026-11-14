-- ============================================================
-- Stacks Drive v2.3 — Migration ADDITIVE (à exécuter UNE fois)
-- Dashboard Supabase > SQL Editor, après le déploiement de la v2.3.
-- Ne JAMAIS réexécuter schema.sql (v1), migration-v2.sql ni
-- migration-v2.2.sql.
--
-- Contenu :
--  1. Prix -24 % : rien en base (matrice dans lib/pricing.ts).
--  2. Points chauffeur (remplacent l'argent direct) :
--     table driver_points (registre), colonne
--     profiles.free_rides_remaining, colonne
--     driver_earnings.is_free_ride, fonction
--     redeem_points_for_free_rides() (échange 10 000 points =
--     5 courses sans commission).
--  3. finalize_ride_earnings() REMPLACÉE (create or replace) :
--     Course Double = points doublés (plus de commission offerte),
--     quêtes en points (plus de cash), consommation des courses
--     gratuites (commission 0, coût plateforme = commission offerte),
--     borne d'anomalie 400 FCFA (nouveau plancher Groupe).
--
-- Modèle économique (décisions Stacks, 13/11/2026) — inchangé :
--  commission 5 % au lancement puis 8 %, plafond 10 % ; le passager
--  paie le chauffeur directement (espèces / Airtel / Moov) ; l'appli
--  ne touche jamais l'argent, elle compte seulement ; dépôt 5 000 FCFA ;
--  plafond de dette ~5 000 FCFA. Pas de wallet, pas d'abonnement.
-- Les niveaux ne réduisent PLUS la commission (taux identique pour
-- tous) : ils multiplient les points (Argent +5 %, Or +10 %,
-- Diamant +25 %).
-- ============================================================

-- ---------- 1. Profils : courses gratuites restantes ----------
alter table public.profiles
  add column if not exists free_rides_remaining int not null default 0
    check (free_rides_remaining >= 0);

-- ---------- 2. Gains : marquer les courses sans commission ----------
alter table public.driver_earnings
  add column if not exists is_free_ride boolean not null default false;

-- ---------- 3. Registre des points chauffeur ----------
-- Une ligne par gain / dépense de points. `points` positif = gagné,
-- négatif = échangé. Idempotence : unique (driver_id, ride_id, kind)
-- quand ride_id est renseigné — une course ne crédite ses points
-- qu'une seule fois, même si finalize est appelée deux fois.
create table if not exists public.driver_points (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  ride_id uuid references public.rides (id) on delete set null,
  points int not null,
  kind text not null check (kind in ('course', 'quete_jour', 'quete_semaine', 'echange')),
  created_at timestamptz not null default now()
);

create unique index if not exists driver_points_ride_kind_uidx
  on public.driver_points (driver_id, ride_id, kind)
  where ride_id is not null;

create index if not exists driver_points_driver_idx
  on public.driver_points (driver_id, created_at);

alter table public.driver_points enable row level security;

drop policy if exists "Drivers read their own points" on public.driver_points;
create policy "Drivers read their own points"
  on public.driver_points for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
-- Écriture UNIQUEMENT via les fonctions SECURITY DEFINER
-- finalize_ride_earnings() et redeem_points_for_free_rides() :
-- aucun insert / update / delete direct.

-- ---------- 4. Échange de points (10 000 points = 5 courses sans commission) ----------
-- Atomique : la ligne profil est verrouillée (SELECT ... FOR UPDATE),
-- deux échanges simultanés ne peuvent pas dépenser deux fois les
-- mêmes points. Seul un chauffeur peut échanger ses propres points.
create or replace function public.redeem_points_for_free_rides()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance int;
  v_free int;
  v_role text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Non connecté.');
  end if;

  select role, free_rides_remaining into v_role, v_free
    from public.profiles where id = auth.uid() for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Profil introuvable.');
  end if;
  if v_role <> 'chauffeur' then
    return jsonb_build_object('ok', false, 'error', 'Seuls les chauffeurs échangent des points.');
  end if;

  select coalesce(sum(points), 0) into v_balance
    from public.driver_points where driver_id = auth.uid();
  if v_balance < 10000 then
    return jsonb_build_object('ok', false, 'error',
      'Il te faut 10 000 points pour échanger.',
      'balance', v_balance);
  end if;

  insert into public.driver_points (driver_id, ride_id, points, kind)
    values (auth.uid(), null, -10000, 'echange');
  update public.profiles
    set free_rides_remaining = coalesce(v_free, 0) + 5
    where id = auth.uid();
  insert into public.audit_log (actor_id, event, details)
    values (auth.uid(), 'points_redeemed',
            jsonb_build_object('points', -10000, 'free_rides', 5));

  return jsonb_build_object('ok', true,
    'balance', v_balance - 10000,
    'free_rides', coalesce(v_free, 0) + 5);
end;
$$;

grant execute on function public.redeem_points_for_free_rides() to authenticated;

-- ---------- 5. Clôture d'une course : gains + points (v2.3) ----------
-- Idempotente : si une ligne driver_earnings existe déjà pour cette
-- course, elle est renvoyée telle quelle (double envoi, double clic,
-- retry réseau = jamais de double commission, jamais de double points).
-- Constantes gamification (miroir de lib/gamification.ts — les modifier
-- là-bas ET ici) : 100 points/course (200 sur Course Double), quête jour
-- 8 courses / 1 000 points, quête semaine 40 courses / 5 000 points,
-- multiplicateurs Bronze ×1 / Argent ×1,05 / Or ×1,10 / Diamant ×1,25,
-- échange 10 000 points = 5 courses sans commission.
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
  -- v2.3 : points + courses gratuites.
  v_free_left int;
  v_use_free boolean := false;
  v_points int := 0;
  v_points_multiplier numeric := 1;
  v_points_balance int := 0;
  v_quest_day int;
  v_quest_week int;
  v_quest_points int := 0;
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
    select coalesce(sum(points), 0) into v_points_balance
      from public.driver_points where driver_id = v_ride.driver_id;
    select free_rides_remaining into v_free_left
      from public.profiles where id = v_ride.driver_id;
    return jsonb_build_object(
      'ok', true, 'already_recorded', true,
      'fare', v_existing.fare_amount,
      'commission', v_existing.commission_amount,
      'kept', v_existing.driver_kept_amount,
      'is_double_ride', v_existing.is_double_ride,
      'is_free_ride', v_existing.is_free_ride,
      'quest_bonus', v_existing.quest_bonus,
      'quest_points', 0,
      'points_earned', 0,
      'points_balance', v_points_balance,
      'free_rides_remaining', coalesce(v_free_left, 0),
      'platform_cost', v_existing.platform_cost
    );
  end if;

  -- ---- Garde-fous : anomalie = on bloque, on journalise, on ne paie pas.
  -- Borne basse 400 FCFA depuis la v2.3 (nouveau plancher Groupe).
  v_fare := coalesce(v_ride.proposed_price, v_ride.estimated_price, 0);
  v_rate := coalesce(v_ride.commission_rate, 0.05);
  if v_fare < 0 or (v_fare = 0 and coalesce(v_ride.distance_km, 0) > 0)
     or v_fare < 400 or v_fare > 50000 or v_rate < 0 or v_rate > 0.1 then
    insert into public.audit_log (actor_id, event, ride_id, details)
      values (v_ride.driver_id, 'anomaly_detected', p_ride_id,
              jsonb_build_object('fare', v_fare, 'rate', v_rate,
                                 'distance_km', v_ride.distance_km));
    return jsonb_build_object('ok', false, 'error',
      'Montant incohérent sur cette course — gains bloqués pour vérification par l’admin.');
  end if;

  -- ---- Courses gratuites restantes (échange de points) : on verrouille
  -- la ligne profil pour que deux clôtures simultanées du même
  -- chauffeur ne consomment pas deux fois la même course gratuite.
  select free_rides_remaining into v_free_left
    from public.profiles where id = v_ride.driver_id for update;

  -- ---- Découpe.
  -- Fidélité passager (10e course offerte) : inchangée, la plateforme
  -- absorbe le tarif, le chauffeur touche tout — et on ne consomme PAS
  -- une course gratuite du chauffeur (il garde déjà 100 %).
  -- Course sans commission (échange de points) : commission 0, coût
  -- plateforme = commission offerte (comme l'ancienne Course Double).
  -- Course Double (v2.3) : commission NORMALE — elle double les points,
  -- elle n'offre plus la commission.
  if v_ride.loyalty_free then
    v_commission := 0;
    v_kept := v_fare;
    v_platform_cost := v_fare; -- la plateforme absorbe le tarif (course offerte)
  elsif coalesce(v_free_left, 0) > 0 then
    v_use_free := true;
    v_commission := 0;
    v_kept := v_fare;
    v_platform_cost := round(v_fare * v_rate); -- commission offerte par la plateforme
    update public.profiles
      set free_rides_remaining = v_free_left - 1
      where id = v_ride.driver_id;
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
     driver_kept_amount, is_double_ride, is_free_ride, quest_bonus, platform_cost,
     period_day, period_week, period_month)
  values
    (p_ride_id, v_ride.driver_id, v_fare, v_rate, v_commission,
     v_kept, v_ride.is_double_ride, v_use_free, 0, v_platform_cost,
     v_today, v_week, v_month);

  insert into public.audit_log (actor_id, event, ride_id, details)
    values (v_ride.driver_id, 'commission_recorded', p_ride_id,
            jsonb_build_object('fare', v_fare, 'rate', v_rate,
                               'commission', v_commission, 'kept', v_kept,
                               'is_double_ride', v_ride.is_double_ride,
                               'is_free_ride', v_use_free,
                               'loyalty_free', v_ride.loyalty_free));

  -- ---- Quête du jour (8 courses → 1 000 POINTS, v2.3) : un seul
  -- versement en points, jamais en argent. quest_bonus_claims sert de
  -- garde « un seul versement par période » (bonus_amount = points).
  select count(*) into v_completed_count
    from public.driver_earnings
    where driver_id = v_ride.driver_id and period_day = v_today;
  if v_completed_count >= 8 then
    insert into public.quest_bonus_claims
      (driver_id, period_type, period_start, bonus_amount, ride_id)
    values (v_ride.driver_id, 'jour', v_today, 1000, p_ride_id)
    on conflict (driver_id, period_type, period_start) do nothing
    returning bonus_amount into v_quest_day;
    if v_quest_day is not null then
      insert into public.driver_points (driver_id, ride_id, points, kind)
        values (v_ride.driver_id, p_ride_id, 1000, 'quete_jour')
        on conflict (driver_id, ride_id, kind) do nothing;
      insert into public.audit_log (actor_id, event, ride_id, details)
        values (v_ride.driver_id, 'points_awarded', p_ride_id,
                jsonb_build_object('period_type', 'jour', 'points', 1000));
    else
      v_quest_day := 0;
    end if;
  else
    v_quest_day := 0;
  end if;

  -- ---- Défi hebdomadaire (40 courses → 5 000 POINTS, v2.3).
  select count(*) into v_completed_count
    from public.driver_earnings
    where driver_id = v_ride.driver_id and period_week = v_week;
  if v_completed_count >= 40 then
    insert into public.quest_bonus_claims
      (driver_id, period_type, period_start, bonus_amount, ride_id)
    values (v_ride.driver_id, 'semaine', v_week, 5000, p_ride_id)
    on conflict (driver_id, period_type, period_start) do nothing
    returning bonus_amount into v_quest_week;
    if v_quest_week is not null then
      insert into public.driver_points (driver_id, ride_id, points, kind)
        values (v_ride.driver_id, p_ride_id, 5000, 'quete_semaine')
        on conflict (driver_id, ride_id, kind) do nothing;
      insert into public.audit_log (actor_id, event, ride_id, details)
        values (v_ride.driver_id, 'points_awarded', p_ride_id,
                jsonb_build_object('period_type', 'semaine', 'points', 5000));
    else
      v_quest_week := 0;
    end if;
  else
    v_quest_week := 0;
  end if;
  v_quest_points := coalesce(v_quest_day, 0) + coalesce(v_quest_week, 0);

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

  -- ---- Points de la course (v2.3) : 100 par course, 200 sur une
  -- Course Double, multipliés par le niveau (×1 / ×1,05 / ×1,10 / ×1,25).
  v_points_multiplier := case v_tier
    when 'Argent' then 1.05
    when 'Or' then 1.10
    when 'Diamant' then 1.25
    else 1.0 end;
  v_points := round(
    (case when v_ride.is_double_ride then 200 else 100 end) * v_points_multiplier
  );
  insert into public.driver_points (driver_id, ride_id, points, kind)
    values (v_ride.driver_id, p_ride_id, v_points, 'course')
    on conflict (driver_id, ride_id, kind) do nothing;
  select coalesce(sum(points), 0) into v_points_balance
    from public.driver_points where driver_id = v_ride.driver_id;

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
    'is_free_ride', v_use_free,
    'quest_bonus', 0,
    'quest_points', v_quest_points,
    'points_earned', v_points,
    'points_balance', v_points_balance,
    'free_rides_remaining', case when v_use_free then coalesce(v_free_left, 0) - 1 else coalesce(v_free_left, 0) end,
    'platform_cost', v_platform_cost,
    'tier', v_tier, 'streak', v_streak,
    'completed_count', v_completed_count
  );
end;
$$;

grant execute on function public.finalize_ride_earnings(uuid) to authenticated;

-- ============================================================
-- Fin de la migration v2.3. Vérifications rapides :
-- select count(*) from public.driver_points;          -- 0
-- select column_name from information_schema.columns
--   where table_name = 'profiles'
--   and column_name = 'free_rides_remaining';        -- 1 ligne
-- select column_name from information_schema.columns
--   where table_name = 'driver_earnings'
--   and column_name = 'is_free_ride';                -- 1 ligne
-- select proname from pg_proc where proname in
--   ('finalize_ride_earnings', 'redeem_points_for_free_rides');
-- -- Échange (connecté en chauffeur, 10 000 points requis) :
-- select public.redeem_points_for_free_rides();
-- ============================================================
