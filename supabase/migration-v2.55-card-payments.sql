-- ============================================================
-- Stacks Drive — Migration v2.55 : paiement par carte (Stripe)
-- ============================================================
-- Modèle Stripe SIMPLIFIÉ (décisions du 15/11/2026) :
--  - le propriétaire seul marchand (pas de Stripe Connect, pas d'onboarding
--    Stripe par chauffeur) ; l'argent des courses carte arrive sur
--    son solde Stripe (EUR), la commission est la part non reversée.
--  - Commission automatique UNIQUEMENT sur les transactions carte ;
--    espèces / P2P inchangés (règlement hebdo manuel).
--  - Le passager paie les frais Stripe : prix carte = course + frais
--    (gross-up 5,15 % + 164 FCFA fixes), arrondi à 50 FCFA.
--  - XAF = devise de présentation zéro-décimale ; règlement EUR.
--  - Pré-autorisation : capture_method = manual, retenue 7 jours.
--  - Virements Stripe -> banque du propriétaire : MANUELS (jamais activés
--    automatiquement). Versement chauffeurs : lot QUOTIDIEN préparé
--    chaque matin (voir generate_daily_payout_batches) ; le rail
--    d'exécution (Global Payouts / ga_bank_account) est en PREVIEW
--    chez Stripe et NON VALIDÉ en réel — le lot est donc préparé
--    avec rail = 'manuel' et l'admin enregistre le virement
--    effectué ; aucun virement automatique n'est simulé.
--  - lib/commission.ts INTOUCHABLE (5 % / 8 % / 10 %).
--  - AUCUN secret dans le code : STRIPE_SECRET_KEY et
--    STRIPE_WEBHOOK_SECRET sont des variables d'environnement
--    (Vercel), jamais dans ce fichier ni dans le dépôt.
--  - Écritures UNIQUEMENT via les fonctions SECURITY DEFINER
--    ci-dessous (même pattern que finalize_ride_earnings) ;
--    aucun insert / update / delete direct pour les clients.
--  - Exécuter UNE SEULE FOIS (SQL Editor Supabase, projet
--    stacks-drive). Idempotente (if not exists / on conflict).
-- ============================================================

-- ---------- 0. Profils : départ du chauffeur ----------
alter table public.profiles
  add column if not exists driver_left_at timestamptz;

-- ---------- 1. Paiements carte par course (grand livre) ----------
create table if not exists public.card_payments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null unique references public.rides (id) on delete cascade,
  passenger_id uuid not null references public.profiles (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  payment_intent_id text unique,
  status text not null default 'hold_pending'
    check (status in ('hold_pending', 'hold_confirmed', 'captured',
                      'voided', 'capture_failed', 'refunded')),
  -- Montants FIGÉS à l'acceptation (FCFA, XAF zéro-décimale) :
  -- fare = prix convenu ; fees = frais Stripe (gross-up) ;
  -- charged = fare + fees = montant autorisé sur la carte.
  fare_fcfa int not null check (fare_fcfa >= 0),
  fees_fcfa int not null check (fees_fcfa >= 0),
  charged_fcfa int not null check (charged_fcfa >= 0),
  -- Frais Stripe RÉELS (balance_transaction, convertis en FCFA),
  -- renseignés au moment de la capture ; null avant.
  stripe_fee_fcfa int check (stripe_fee_fcfa is null or stripe_fee_fcfa >= 0),
  currency text not null default 'xaf',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  captured_at timestamptz,
  voided_at timestamptz
);

create index if not exists card_payments_passenger_idx
  on public.card_payments (passenger_id, created_at desc);
create index if not exists card_payments_driver_idx
  on public.card_payments (driver_id, created_at desc);
create index if not exists card_payments_intent_idx
  on public.card_payments (payment_intent_id);

alter table public.card_payments enable row level security;

