-- ============================================================
-- Stacks Drive — migration v2.49a : photo de profil passager
-- À EXÉCUTER UNE SEULE FOIS, dans le SQL Editor Supabase
-- (projet stacks-drive), APRÈS approbation de Randy.
-- Sans elle, le code reste résilient : la route /api/profile/photo
-- répond 503 « base pas à jour » et l'upload est refusé proprement.
-- ============================================================

-- Colonne photo (chemin dans le bucket privé passenger-photos).
alter table public.profiles
  add column if not exists photo_url text;

-- Bucket privé pour les photos de profil passager.
insert into storage.buckets (id, name, public)
  values ('passenger-photos', 'passenger-photos', false)
  on conflict (id) do nothing;

-- Le passager envoie sa propre photo (dossier = son id).
drop policy if exists "Passengers upload their own photo" on storage.objects;
create policy "Passengers upload their own photo"
  on storage.objects for insert
  with check (
    bucket_id = 'passenger-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Le passager lit sa propre photo ; l'admin la lit aussi.
drop policy if exists "Owners and admins read passenger photos" on storage.objects;
create policy "Owners and admins read passenger photos"
  on storage.objects for select
  using (
    bucket_id = 'passenger-photos'
    and (
      auth.uid()::text = (storage.foldername(name))[1]
      or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    )
  );

-- Le passager met à jour / supprime sa propre photo.
drop policy if exists "Owners update their own photo" on storage.objects;
create policy "Owners update their own photo"
  on storage.objects for update
  using (
    bucket_id = 'passenger-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'passenger-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owners delete their own photo" on storage.objects;
create policy "Owners delete their own photo"
  on storage.objects for delete
  using (
    bucket_id = 'passenger-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Le chauffeur assigné lit la photo du passager PENDANT la course
-- uniquement (statuts acceptee / en_cours). Dès la course terminée
-- ou annulée, la politique ne s'applique plus : la photo n'est
-- plus lisible par le chauffeur. Cohérent avec la règle v2.20
-- (identité visible seulement au matching / pendant la course).
-- La lecture passe par une URL signée (1 h) générée côté serveur
-- (route /api/rides/[id]/passenger-photo), jamais par un lien direct.
drop policy if exists "Assigned driver reads passenger photo during the ride" on storage.objects;
create policy "Assigned driver reads passenger photo during the ride"
  on storage.objects for select
  using (
    bucket_id = 'passenger-photos'
    and exists (
      select 1 from public.rides r
      where r.passenger_id = (storage.foldername(name))[1]::uuid
      and r.driver_id = auth.uid()
      and r.status in ('acceptee', 'en_cours')
    )
  );

-- La photo n'est JAMAIS lisible par les chauffeurs via une
-- politique de stockage : pendant une course, le chauffeur
-- assigné la reçoit par URL signée (1 h) générée côté serveur
-- (route /api/rides/[id]/photo — voir lib/rides.ts).
