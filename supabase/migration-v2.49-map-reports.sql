-- ============================================================
-- Stacks Drive — migration v2.49b : signalements « erreurs de carte »
-- À EXÉCUTER UNE SEULE FOIS, dans le SQL Editor Supabase
-- (projet stacks-drive), APRÈS approbation de Randy.
-- Sans elle, le code reste résilient : la route /api/map-reports
-- répond 503 « base pas à jour » et le formulaire est désactivé.
-- ============================================================

create table if not exists public.map_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id),
  kind text not null check (kind in ('lieu_manquant', 'quartier_mal_place', 'erreur_adresse', 'autre')),
  title text not null,
  details text not null,
  status text not null default 'ouvert' check (status in ('ouvert', 'en_cours', 'resolu', 'rejete')),
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists map_reports_open_idx
  on public.map_reports (status, created_at desc)
  where status = 'ouvert';

create index if not exists map_reports_user_idx
  on public.map_reports (user_id, created_at desc);

alter table public.map_reports enable row level security;

-- Les admins gèrent tout (lecture + résolution).
drop policy if exists "Admins manage map reports" on public.map_reports;
create policy "Admins manage map reports"
  on public.map_reports for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- L'utilisateur connecté lit ses propres signalements.
drop policy if exists "Users read their own map reports" on public.map_reports;
create policy "Users read their own map reports"
  on public.map_reports for select
  using (user_id = auth.uid());

-- L'utilisateur connecté dépose un signalement.
drop policy if exists "Users file their own map reports" on public.map_reports;
create policy "Users file their own map reports"
  on public.map_reports for insert
  with check (user_id = auth.uid());