drop policy if exists "Passengers read their card payments" on public.card_payments;
create policy "Passengers read their card payments"
  on public.card_payments for select
  using (
    auth.uid() = passenger_id
    or auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---------- 2. Cautions chauffeur (5 000 FCFA par carte) ----------
create table if not exists public.card_deposits (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.profiles (id) on delete cascade,
  payment_intent_id text unique,
  amount_fcfa int not null default 5000 check (amount_fcfa > 0),
  fees_fcfa int not null default 0 check (fees_fcfa >= 0),
  charged_fcfa int not null default 0 check (charged_fcfa >= 0),
  status text not null default 'en_attente'
    check (status in ('en_attente', 'paye', 'remboursement_en_cours',
                      'rembourse', 'rembourse_partiel', 'confisque')),
  refund_id text,
  refund_amount_fcfa int check (refund_amount_fcfa is null or refund_amount_fcfa >= 0),
  -- Note de remboursement / confiscation (motif explicite, lisible
  -- par le chauffeur) : fraude confirmée, dette déduite, etc.
  refund_note text,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_deposits_driver_idx
  on public.card_deposits (driver_id);

alter table public.card_deposits enable row level security;

drop policy if exists "Drivers read their card deposit" on public.card_deposits;
create policy "Drivers read their card deposit"
  on public.card_deposits for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- ---------- 3. Remboursements de dette par carte ----------
create table if not exists public.card_debt_payments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  payment_intent_id text unique,
  amount_fcfa int not null check (amount_fcfa > 0),
  status text not null default 'en_attente'
    check (status in ('en_attente', 'confirme', 'rembourse', 'echoue')),
  settlement_id uuid references public.driver_settlements (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_debt_payments_driver_idx
  on public.card_debt_payments (driver_id, created_at desc);

alter table public.card_debt_payments enable row level security;

drop policy if exists "Drivers read their card debt payments" on public.card_debt_payments;
create policy "Drivers read their card debt payments"
  on public.card_debt_payments for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- driver_settlements : la méthode 'carte' rejoint les valeurs
-- autorisées (règlement de dette par carte, v2.55).
alter table public.driver_settlements
  drop constraint if exists driver_settlements_method_check;
alter table public.driver_settlements
  add constraint driver_settlements_method_check
  check (method in ('mobile_money', 'especes', 'autre', 'carte'));

-- ---------- 4. Lots de versement quotidiens aux chauffeurs ----------
create table if not exists public.daily_payout_batches (
  id uuid primary key default gen_random_uuid(),
  payout_date date not null,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  rides_count int not null default 0 check (rides_count >= 0),
  fares_total_fcfa int not null default 0 check (fares_total_fcfa >= 0),
  driver_share_fcfa int not null default 0 check (driver_share_fcfa >= 0),
  -- Part financée par la plateforme (courses offertes fidélité,
  -- captures carte en échec) : l'argent ne vient pas de Stripe.
  platform_funded_fcfa int not null default 0 check (platform_funded_fcfa >= 0),
  status text not null default 'prepare'
    check (status in ('prepare', 'pret_a_virer', 'vire', 'echoue')),
  -- Rail d'exécution : 'manuel' tant que Global Payouts n'est pas
  -- validé en réel avec un vrai compte chauffeur gabonais.
  rail text not null default 'manuel'
    check (rail in ('manuel', 'stripe_global_payouts')),
  rail_note text,
  reference text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (payout_date, driver_id)
);

create index if not exists daily_payout_batches_date_idx
  on public.daily_payout_batches (payout_date desc, driver_id);

alter table public.daily_payout_batches enable row level security;

drop policy if exists "Drivers and admins read payout batches" on public.daily_payout_batches;
create policy "Drivers and admins read payout batches"
  on public.daily_payout_batches for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create table if not exists public.daily_payout_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.daily_payout_batches (id) on delete cascade,
  ride_id uuid not null references public.rides (id) on delete cascade,
  driver_share_fcfa int not null check (driver_share_fcfa >= 0),
  -- 'carte' = argent encaissé via Stripe ; 'plateforme' = la
  -- plateforme avance la part (fidélité offerte / capture en échec).
  source text not null check (source in ('carte', 'plateforme')),
  unique (batch_id, ride_id)
);

create index if not exists daily_payout_items_batch_idx
  on public.daily_payout_items (batch_id);

alter table public.daily_payout_items enable row level security;

drop policy if exists "Drivers and admins read payout items" on public.daily_payout_items;
create policy "Drivers and admins read payout items"
  on public.daily_payout_items for select
  using (
    exists (
      select 1 from public.daily_payout_batches b
      where b.id = batch_id
        and (b.driver_id = auth.uid()
             or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
    )
  );

-- ---------- 5. Ajustements de dette : lien vers le paiement carte ----------
-- (idempotence de la compensation de commission à la capture :
--  un seul ajustement négatif par paiement carte.)
alter table public.driver_debt_adjustments
  add column if not exists card_payment_id uuid references public.card_payments (id) on delete set null;

create index if not exists driver_debt_adjustments_card_payment_idx
  on public.driver_debt_adjustments (card_payment_id);

-- ---------- 6. Temps réel : les nouvelles tables dans la publication ----------
-- (admin /admin/live suit les paiements carte ; idempotent.)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'card_payments'
  ) then
    alter publication supabase_realtime add table public.card_payments;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'daily_payout_batches'
  ) then
    alter publication supabase_realtime add table public.daily_payout_batches;
  end if;
end $$;

-- ============================================================
-- FONCTIONS SECURITY DEFINER (seule voie d'écriture)
-- ============================================================

-- ---------- 6.1 Empreinte (hold) sur une course acceptée ----------
-- Appelée par POST /api/stripe/hold (session passager).
-- Idempotente : même course = même PaymentIntent tant que l'empreinte
-- est en vie (hold_pending / hold_confirmed) ; une empreinte annulée
-- ou en échec de capture autorise une NOUVELLE empreinte.
create or replace function public.record_card_hold(
  p_ride_id uuid,
  p_intent_id text,
  p_fare int,
  p_fees int,
  p_charged int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ride record;
  v_existing public.card_payments%rowtype;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Course introuvable.');
  end if;
  if auth.uid() is null or auth.uid() <> v_ride.passenger_id then
    return jsonb_build_object('ok', false, 'error', 'Non autorisé.');
  end if;
  if v_ride.status not in ('acceptee', 'en_cours') then
    return jsonb_build_object('ok', false, 'error', 'La course n’est plus en attente de paiement.');
  end if;
  if coalesce(v_ride.loyalty_free, false) then
    return jsonb_build_object('ok', false, 'error', 'Course offerte — aucun paiement par carte.');
  end if;
  if v_ride.payment_method <> 'carte' then
    return jsonb_build_object('ok', false, 'error', 'Cette course n’est pas payée par carte.');
  end if;

  select * into v_existing from public.card_payments where ride_id = p_ride_id;
  if found then
    if v_existing.status in ('hold_pending', 'hold_confirmed') then
      return jsonb_build_object(
        'ok', true, 'already', true,
        'intent_id', v_existing.payment_intent_id,
        'status', v_existing.status,
        'charged', v_existing.charged_fcfa
      );
    end if;
    -- Empreinte annulée / capture en échec : nouvelle empreinte.
    update public.card_payments
      set payment_intent_id = p_intent_id,
          fare_fcfa = p_fare,
          fees_fcfa = p_fees,
          charged_fcfa = p_charged,
          stripe_fee_fcfa = null,
          status = 'hold_pending',
          updated_at = now(),
          captured_at = null,
          voided_at = null
      where id = v_existing.id;
    return jsonb_build_object('ok', true, 'already', false,
      'intent_id', p_intent_id, 'status', 'hold_pending', 'charged', p_charged);
  end if;

  insert into public.card_payments
    (ride_id, passenger_id, driver_id, payment_intent_id,
     fare_fcfa, fees_fcfa, charged_fcfa, status)
  values
    (p_ride_id, v_ride.passenger_id, v_ride.driver_id, p_intent_id,
     p_fare, p_fees, p_charged, 'hold_pending');
  return jsonb_build_object('ok', true, 'already', false,
    'intent_id', p_intent_id, 'status', 'hold_pending', 'charged', p_charged);
end;
$$;

-- ---------- 6.2 Confirmation de l'empreinte (webhook Stripe) ----------
-- payment_intent.amount_capturable_updated : l'autorisation est
-- retenue sur la carte du passager (rien n'est débité).
create or replace function public.confirm_card_hold(p_intent_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_payments%rowtype;
begin
  select * into v_row from public.card_payments
    where payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Paiement carte introuvable.');
  end if;
  if v_row.status = 'hold_confirmed' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'hold_confirmed');
  end if;
  if v_row.status <> 'hold_pending' then
    return jsonb_build_object('ok', false, 'error', 'Empreinte dans un état inattendu : ' || v_row.status);
  end if;
  update public.card_payments
    set status = 'hold_confirmed', updated_at = now()
    where id = v_row.id;
  insert into public.audit_log (actor_id, event, ride_id, details)
    values (v_row.passenger_id, 'card_hold_confirmed', v_row.ride_id,
            jsonb_build_object('charged', v_row.charged_fcfa, 'fare', v_row.fare_fcfa));
  return jsonb_build_object('ok', true, 'status', 'hold_confirmed');
end;
$$;

-- ---------- 6.3 Annulation de l'empreinte (void) ----------
-- Appelée à l'annulation de la course (route API) ou par le webhook
-- payment_intent.canceled (expiration 7 jours). Rien n'est débité.
create or replace function public.void_card_hold(p_intent_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_payments%rowtype;
begin
  select * into v_row from public.card_payments
    where payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Paiement carte introuvable.');
  end if;
  if v_row.status = 'voided' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'voided');
  end if;
  if v_row.status = 'captured' then
    return jsonb_build_object('ok', false, 'error', 'Paiement déjà encaissé — annulation impossible.');
  end if;
  update public.card_payments
    set status = 'voided', updated_at = now(), voided_at = now()
    where id = v_row.id;
  insert into public.audit_log (actor_id, event, ride_id, details)
    values (v_row.passenger_id, 'card_hold_voided', v_row.ride_id,
            jsonb_build_object('charged', v_row.charged_fcfa));
  return jsonb_build_object('ok', true, 'status', 'voided');
end;
$$;

-- ---------- 6.4 Capture de l'empreinte à la fin de la course ----------
-- Appelée après la capture Stripe (route API ou webhook
-- payment_intent.succeeded). Idempotente : une seule capture par
-- course. Effet comptable clé : la commission de la course carte
-- est PRÉLEVÉE automatiquement — le chauffeur ne la doit plus
-- (ajustement de dette négatif = -commission, lié au paiement).
-- Si les gains ne sont pas encore clôturés (finalize non appelé),
-- la capture est enregistrée mais l'ajustement est reporté et
-- signalé en audit pour réconciliation admin.
create or replace function public.apply_card_capture(
  p_intent_id text,
  p_stripe_fee int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_payments%rowtype;
  v_earning public.driver_earnings%rowtype;
  v_existing_adj int;
begin
  select * into v_row from public.card_payments
    where payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Paiement carte introuvable.');
  end if;
  if v_row.status = 'captured' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'captured');
  end if;
  if v_row.status not in ('hold_confirmed', 'hold_pending') then
    return jsonb_build_object('ok', false, 'error', 'Capture impossible dans l’état : ' || v_row.status);
  end if;

  update public.card_payments
    set status = 'captured',
        stripe_fee_fcfa = p_stripe_fee,
        updated_at = now(),
        captured_at = now()
    where id = v_row.id;

  select * into v_earning from public.driver_earnings where ride_id = v_row.ride_id;
  if found and v_earning.commission_amount > 0 then
    select count(*) into v_existing_adj
      from public.driver_debt_adjustments
      where card_payment_id = v_row.id;
    if v_existing_adj = 0 then
      insert into public.driver_debt_adjustments
        (driver_id, dispute_id, amount_fcfa, reason, created_by, card_payment_id)
      values
        (v_row.driver_id, null, -v_earning.commission_amount,
         'Commission prélevée automatiquement — paiement par carte (course ' || v_row.ride_id || ').',
         v_row.driver_id, v_row.id);
    end if;
  elsif not found then
    insert into public.audit_log (actor_id, event, ride_id, details)
      values (v_row.driver_id, 'card_capture_without_earnings', v_row.ride_id,
              jsonb_build_object('intent', p_intent_id,
                'note', 'Capture carte sans gains clôturés — ajustement de dette à vérifier par l’admin.'));
  end if;

  insert into public.audit_log (actor_id, event, ride_id, details)
    values (v_row.driver_id, 'card_captured', v_row.ride_id,
            jsonb_build_object('charged', v_row.charged_fcfa,
              'fare', v_row.fare_fcfa, 'stripe_fee', p_stripe_fee));
  return jsonb_build_object('ok', true, 'status', 'captured');
end;
$$;

-- ---------- 6.5 Échec de capture ----------
-- La course a eu lieu, la capture a échoué : le chauffeur n'est
-- PAS pénalisé — sa part part dans le lot quotidien, financée
-- par la plateforme (source 'plateforme', à recouvrer ensuite).
create or replace function public.record_card_capture_failed(
  p_intent_id text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_payments%rowtype;
begin
  select * into v_row from public.card_payments
    where payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Paiement carte introuvable.');
  end if;
  if v_row.status = 'capture_failed' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'capture_failed');
  end if;
  if v_row.status = 'captured' then
    return jsonb_build_object('ok', false, 'error', 'Paiement déjà encaissé.');
  end if;
  update public.card_payments
    set status = 'capture_failed', updated_at = now()
    where id = v_row.id;
  insert into public.audit_log (actor_id, event, ride_id, details)
    values (v_row.driver_id, 'card_capture_failed', v_row.ride_id,
            jsonb_build_object('reason', coalesce(p_reason, 'inconnue'),
              'charged', v_row.charged_fcfa));
  return jsonb_build_object('ok', true, 'status', 'capture_failed');
end;
$$;

-- ---------- 6.6 Caution chauffeur : enregistrement du paiement ----------
create or replace function public.record_card_deposit(
  p_driver_id uuid,
  p_intent_id text,
  p_amount int,
  p_fees int,
  p_charged int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.card_deposits%rowtype;
begin
  if auth.uid() is null or auth.uid() <> p_driver_id then
    return jsonb_build_object('ok', false, 'error', 'Non autorisé.');
  end if;
  select * into v_existing from public.card_deposits where driver_id = p_driver_id;
  if found then
    if v_existing.status = 'paye' then
      return jsonb_build_object('ok', false, 'error', 'Caution déjà versée.');
    end if;
    if v_existing.status in ('rembourse', 'rembourse_partiel', 'confisque') then
      return jsonb_build_object('ok', false, 'error', 'Caution déjà clôturée — contacte Stacks Drive.');
    end if;
    update public.card_deposits
      set payment_intent_id = p_intent_id,
          amount_fcfa = p_amount, fees_fcfa = p_fees, charged_fcfa = p_charged,
          updated_at = now()
      where id = v_existing.id;
    return jsonb_build_object('ok', true, 'already', true, 'intent_id', p_intent_id);
  end if;
  insert into public.card_deposits
    (driver_id, payment_intent_id, amount_fcfa, fees_fcfa, charged_fcfa, status)
  values (p_driver_id, p_intent_id, p_amount, p_fees, p_charged, 'en_attente');
  return jsonb_build_object('ok', true, 'already', false, 'intent_id', p_intent_id);
end;
$$;

-- ---------- 6.7 Caution chauffeur : confirmation (webhook) ----------
create or replace function public.confirm_card_deposit(p_intent_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_deposits%rowtype;
begin
  select * into v_row from public.card_deposits
    where payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Caution introuvable.');
  end if;
  if v_row.status = 'paye' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'paye');
  end if;
  if v_row.status <> 'en_attente' then
    return jsonb_build_object('ok', false, 'error', 'Caution dans un état inattendu : ' || v_row.status);
  end if;
  update public.card_deposits
    set status = 'paye', updated_at = now()
    where id = v_row.id;
  update public.profiles
    set deposit_paid = true,
        deposit_amount = v_row.amount_fcfa,
        deposit_paid_at = now()
    where id = v_row.driver_id;
  insert into public.audit_log (actor_id, event, details)
    values (v_row.driver_id, 'card_deposit_paid',
            jsonb_build_object('amount', v_row.amount_fcfa, 'charged', v_row.charged_fcfa));
  return jsonb_build_object('ok', true, 'status', 'paye');
end;
$$;

-- ---------- 6.7bis Caution : claim atomique du remboursement ----------
-- Le remboursement d'une caution a TROIS déclencheurs possibles :
-- le départ du chauffeur (POST /api/driver/leave), la route
-- manuelle (POST /api/stripe/deposit/refund) et le cron quotidien.
-- Deux déclencheurs concurrents (départ + cron le même matin,
-- par exemple) ne doivent JAMAIS créer deux remboursements
-- Stripe. Cette fonction est le verrou : un seul appelant
-- bascule la caution de 'paye' à 'remboursement_en_cours'
-- (UPDATE atomique — un seul gagne), les autres s'arrêtent
-- AVANT tout appel à l'API Stripe. Un claim bloqué depuis plus
-- de 15 minutes (crash entre le claim et l'appel Stripe, ou
-- appel Stripe en échec réseau après création) peut être
-- repris : l'appel Stripe porte la clé d'idempotence
-- `deposit-refund-{driverId}`, donc la reprise ne crée pas de
-- second remboursement — Stripe rejoue le premier.
create or replace function public.claim_deposit_refund(p_driver_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_deposits%rowtype;
  v_is_admin boolean;
begin
  if auth.uid() is not null then
    select coalesce(is_admin, false) into v_is_admin
      from public.profiles where id = auth.uid();
    if auth.uid() <> p_driver_id and not coalesce(v_is_admin, false) then
      return jsonb_build_object('ok', false, 'error', 'Non autorisé.');
    end if;
  end if;
  update public.card_deposits
    set status = 'remboursement_en_cours', updated_at = now()
    where driver_id = p_driver_id
      and (status = 'paye'
        or (status = 'remboursement_en_cours'
          and updated_at < now() - interval '15 minutes'))
    returning * into v_row;
  if found then
    return jsonb_build_object('ok', true, 'claimed', true,
      'intent_id', v_row.payment_intent_id,
      'amount', v_row.amount_fcfa,
      'status', 'remboursement_en_cours');
  end if;
  select * into v_row from public.card_deposits where driver_id = p_driver_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Caution introuvable.');
  end if;
  if v_row.status = 'remboursement_en_cours' then
    return jsonb_build_object('ok', false, 'error', 'already_claimed',
      'status', 'remboursement_en_cours');
  end if;
  return jsonb_build_object('ok', true, 'already', true, 'status', v_row.status);
end;
$$;

-- ---------- 6.8 Caution : enregistrement du remboursement ----------
-- p_amount = montant réellement remboursé sur la carte (0 si la
-- dette absorbe toute la caution). p_note = motif lisible.
create or replace function public.record_deposit_refund(
  p_intent_id text,
  p_refund_id text,
  p_amount int,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_deposits%rowtype;
begin
  select * into v_row from public.card_deposits
    where payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Caution introuvable.');
  end if;
  if v_row.status in ('rembourse', 'rembourse_partiel', 'confisque') then
    return jsonb_build_object('ok', true, 'already', true, 'status', v_row.status);
  end if;
  -- La caution arrive ici 'paye' (ancien flux) ou
  -- 'remboursement_en_cours' (flux avec claim atomique, §6.7bis) :
  -- tout autre état refuse l'enregistrement.
  if v_row.status not in ('paye', 'remboursement_en_cours') then
    return jsonb_build_object('ok', false, 'error', 'Caution non versée — remboursement impossible.');
  end if;
  update public.card_deposits
    set status = case when p_amount >= v_row.amount_fcfa then 'rembourse' else 'rembourse_partiel' end,
        refund_id = p_refund_id,
        refund_amount_fcfa = p_amount,
        refund_note = p_note,
        refunded_at = now(),
        updated_at = now()
    where id = v_row.id;
  update public.profiles
    set deposit_paid = false
    where id = v_row.driver_id;
  -- Dette absorbée par la caution : la part de la caution qui ne
  -- revient pas au chauffeur SOLDE sa dette (ajustement négatif),
  -- sinon la dette resterait due après son départ.
  if p_amount < v_row.amount_fcfa then
    insert into public.driver_debt_adjustments
      (driver_id, dispute_id, amount_fcfa, reason, created_by)
    values
      (v_row.driver_id, null, -(v_row.amount_fcfa - p_amount),
       'Dette de commission soldée avec la caution au départ du chauffeur.',
       v_row.driver_id);
  end if;
  insert into public.audit_log (actor_id, event, details)
    values (v_row.driver_id, 'card_deposit_refunded',
            jsonb_build_object('amount', p_amount, 'refund', p_refund_id,
              'note', p_note));
  return jsonb_build_object('ok', true, 'status',
    case when p_amount >= v_row.amount_fcfa then 'rembourse' else 'rembourse_partiel' end);
end;
$$;

-- ---------- 6.9 Caution : confiscation (admin, fraude confirmée) ----------
-- Seule la confiscation pour FRAUDE CONFIRMÉE est prévue ici.
-- La dette impayée, elle, est DÉDUITE du remboursement (route API),
-- pas confisquée.
create or replace function public.forfeit_card_deposit(
  p_driver_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_deposits%rowtype;
  v_is_admin boolean;
begin
  select coalesce(is_admin, false) into v_is_admin
    from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Réservé à l’admin.');
  end if;
  select * into v_row from public.card_deposits where driver_id = p_driver_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Caution introuvable.');
  end if;
  if v_row.status in ('rembourse', 'rembourse_partiel', 'confisque') then
    return jsonb_build_object('ok', true, 'already', true, 'status', v_row.status);
  end if;
  if v_row.status = 'remboursement_en_cours' then
    return jsonb_build_object('ok', false, 'error', 'Remboursement déjà en cours — confiscation impossible pour le moment.');
  end if;
  if v_row.status <> 'paye' then
    return jsonb_build_object('ok', false, 'error', 'Caution non versée — confiscation impossible.');
  end if;
  update public.card_deposits
    set status = 'confisque',
        refund_amount_fcfa = 0,
        refund_note = p_reason,
        refunded_at = now(),
        updated_at = now()
    where id = v_row.id;
  update public.profiles
    set deposit_paid = false
    where id = v_row.driver_id;
  insert into public.audit_log (actor_id, event, details)
    values (v_row.driver_id, 'card_deposit_forfeited',
            jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true, 'status', 'confisque');
end;
$$;

-- ---------- 6.10 Remboursement de dette par carte : enregistrement ----------
create or replace function public.record_card_debt_payment(
  p_driver_id uuid,
  p_intent_id text,
  p_amount int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() <> p_driver_id then
    return jsonb_build_object('ok', false, 'error', 'Non autorisé.');
  end if;
  insert into public.card_debt_payments
    (driver_id, payment_intent_id, amount_fcfa, status)
  values (p_driver_id, p_intent_id, p_amount, 'en_attente')
  on conflict (payment_intent_id) do nothing;
  return jsonb_build_object('ok', true, 'intent_id', p_intent_id);
end;
$$;

-- ---------- 6.11 Remboursement de dette : application (webhook) ----------
-- Le paiement confirmé devient un règlement (driver_settlements,
-- méthode 'carte') : la dette baisse immédiatement, sans action
-- admin. Idempotent via le statut.
create or replace function public.apply_card_debt_payment(p_intent_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.card_debt_payments%rowtype;
  v_settlement_id uuid;
begin
  select * into v_row from public.card_debt_payments
    where payment_intent_id = p_intent_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Paiement de dette introuvable.');
  end if;
  if v_row.status = 'confirme' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'confirme');
  end if;
  if v_row.status <> 'en_attente' then
    return jsonb_build_object('ok', false, 'error', 'Paiement dans un état inattendu : ' || v_row.status);
  end if;
  insert into public.driver_settlements
    (driver_id, amount, method, note, recorded_by)
  values
    (v_row.driver_id, v_row.amount_fcfa, 'carte',
     'Remboursement de dette par carte (v2.55).', v_row.driver_id)
  returning id into v_settlement_id;
  update public.card_debt_payments
    set status = 'confirme', settlement_id = v_settlement_id, updated_at = now()
    where id = v_row.id;
  insert into public.audit_log (actor_id, event, details)
    values (v_row.driver_id, 'card_debt_paid',
            jsonb_build_object('amount', v_row.amount_fcfa,
              'settlement', v_settlement_id));
  return jsonb_build_object('ok', true, 'status', 'confirme',
    'settlement_id', v_settlement_id);
end;
$$;

-- ---------- 6.12 Cautions à rembourser (cron quotidien) ----------
-- Chauffeurs partis (driver_left_at renseigné) dont la caution
-- est encore 'paye' : le cron appelle ensuite l'API Refunds de
-- Stripe pour chacun, puis record_deposit_refund. Les cautions
-- en 'remboursement_en_cours' depuis plus de 15 minutes sont
-- aussi reprises (claim bloqué : crash ou échec réseau entre le
-- claim et l'appel Stripe — la reprise est sans danger grâce à
-- la clé d'idempotence Stripe, §6.7bis).
create or replace function public.list_refundable_deposits()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'driver_id', d.driver_id,
    'intent_id', d.payment_intent_id,
    'amount', d.amount_fcfa
  )), '[]'::jsonb) into v_rows
  from public.card_deposits d
  join public.profiles p on p.id = d.driver_id
  where (d.status = 'paye'
      or (d.status = 'remboursement_en_cours'
        and d.updated_at < now() - interval '15 minutes'))
    and p.driver_left_at is not null;
  return jsonb_build_object('ok', true, 'deposits', v_rows);
end;
$$;

-- ---------- 6.13 Lots de versement quotidiens (cron) ----------
-- Pour une date (Libreville, period_day des gains) : un lot par
-- chauffeur, avec les courses éligibles de la veille :
--  - courses carte ENCAISSÉES (capture confirmée) : part chauffeur
--    payée depuis l'argent Stripe (source 'carte') ;
--  - courses OFFERTES fidélité (loyalty_free) : le passager a payé
--    0, la plateforme doit la part au chauffeur (source
--    'plateforme') ;
--  - captures carte EN ÉCHEC : la plateforme avance la part
--    (source 'plateforme', à recouvrer ensuite auprès du passager).
-- Les courses espèces / P2P ne sont PAS dans le lot : le chauffeur
-- a déjà l'argent en main (il ne doit que la commission).
-- Idempotent : une course ne rentre qu'une seule fois dans un lot.
create or replace function public.generate_daily_payout_batches(p_day date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver record;
  v_batch_id uuid;
  v_batches int := 0;
  v_rides int := 0;
  v_item record;
begin
  for v_driver in
    select distinct e.driver_id
    from public.driver_earnings e
    join public.rides r on r.id = e.ride_id
    left join public.card_payments cp on cp.ride_id = e.ride_id
    where e.period_day = p_day
      and r.status = 'terminee'
      and (
        (r.payment_method = 'carte' and cp.status = 'captured')
        or coalesce(r.loyalty_free, false)
        or (r.payment_method = 'carte' and cp.status = 'capture_failed')
      )
      and not exists (
        select 1 from public.daily_payout_items i where i.ride_id = e.ride_id
      )
  loop
    insert into public.daily_payout_batches
      (payout_date, driver_id, rides_count, fares_total_fcfa,
       driver_share_fcfa, platform_funded_fcfa, status, rail)
    values (p_day, v_driver.driver_id, 0, 0, 0, 0, 'pret_a_virer', 'manuel')
    on conflict (payout_date, driver_id) do nothing
    returning id into v_batch_id;

    if v_batch_id is null then
      select id into v_batch_id from public.daily_payout_batches
        where payout_date = p_day and driver_id = v_driver.driver_id;
    end if;

    for v_item in
      select e.ride_id, e.fare_amount, e.driver_kept_amount,
             case
               when coalesce(r.loyalty_free, false) then 'plateforme'
               when r.payment_method = 'carte' and cp.status = 'capture_failed' then 'plateforme'
               else 'carte'
             end as v_source,
             case
               when coalesce(r.loyalty_free, false) then e.driver_kept_amount
               when r.payment_method = 'carte' and cp.status = 'capture_failed' then e.driver_kept_amount
               else 0
             end as v_funded
      from public.driver_earnings e
      join public.rides r on r.id = e.ride_id
      left join public.card_payments cp on cp.ride_id = e.ride_id
      where e.period_day = p_day
        and e.driver_id = v_driver.driver_id
        and r.status = 'terminee'
        and (
          (r.payment_method = 'carte' and cp.status = 'captured')
          or coalesce(r.loyalty_free, false)
          or (r.payment_method = 'carte' and cp.status = 'capture_failed')
        )
        and not exists (
          select 1 from public.daily_payout_items i where i.ride_id = e.ride_id
        )
    loop
      insert into public.daily_payout_items
        (batch_id, ride_id, driver_share_fcfa, source)
      values (v_batch_id, v_item.ride_id, v_item.driver_kept_amount, v_item.v_source)
      on conflict (batch_id, ride_id) do nothing;
      v_rides := v_rides + 1;
    end loop;

    update public.daily_payout_batches b
      set rides_count = (select count(*) from public.daily_payout_items where batch_id = b.id),
          fares_total_fcfa = (
            select coalesce(sum(e.fare_amount), 0)
            from public.daily_payout_items i
            join public.driver_earnings e on e.ride_id = i.ride_id
            where i.batch_id = b.id),
          driver_share_fcfa = (
            select coalesce(sum(driver_share_fcfa), 0)
            from public.daily_payout_items where batch_id = b.id),
          platform_funded_fcfa = (
            select coalesce(sum(case when source = 'plateforme' then driver_share_fcfa else 0 end), 0)
            from public.daily_payout_items where batch_id = b.id)
      where b.id = v_batch_id;
    v_batches := v_batches + 1;
  end loop;

  return jsonb_build_object('ok', true, 'day', p_day,
    'batches', v_batches, 'rides', v_rides);
end;
$$;

-- ---------- 6.14 Marquer un lot comme viré (admin) ----------
create or replace function public.mark_daily_batch_paid(
  p_batch_id uuid,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_row public.daily_payout_batches%rowtype;
begin
  select coalesce(is_admin, false) into v_is_admin
    from public.profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Réservé à l’admin.');
  end if;
  select * into v_row from public.daily_payout_batches where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Lot introuvable.');
  end if;
  if v_row.status = 'vire' then
    return jsonb_build_object('ok', true, 'already', true, 'status', 'vire');
  end if;
  update public.daily_payout_batches
    set status = 'vire', paid_at = now(), reference = p_reference
    where id = v_row.id;
  insert into public.audit_log (actor_id, event, details)
    values (auth.uid(), 'daily_batch_paid',
            jsonb_build_object('batch', p_batch_id, 'driver', v_row.driver_id,
              'amount', v_row.driver_share_fcfa, 'reference', p_reference));
  return jsonb_build_object('ok', true, 'status', 'vire');
end;
$$;
