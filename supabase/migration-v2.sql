-- ============================================================
-- Stacks Drive v2 — Migration ADDITIVE (à exécuter UNE fois)
-- Dashboard Supabase > SQL Editor, après le déploiement de la v2.
-- Ne JAMAIS réexécuter schema.sql (v1, déjà en production).
--
-- Changements de modèle (correction de Randy, 13/11/2026) :
-- - Les chauffeurs ne publient RIEN : ils se mettent en ligne et
--   PROPOSENT un prix sur les demandes des passagers (modèle Uber).
-- - La table `rides` devient des DEMANDES créées par le passager
--   (pickup, destination, type, prix estimé, statut recherche →
--   propositions → acceptée → en cours → terminée / annulée).
-- - Nouvelle table `ride_proposals` (propositions : prix, places,
--   premier arrêt, expiration 60 s).
-- - La table `bookings` disparaît (remplacée par demandes + propositions).
-- - Vérification chauffeur obligatoire : selfie + pièce d'identité
--   (bucket privé `driver-documents`), statuts non_verifié →
--   en_attente → verifie / refuse.
-- - Fidélité : 10e course offerte (colonne loyalty_free).
-- - Partage de course en direct : jeton public share_token.
-- ============================================================

-- ---------- 1. Profils : vérification + position ----------
alter table public.profiles
  add column if not exists verification_status text not null default 'non_verifie'
    check (verification_status in ('non_verifie', 'en_attente', 'verifie', 'refuse')),
  add column if not exists selfie_url text,
  add column if not exists id_document_url text,
  add column if not exists id_document_type text
    check (id_document_type is null or id_document_type in ('cni', 'passeport', 'permis')),
  add column if not exists verification_note text,
  add column if not exists current_area text,
  add column if not exists last_lat double precision,
  add column if not exists last_lng double precision;

-- Les chauffeurs déjà vérifiés en v1 (badge is_verified) gardent leur
-- statut : on l'aligne sur verification_status.
update public.profiles
  set verification_status = 'verifie'
  where is_verified = true and verification_status = 'non_verifie';

create index if not exists profiles_verification_status_idx
  on public.profiles (verification_status);

-- ---------- 2. Demandes : supprimer les anciennes courses démo ----------
-- Les 6 courses démo v1 deviennent 6 CHAUFFEURS démo statiques dans le
-- code (lib/demo-drivers.ts) : elles n'ont plus leur place en base.
delete from public.rides where is_demo = true;

-- ---------- 3. Table rides : requalification en demandes ----------
-- 3a. Anciennes contraintes : on les retire AVANT de changer les valeurs.
alter table public.rides drop constraint if exists rides_status_check;
alter table public.rides drop constraint if exists rides_ride_type_check;
alter table public.rides drop constraint if exists rides_vehicle_type_check;

