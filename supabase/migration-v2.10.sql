-- Migration v2.10 — messagerie de course + suivi chauffeur en direct
-- jusqu'au point de départ (pickup) + historique (aucune table
-- nouvelle : l'historique utilise rides + driver_earnings existantes).
--
-- À EXÉCUTER UNE FOIS dans le SQL Editor Supabase (projet stacks-drive),
-- AVANT le déploiement du code v2.10. Les tables sont créées avec
-- IF NOT EXISTS : réexécuter ce fichier est sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql / migration-v2.6.sql.
--
-- Modèle (v2.10) :
--   * Messagerie in-app (pas WhatsApp, pas de numéro affiché) :
--     ride_messages — un message appartient à une course, seuls son
--     passager et son chauffeur peuvent le lire / en envoyer. La
--     messagerie n'existe que pour la course en cours (statuts
--     'acceptee' / 'en_cours') : ce contrôle est fait côté API
--     (/api/rides/[id]/messages) ; les messages sont immuables
--     (aucune politique update / delete).
--   * Suivi chauffeur jusqu'au pickup : driver_locations — une seule
--     ligne par course (la dernière position connue). Le chauffeur ne
--     partage sa position que quand la course est 'acceptee' (entre
--     l'acceptation et la confirmation du pickup par le code PIN) ;
--     seul le passager de LA course peut la lire, et seulement pendant
--     ce créneau (le statut est vérifié dans la politique RLS elle-même).
--     Après le pickup (statut 'en_cours'), plus aucun partage, plus
--     aucune lecture : la position n'est JAMAIS visible hors course
--     acceptée. La ligne est supprimée avec la course (on delete
--     cascade).
--   * Historique : aucune migration — les pages /compte (passager) et
--     le tableau de bord chauffeur lisent rides (+ driver_earnings
--     pour les gains) via l'API / le serveur. Ni code PIN, ni position,
--     ni messages dans l'historique.

-- ---------- 1. Messages de course ----------
create table if not exists public.ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_role text not null check (sender_role in ('passager', 'chauffeur')),
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists ride_messages_ride_idx
  on public.ride_messages (ride_id, created_at);

alter table public.ride_messages enable row level security;

-- Lecture : passager et chauffeur de LA course, + admin.
drop policy if exists "Ride parties read messages" on public.ride_messages;
create policy "Ride parties read messages"
  on public.ride_messages for select
  using (
    exists (
      select 1 from public.rides r
      where r.id = ride_messages.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Écriture : l'expéditeur est l'utilisateur connecté ET une partie de
-- la course. Le contrôle « course en cours » est fait côté API.
drop policy if exists "Ride parties send messages" on public.ride_messages;
create policy "Ride parties send messages"
  on public.ride_messages for insert
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.rides r
      where r.id = ride_messages.ride_id
        and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

-- Pas de politique update / delete : un message envoyé ne se modifie
-- ni ne se supprime.

-- ---------- 2. Position en direct du chauffeur (jusqu'au pickup) ----------
create table if not exists public.driver_locations (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m int check (accuracy_m is null or accuracy_m >= 0),
  updated_at timestamptz not null default now()
);

alter table public.driver_locations enable row level security;

-- Lecture : le passager de LA course, uniquement quand la course est
-- acceptée (avant le pickup) ; le chauffeur relit sa propre position ;
-- l'admin voit tout. Dès que la course passe 'en_cours' (pickup
-- confirmé), la lecture passager est coupée par la RLS elle-même.
drop policy if exists "Ride passenger reads live location" on public.driver_locations;
create policy "Ride passenger reads live location"
  on public.driver_locations for select
  using (
    exists (
      select 1 from public.rides r
      where r.id = driver_locations.ride_id
        and r.passenger_id = auth.uid()
        and r.status = 'acceptee'
    )
    or auth.uid() = driver_id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- Écriture : le chauffeur de LA course, uniquement quand elle est
-- acceptée. Une seule ligne par course (upsert côté API).
drop policy if exists "Driver shares live location" on public.driver_locations;
create policy "Driver shares live location"
  on public.driver_locations for insert
  with check (
    auth.uid() = driver_id
    and exists (
      select 1 from public.rides r
      where r.id = driver_locations.ride_id
        and r.driver_id = auth.uid()
        and r.status = 'acceptee'
    )
  );

drop policy if exists "Driver updates live location" on public.driver_locations;
create policy "Driver updates live location"
  on public.driver_locations for update
  using (
    auth.uid() = driver_id
    and exists (
      select 1 from public.rides r
      where r.id = driver_locations.ride_id
        and r.driver_id = auth.uid()
        and r.status = 'acceptee'
    )
  )
  with check (
    auth.uid() = driver_id
    and exists (
      select 1 from public.rides r
      where r.id = driver_locations.ride_id
        and r.driver_id = auth.uid()
        and r.status = 'acceptee'
    )
  );

-- Pas de politique delete : la ligne disparaît avec la course
-- (on delete cascade).

-- ---------- 4. Prix convenu entre passager et chauffeur (v2.11) ----------
-- Modèle exact (décision de Randy, 14/11/2026) : le passager voit une
-- estimation indicative avant la course (calculée côté serveur, jamais
-- un prix fixe) ; le prix final se décide entre les deux parties —
-- le chauffeur propose, le passager peut proposer son prix à la demande
-- et contre-proposer sur une proposition — puis il est figé à
-- l'acceptation. Aucun tarif fixe défini par la plateforme.
--
-- Les deux colonnes sont NULLABLES et le code se replie proprement si
-- elles manquent (l'API réessaie sans elles, comme pour les champs
-- v2.6) : la migration peut être appliquée après le déploiement du
-- code sans casser les demandes en cours.

-- Prix proposé directement par le passager à la demande (optionnel).
alter table public.rides
  add column if not exists passenger_offered_price integer null;

-- Contre-proposition du passager sur une proposition chauffeur
-- (null = pas de contre-proposition).
alter table public.ride_proposals
  add column if not exists counter_price integer null;
