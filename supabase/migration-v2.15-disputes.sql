-- Migration v2.15 — litiges in-app + règlements hebdo automatisés
-- + rapport hebdo (LOT A : « le seul travail que l’administrateur garde »).
--
-- À EXÉCUTER UNE FOIS dans le SQL Editor Supabase (projet stacks-drive),
-- AVANT le déploiement du code v2.15. Toutes les créations sont
-- additives et idempotentes (IF NOT EXISTS / ON CONFLICT DO NOTHING) :
-- réexécuter ce fichier est sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql / migration-v2.6.sql
-- / migration-v2.10.sql.
--
-- Modèle (v2.15) :
--   * Litiges (`disputes`) : passager ou chauffeur ouvre un litige depuis
--     sa course (motif, montant concerné, message libre). Statuts :
--     ouvert → en cours → résolu. Une seule partie ne peut ouvrir qu'un
--     seul litige par course (unique ride_id + opened_by_id).
--     RLS : seuls les deux parties de la course + l'admin peuvent lire ;
--     seul l'admin change le statut. AUCUN numéro de téléphone n'est
--     exposé : le dossier admin montre les noms, le trajet, le prix
--     accepté, les messages in-app, la dernière position connue et le
--     statut du code PIN — jamais les téléphones.
--   * Décisions (`dispute_decisions`) : l'admin tranche en ajustant la
--     dette et/ou la commission du chauffeur (montant + motif, tracé).
--     L'ajustement de dette est appliqué dans `driver_debt_adjustments`
--     (montant signé : négatif = le chauffeur doit moins) et pris en
--     compte dans le « dû » partout (lib/earnings.ts). La commission
--     figée de la course n'est jamais réécrite : la décision est la
--     trace, l'ajustement est la correction.
--   * Relevés hebdo (`weekly_settlements`) : une ligne par chauffeur et
--     par semaine (lundi → dimanche, heure de Libreville), générée par
--     la route cron du lundi (`generate_weekly_settlements`, SECURITY
--     DEFINER — la route cron n'a pas de session utilisateur). Contenu :
--     courses de la semaine, commission due de la semaine, dette totale
--     au moment de la génération, dépôt. Le chauffeur déclare son
--     transfert dans `settlement_declarations` (« J'ai payé ») ; l'admin
--     valide en 1 clic → la déclaration devient un règlement classique
--     (`driver_settlements`) et la dette baisse. Une déclaration non
--     validée ne réduit JAMAIS la dette.
--   * Rapport hebdo (`weekly_reports`) : digest du lundi (courses,
--     revenu commission, nouveaux chauffeurs, litiges ouverts, alertes),
--     inséré par la route cron (`insert_weekly_report`, SECURITY
--     DEFINER) puis envoyé par e-mail à l'admin.
--
-- Les taux de commission ne sont PAS touchés ici (lib/commission.ts :
-- 5 % lancement, 8 % ensuite, plafond 10 %).

-- ---------- 1. Litiges ----------
create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  opened_by_id uuid not null references public.profiles (id) on delete cascade,
  opened_by_role text not null check (opened_by_role in ('passager', 'chauffeur')),
  reason text not null check (reason in (
    'prix', 'paiement', 'trajet', 'comportement', 'vehicule', 'annulation', 'autre'
  )),
  amount_concerned int check (amount_concerned is null or amount_concerned >= 0),
  message text not null check (char_length(message) between 2 and 1000),
  status text not null default 'ouvert' check (status in ('ouvert', 'en_cours', 'resolu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  -- Un seul litige par partie et par course.
  unique (ride_id, opened_by_id)
);

create index if not exists disputes_status_idx on public.disputes (status, created_at);
create index if not exists disputes_ride_idx on public.disputes (ride_id);

alter table public.disputes enable row level security;

-- Lecture : les deux parties de la course + l'admin.
drop policy if exists "Dispute parties and admins read disputes" on public.disputes;
create policy "Dispute parties and admins read disputes"
  on public.disputes for select
  using (
    auth.uid() = opened_by_id
    or exists (
      select 1 from public.rides r
      where r.id = disputes.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Ouverture : l'utilisateur connecté, partie de la course, qui ouvre
-- pour son propre compte.
drop policy if exists "Ride parties open disputes" on public.disputes;
create policy "Ride parties open disputes"
  on public.disputes for insert
  with check (
    auth.uid() = opened_by_id
    and exists (
      select 1 from public.rides r
      where r.id = disputes.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

-- Changement de statut : admin uniquement.
drop policy if exists "Admins update disputes" on public.disputes;
create policy "Admins update disputes"
  on public.disputes for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Pas de politique delete : un litige ne se supprime pas, il se résout.

-- ---------- 2. Décisions de litige (tracées) ----------
create table if not exists public.dispute_decisions (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  -- Ajustement de la dette du chauffeur (FCFA, signé : négatif = le
  -- chauffeur doit moins, positif = il doit plus). 0 = pas d'ajustement.
  debt_adjustment_fcfa int not null default 0,
  -- Ajustement de commission sur la course (FCFA, signé, pour la trace :
  -- la commission figée dans rides/driver_earnings n'est jamais réécrite).
  commission_adjustment_fcfa int not null default 0,
  reason text not null check (char_length(reason) between 2 and 500),
  created_at timestamptz not null default now()
);

create index if not exists dispute_decisions_dispute_idx
  on public.dispute_decisions (dispute_id, created_at);

alter table public.dispute_decisions enable row level security;

-- Lecture : admin + parties du litige (elles voient la décision).
drop policy if exists "Dispute parties and admins read decisions" on public.dispute_decisions;
create policy "Dispute parties and admins read decisions"
  on public.dispute_decisions for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    or exists (
      select 1 from public.disputes d
      join public.rides r on r.id = d.ride_id
      where d.id = dispute_decisions.dispute_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

-- Écriture : admin uniquement.
drop policy if exists "Admins record decisions" on public.dispute_decisions;
create policy "Admins record decisions"
  on public.dispute_decisions for insert
  with check (
    auth.uid() = admin_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Pas de politique update / delete : une décision est définitive et tracée.

-- ---------- 3. Ajustements de dette (application des décisions) ----------
create table if not exists public.driver_debt_adjustments (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  dispute_id uuid references public.disputes (id) on delete set null,
  -- Montant signé (FCFA) : négatif = le chauffeur doit moins,
  -- positif = il doit plus. Jamais 0.
  amount_fcfa int not null check (amount_fcfa <> 0),
  reason text not null check (char_length(reason) between 2 and 500),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists driver_debt_adjustments_driver_idx
  on public.driver_debt_adjustments (driver_id, created_at);

alter table public.driver_debt_adjustments enable row level security;

-- Lecture : le chauffeur concerné + l'admin.
drop policy if exists "Drivers and admins read debt adjustments" on public.driver_debt_adjustments;
create policy "Drivers and admins read debt adjustments"
  on public.driver_debt_adjustments for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Écriture : admin uniquement.
drop policy if exists "Admins record debt adjustments" on public.driver_debt_adjustments;
create policy "Admins record debt adjustments"
  on public.driver_debt_adjustments for insert
  with check (
    auth.uid() = created_by
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Pas de politique update / delete : un ajustement est définitif et tracé.

-- ---------- 4. Relevés hebdomadaires chauffeur ----------
create table if not exists public.weekly_settlements (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  week_start date not null, -- lundi (heure de Libreville)
  week_end date not null, -- dimanche
  rides_count int not null default 0 check (rides_count >= 0),
  fares_total int not null default 0 check (fares_total >= 0),
  -- Commission due sur les courses DE LA SEMAINE (FCFA).
  commission_due int not null default 0 check (commission_due >= 0),
  -- Dette totale du chauffeur au moment de la génération (FCFA).
  debt_total int not null default 0 check (debt_total >= 0),
  deposit_paid boolean not null default false,
  status text not null default 'genere'
    check (status in ('genere', 'declare', 'valide')),
  created_at timestamptz not null default now(),
  unique (driver_id, week_start)
);

create index if not exists weekly_settlements_week_idx
  on public.weekly_settlements (week_start, driver_id);

alter table public.weekly_settlements enable row level security;

-- Lecture : le chauffeur concerné + l'admin.
drop policy if exists "Drivers and admins read weekly settlements" on public.weekly_settlements;
create policy "Drivers and admins read weekly settlements"
  on public.weekly_settlements for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Le chauffeur marque son relevé comme déclaré (après « J'ai payé »).
drop policy if exists "Drivers mark their weekly settlement declared" on public.weekly_settlements;
create policy "Drivers mark their weekly settlement declared"
  on public.weekly_settlements for update
  using (auth.uid() = driver_id and status = 'genere')
  with check (auth.uid() = driver_id and status = 'declare');

-- L'admin marque un relevé comme validé (après validation de la déclaration).
drop policy if exists "Admins validate weekly settlements" on public.weekly_settlements;
create policy "Admins validate weekly settlements"
  on public.weekly_settlements for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Pas de politique insert : les relevés sont créés par la fonction
-- SECURITY DEFINER generate_weekly_settlements() (route cron du lundi).

-- ---------- 5. Déclarations de paiement chauffeur (« J'ai payé ») ----------
create table if not exists public.settlement_declarations (
  id uuid primary key default gen_random_uuid(),
  weekly_settlement_id uuid references public.weekly_settlements (id) on delete set null,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  amount int not null check (amount > 0),
  method text not null default 'mobile_money'
    check (method in ('mobile_money', 'especes', 'autre')),
  -- Référence libre du transfert (ex : n° de transaction Airtel/Moov).
  reference text check (reference is null or char_length(reference) <= 100),
  status text not null default 'declare'
    check (status in ('declare', 'valide', 'refuse')),
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by uuid references public.profiles (id) on delete set null
);

create index if not exists settlement_declarations_driver_idx
  on public.settlement_declarations (driver_id, created_at);
create index if not exists settlement_declarations_status_idx
  on public.settlement_declarations (status, created_at);

alter table public.settlement_declarations enable row level security;

-- Lecture : le chauffeur concerné + l'admin.
drop policy if exists "Drivers and admins read declarations" on public.settlement_declarations;
create policy "Drivers and admins read declarations"
  on public.settlement_declarations for select
  using (
    auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Déclaration : le chauffeur, pour son propre compte, sur un relevé qui
-- lui appartient (ou sans relevé — règlement libre).
drop policy if exists "Drivers declare their payment" on public.settlement_declarations;
create policy "Drivers declare their payment"
  on public.settlement_declarations for insert
  with check (
    auth.uid() = driver_id
    and (
      weekly_settlement_id is null
      or exists (
        select 1 from public.weekly_settlements w
        where w.id = settlement_declarations.weekly_settlement_id
          and w.driver_id = auth.uid()
      )
    )
  );

-- Validation / refus : admin uniquement.
drop policy if exists "Admins review declarations" on public.settlement_declarations;
create policy "Admins review declarations"
  on public.settlement_declarations for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Pas de politique delete : une déclaration refusée reste visible (trace).

-- ---------- 6. Rapports hebdomadaires ----------
create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  week_start date not null, -- lundi (heure de Libreville)
  week_end date not null, -- dimanche
  rides_count int not null default 0 check (rides_count >= 0),
  commission_total int not null default 0 check (commission_total >= 0),
  new_drivers int not null default 0 check (new_drivers >= 0),
  open_disputes int not null default 0 check (open_disputes >= 0),
  -- Alertes (jsonb) : chauffeurs au plafond, dettes anciennes,
  -- litiges ouverts depuis plus de 7 jours, etc.
  alerts jsonb not null default '[]'::jsonb,
  email_sent boolean not null default false,
  created_at timestamptz not null default now(),
  unique (week_start)
);

alter table public.weekly_reports enable row level security;

-- Lecture : admin uniquement.
drop policy if exists "Admins read weekly reports" on public.weekly_reports;
create policy "Admins read weekly reports"
  on public.weekly_reports for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- Pas de politique insert / update : écriture par les fonctions
-- SECURITY DEFINER insert_weekly_report() / mark_weekly_report_emailed()
-- (route cron du lundi).

-- ---------- 7. Fonctions SECURITY DEFINER (routes cron, sans session) ----------
-- La route cron Vercel n'a pas de session Supabase : ces fonctions
-- contournent la RLS (comme finalize_ride_earnings, verify_ride_pin).
-- Elles sont idempotentes et ne génèrent que pour des semaines TERMINÉES.

-- Génère le relevé d'une semaine terminée (un relevé par chauffeur ayant
-- fait au moins une course cette semaine). Retourne le nombre de relevés
-- créés (0 si la semaine n'est pas terminée ou déjà générée).
create or replace function public.generate_weekly_settlements(p_week_start date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_current_monday date := date_trunc('week', (now() at time zone 'Africa/Libreville'))::date;
  r record;
begin
  -- Semaine en cours ou future : on ne génère rien.
  if p_week_start >= v_current_monday then
    return 0;
  end if;

  for r in
    select e.driver_id,
           count(*)::int as rides_count,
           coalesce(sum(e.fare_amount), 0)::int as fares_total,
           coalesce(sum(e.commission_amount), 0)::int as commission_due
    from public.driver_earnings e
    where e.period_week = p_week_start::text
    group by e.driver_id
  loop
    insert into public.weekly_settlements
      (driver_id, week_start, week_end, rides_count, fares_total,
       commission_due, debt_total, deposit_paid, status)
    values (
      r.driver_id,
      p_week_start,
      p_week_start + 6,
      r.rides_count,
      r.fares_total,
      r.commission_due,
      greatest(0,
        coalesce((select sum(commission_amount) from public.driver_earnings where driver_id = r.driver_id), 0)
        - coalesce((select sum(amount) from public.driver_settlements where driver_id = r.driver_id), 0)
        + coalesce((select sum(amount_fcfa) from public.driver_debt_adjustments where driver_id = r.driver_id), 0)
      ),
      coalesce((select deposit_paid from public.profiles p where p.id = r.driver_id), false),
      'genere'
    )
    on conflict (driver_id, week_start) do nothing;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Enregistre (ou met à jour) le rapport hebdomadaire d'une semaine.
-- Retourne l'id du rapport.
create or replace function public.insert_weekly_report(
  p_week_start date,
  p_week_end date,
  p_rides int,
  p_commission int,
  p_new_drivers int,
  p_open_disputes int,
  p_alerts jsonb
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.weekly_reports
    (week_start, week_end, rides_count, commission_total, new_drivers, open_disputes, alerts, email_sent)
  values (p_week_start, p_week_end, p_rides, p_commission, p_new_drivers, p_open_disputes, p_alerts, false)
  on conflict (week_start) do update set
    week_end = excluded.week_end,
    rides_count = excluded.rides_count,
    commission_total = excluded.commission_total,
    new_drivers = excluded.new_drivers,
    open_disputes = excluded.open_disputes,
    alerts = excluded.alerts
  returning id;
$$;

-- Marque un rapport comme envoyé par e-mail (après l'envoi Resend).
create or replace function public.mark_weekly_report_emailed(p_report_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.weekly_reports set email_sent = true where id = p_report_id;
$$;