-- 3b. Valeurs restantes (s'il en existe) ramenées dans le nouveau modèle.
update public.rides set status = 'annulee'
  where status not in ('recherche', 'propositions', 'acceptee', 'en_cours', 'terminee', 'annulee');
update public.rides set ride_type = 'groupe' where ride_type = 'partagee';

-- 3c. Renommages.
alter table public.rides rename column departure to pickup;
alter table public.rides rename column price to estimated_price;
alter table public.rides rename column note to message;
alter table public.rides rename column vehicle_type to vehicle_preference;

-- 3d. Colonnes de l'ancien modèle supprimées.
alter table public.rides
  drop column if exists seats_total,
  drop column if exists seats_available,
  drop column if exists vehicle_label,
  drop column if exists driver_name,
  drop column if exists driver_phone,
  drop column if exists is_demo,
  drop column if exists payment_methods;

-- 3e. Préférence de véhicule : les anciennes valeurs (Berline, SUV…)
-- deviennent « tous » (indifférent).
update public.rides set vehicle_preference = 'tous';
alter table public.rides
  add constraint rides_vehicle_preference_check
    check (vehicle_preference in ('voiture', 'moto', 'tous'));

-- 3f. Nouveaux statuts et types.
alter table public.rides
  add constraint rides_status_check
    check (status in ('recherche', 'propositions', 'acceptee', 'en_cours', 'terminee', 'annulee')),
  add constraint rides_ride_type_check
    check (ride_type in ('solo', 'groupe'));

-- 3g. Nouvelles colonnes.
alter table public.rides
  add column if not exists passenger_id uuid references public.profiles (id) on delete cascade,
  add column if not exists proposed_price int check (proposed_price is null or proposed_price > 0),
  add column if not exists first_stop text,
  add column if not exists platform_fee int not null default 0 check (platform_fee >= 0),
  add column if not exists driver_share int not null default 0 check (driver_share >= 0),
  add column if not exists rating_driver int check (rating_driver is null or (rating_driver between 1 and 5)),
  add column if not exists rating_passenger int check (rating_passenger is null or (rating_passenger between 1 and 5)),
  add column if not exists loyalty_free boolean not null default false,
  add column if not exists share_token uuid not null default gen_random_uuid(),
  add column if not exists cancelled_by text,
  add column if not exists cancel_reason text,
  add column if not exists payment_method text not null default 'especes'
    check (payment_method in ('especes', 'airtel', 'moov')),
  add column if not exists seats int not null default 1 check (seats between 1 and 4);

create index if not exists rides_status_created_idx on public.rides (status, created_at);
create index if not exists rides_passenger_idx on public.rides (passenger_id, created_at);
create index if not exists rides_driver_idx on public.rides (driver_id, created_at);

-- ---------- 4. Suppression du concept « bookings » ----------
drop table if exists public.bookings cascade;
drop function if exists public.sync_ride_seats() cascade;

-- ---------- 5. Table ride_proposals ----------
create table if not exists public.ride_proposals (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  driver_id uuid not null references public.profiles (id) on delete cascade,
  proposed_price int not null check (proposed_price > 0),
  seats_left int not null check (seats_left between 1 and 9),
  first_stop text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (ride_id, driver_id)
);

create index if not exists ride_proposals_ride_idx on public.ride_proposals (ride_id, status);
create index if not exists ride_proposals_driver_idx on public.ride_proposals (driver_id, created_at);

alter table public.ride_proposals enable row level security;

-- ---------- 6. Expiration des propositions (60 s) ----------
-- Appelée par l'API à chaque lecture : les propositions expirées passent
-- à « expired » et les demandes sans proposition en attente repassent
-- en « recherche » (nouveau cycle de propositions).
create or replace function public.expire_proposals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ride_proposals
    set status = 'expired'
    where status = 'pending' and expires_at < now();
  update public.rides
    set status = 'recherche'
    where status = 'propositions'
      and not exists (
        select 1 from public.ride_proposals p
        where p.ride_id = rides.id and p.status = 'pending'
      );
end;
$$;

grant execute on function public.expire_proposals() to authenticated;

-- ---------- 7. Lecture publique d'une course partagée (/suivi/[token]) ----------
-- SECURITY DEFINER : contourne la RLS pour UNE course désignée par son
-- jeton, sans exposer les autres courses ni les données privées.
create or replace function public.get_public_ride(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ride', row_to_json(r),
    'driver', case when d.id is null then null else row_to_json(d) end
  )
  from public.rides r
  left join public.profiles d on d.id = r.driver_id
  where r.share_token = p_token;
$$;

grant execute on function public.get_public_ride(uuid) to anon, authenticated;

-- ---------- 8. Badge « vérifié » synchronisé avec verification_status ----------
create or replace function public.sync_verified_flag()
returns trigger
language plpgsql
as $$
begin
  if new.verification_status = 'verifie' then
    new.is_verified := true;
  elsif new.verification_status in ('non_verifie', 'en_attente', 'refuse') then
    new.is_verified := false;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_verified_flag on public.profiles;
create trigger profiles_sync_verified_flag
  before update on public.profiles
  for each row execute function public.sync_verified_flag();

-- ---------- 9. Anti-escalade (remplace la fonction v1) ----------
-- Un non-admin ne peut pas toucher à is_verified / is_admin.
-- Le propriétaire peut seulement passer SA vérification à « en_attente »
-- (envoi de ses documents) quand elle est « non_verifie » ou « refuse ».
-- L'admin peut tout modifier (vérifier / refuser).
create or replace function public.prevent_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_is_admin boolean;
begin
  if auth.uid() is null then
    return new; -- SQL direct (nomination du premier admin).
  end if;
  select p.is_admin into caller_is_admin
    from public.profiles p where p.id = auth.uid();
  if coalesce(caller_is_admin, false) is true then
    return new; -- Admin : tout est permis.
  end if;
  if new.is_verified is distinct from old.is_verified
     or new.is_admin is distinct from old.is_admin then
    raise exception 'Seul un administrateur peut modifier la vérification ou le rôle admin.';
  end if;
  if new.verification_status is distinct from old.verification_status then
    if auth.uid() = old.id
       and new.verification_status = 'en_attente'
       and old.verification_status in ('non_verifie', 'refuse') then
      return new; -- Envoi de documents par le chauffeur lui-même.
    end if;
    raise exception 'Seul un administrateur peut modifier le statut de vérification.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_privilege_escalation();

-- ---------- 10. RLS : rides (demandes) ----------
drop policy if exists "Published rides are publicly readable" on public.rides;
drop policy if exists "Drivers publish rides" on public.rides;
drop policy if exists "Drivers manage their own rides" on public.rides;
drop policy if exists "Drivers delete their own rides" on public.rides;

drop policy if exists "Passengers create ride requests" on public.rides;
create policy "Passengers create ride requests"
  on public.rides for insert
  with check (
    auth.uid() = passenger_id
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'passager')
  );

