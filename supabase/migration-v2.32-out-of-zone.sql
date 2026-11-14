-- ============================================================
-- Stacks Drive v2.32 — Écran hors zone : liste d'attente
-- « préviens-moi ».
--
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.32. Le script est idempotent
-- (IF NOT EXISTS + DROP POLICY IF EXISTS) : le relancer est
-- sans danger.
--
-- Contenu : UNE table, `area_waitlist` — les e-mails laissés sur
-- l'écran hors zone par les personnes hors de la zone de service
-- (Grand Libreville), avec leur consentement explicite et leur
-- ville / pays en best-effort. JAMAIS de coordonnées précises :
-- aucune colonne lat / lng / adresse — la route `POST
-- /api/notify-me` refuse tout champ de position, et l'écran ne
-- transmet que la ville et le pays du reverse-geocoding.
-- Un e-mail = une ligne (unicité insensible à la casse) : une
-- deuxième inscription renvoie un succès idempotent, pas un
-- doublon. Visible dans /admin (section « Demandes d'arrivée
-- dans une nouvelle zone »).
--
-- Sans cette migration, le code v2.32 reste résilient : l'écran
-- hors zone s'affiche et se ferme normalement, seule
-- l'inscription « préviens-moi » renvoie une erreur explicite
-- (503) — jamais une inscription silencieusement perdue.
--
-- Règles métier inchangées : commission 5 % / 8 % / plafond 10 %
-- (`lib/commission.ts` non touchée), prix côté serveur uniquement,
-- Groupe = 1 place, Solo = véhicule entier.
-- ============================================================

create table if not exists public.area_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- Ville / pays en best-effort (reverse-geocoding Nominatim) —
  -- null quand inconnus. Aucune coordonnée précise n'est stockée.
  city text,
  country text,
  -- Consentement explicite à être prévenu par e-mail (case à
  -- cocher sur l'écran hors zone, vérifiée côté serveur).
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

-- Un e-mail = une ligne (insensible à la casse).
create unique index if not exists area_waitlist_email_unique_idx
  on public.area_waitlist (lower(email));

create index if not exists area_waitlist_created_idx
  on public.area_waitlist (created_at desc);

-- ---------- RLS ----------
alter table public.area_waitlist enable row level security;

-- Inscription : n'importe quel visiteur (connecté ou non — l'écran
-- hors zone s'affiche aussi aux visiteurs), avec consentement
-- explicite uniquement. Aucune lecture publique : les e-mails ne
-- sont jamais exposés.
drop policy if exists area_waitlist_insert_anyone on public.area_waitlist;
create policy area_waitlist_insert_anyone on public.area_waitlist
  for insert with check (consent = true);

-- Lecture : administrateur uniquement (section /admin).
drop policy if exists area_waitlist_select_admin on public.area_waitlist;
create policy area_waitlist_select_admin on public.area_waitlist
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
