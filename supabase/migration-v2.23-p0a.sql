-- ============================================================
-- Stacks Drive v2.23 (P0a) — Plancher : annulation propre +
-- contacts de confiance (partage auto du suivi).
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.23. Le script est idempotent
-- (IF NOT EXISTS + CREATE OR REPLACE + DROP POLICY IF EXISTS) :
-- le relancer est sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql / migration-v2.6.sql /
-- migration-v2.10.sql / migration-v2.15-disputes.sql /
-- migration-v2.17-mode-rules.sql / migration-v2.19-seats.sql /
-- migration-v2.20-driver-privacy.sql.
-- ============================================================
--
-- 1. `ride_cancellations` — historique des annulations (motif).
--    Une ligne par annulation : qui a annulé, avec quel motif
--    (liste courte, voir lib/cancellations.ts), précision libre
--    éventuelle. La table `rides` garde déjà `cancelled_by` /
--    `cancel_reason` (texte lisible) : cette table est l'historique
--    structuré, qui sert la fiabilité (annulations comptées).
--    Le code reste résilient si la migration n'est pas appliquée :
--    l'annulation aboutit via `rides`, la fiabilité se calcule
--    depuis `rides` (terminées vs annulées).
--
-- 2. `trusted_contacts` — contacts de confiance du passager
--    (nom + téléphone, e-mail optionnel, 1 à 5 contacts). Au départ
--    de la course, le lien de suivi est envoyé automatiquement aux
--    contacts qui ont une adresse e-mail ; les autres sont joints en
--    1 tap (WhatsApp / SMS) depuis l'écran de course. Les contacts
--    ne sont visibles que par leur propriétaire (+ lecture admin).
--
-- RLS : chaque utilisateur ne voit que ses propres données ;
-- l'administrateur lit tout (politiques `is_admin`). Aucun numéro
-- de téléphone de chauffeur n'est stocké ici, aucun secret.
-- La règle 2 (v2.17) n'est pas touchée : ce fichier ne redéfinit
-- PAS le trigger anti-escalade.

-- ---------- 1. Historique des annulations ----------
create table if not exists public.ride_cancellations (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  cancelled_by_user_id uuid not null references public.profiles (id) on delete cascade,
  cancelled_by_role text not null check (cancelled_by_role in ('passager', 'chauffeur')),
  reason_code text not null,
  reason_detail text,
  created_at timestamptz not null default now()
);

create index if not exists ride_cancellations_ride_idx
  on public.ride_cancellations (ride_id);
create index if not exists ride_cancellations_user_idx
  on public.ride_cancellations (cancelled_by_user_id, created_at desc);

alter table public.ride_cancellations enable row level security;

drop policy if exists "ride_cancellations_select_own_or_admin" on public.ride_cancellations;
create policy "ride_cancellations_select_own_or_admin"
  on public.ride_cancellations for select
  using (
    cancelled_by_user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
    or exists (
      select 1 from public.rides r
      where r.id = ride_cancellations.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

drop policy if exists "ride_cancellations_insert_own" on public.ride_cancellations;
create policy "ride_cancellations_insert_own"
  on public.ride_cancellations for insert
  with check (cancelled_by_user_id = auth.uid());

-- ---------- 2. Contacts de confiance ----------
create table if not exists public.trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  phone text not null check (char_length(phone) between 8 and 30),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);

create index if not exists trusted_contacts_user_idx
  on public.trusted_contacts (user_id, created_at);

alter table public.trusted_contacts enable row level security;

drop policy if exists "trusted_contacts_own_all" on public.trusted_contacts;
create policy "trusted_contacts_own_all"
  on public.trusted_contacts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "trusted_contacts_admin_read" on public.trusted_contacts;
create policy "trusted_contacts_admin_read"
  on public.trusted_contacts for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_admin is true
    )
  );

-- ---------- Vérifications rapides (à lancer après exécution) ----------
-- Ces requêtes ne doivent rien retourner :
--   select count(*) from public.ride_cancellations
--     where cancelled_by_role not in ('passager', 'chauffeur');
-- (0 = aucun rôle d'annulation invalide.)
--   select user_id, count(*) from public.trusted_contacts
--     group by user_id having count(*) > 5;
-- (0 ligne = aucun passager avec plus de 5 contacts de confiance.)