drop policy if exists "Ride requests readable" on public.rides;
create policy "Ride requests readable"
  on public.rides for select
  using (
    auth.uid() = passenger_id
    or auth.uid() = driver_id
    or (
      status in ('recherche', 'propositions')
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'chauffeur' and is_verified = true
      )
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "Passengers manage their requests" on public.rides;
create policy "Passengers manage their requests"
  on public.rides for update
  using (auth.uid() = passenger_id and status in ('recherche', 'propositions', 'acceptee'))
  with check (
    auth.uid() = passenger_id
    and (
      status = 'annulee'
      or (status = 'acceptee' and driver_id is not null)
    )
  );

drop policy if exists "Drivers mark requests as proposed" on public.rides;
create policy "Drivers mark requests as proposed"
  on public.rides for update
  using (
    status = 'recherche'
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'chauffeur'
        and is_verified = true and is_online = true
    )
  )
  with check (status = 'propositions');

drop policy if exists "Drivers update their assigned rides" on public.rides;
create policy "Drivers update their assigned rides"
  on public.rides for update
  using (auth.uid() = driver_id)
  with check (status in ('en_cours', 'terminee'));

drop policy if exists "Passengers and drivers rate completed rides" on public.rides;
create policy "Passengers and drivers rate completed rides"
  on public.rides for update
  using (
    (auth.uid() = passenger_id or auth.uid() = driver_id)
    and status = 'terminee'
  )
  with check (status = 'terminee');

drop policy if exists "Admins manage all rides" on public.rides;
create policy "Admins manage all rides"
  on public.rides for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Admins delete rides" on public.rides;
create policy "Admins delete rides"
  on public.rides for delete
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- ---------- 11. RLS : ride_proposals ----------
drop policy if exists "Drivers propose on requests" on public.ride_proposals;
create policy "Drivers propose on requests"
  on public.ride_proposals for insert
  with check (
    auth.uid() = driver_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'chauffeur'
        and is_verified = true and is_online = true
    )
    and exists (
      select 1 from public.rides r
      where r.id = ride_id and r.status in ('recherche', 'propositions')
    )
  );

drop policy if exists "Proposals readable" on public.ride_proposals;
create policy "Proposals readable"
  on public.ride_proposals for select
  using (
    auth.uid() = driver_id
    or exists (
      select 1 from public.rides r
      where r.id = ride_proposals.ride_id and r.passenger_id = auth.uid()
    )
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "Passengers decide proposals" on public.ride_proposals;
create policy "Passengers decide proposals"
  on public.ride_proposals for update
  using (
    exists (
      select 1 from public.rides r
      where r.id = ride_proposals.ride_id and r.passenger_id = auth.uid()
    )
  )
  with check (status in ('accepted', 'declined'));

-- ---------- 12. Storage : bucket privé driver-documents ----------
insert into storage.buckets (id, name, public)
  values ('driver-documents', 'driver-documents', false)
  on conflict (id) do nothing;

drop policy if exists "Drivers upload their own documents" on storage.objects;
create policy "Drivers upload their own documents"
  on storage.objects for insert
  with check (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owners and admins read driver documents" on storage.objects;
create policy "Owners and admins read driver documents"
  on storage.objects for select
  using (
    bucket_id = 'driver-documents'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    )
  );

drop policy if exists "Owners update their own documents" on storage.objects;
create policy "Owners update their own documents"
  on storage.objects for update
  using (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owners delete their own documents" on storage.objects;
create policy "Owners delete their own documents"
  on storage.objects for delete
  using (
    bucket_id = 'driver-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Fin de la migration v2. Vérifications rapides :
-- select count(*) from public.rides;                    -- 0 (démos supprimées)
-- select count(*) from public.ride_proposals;           -- 0
-- select * from storage.buckets where id = 'driver-documents'; -- 1 ligne, public = false
-- select proname from pg_proc where proname in ('expire_proposals', 'get_public_ride');
-- ============================================================
