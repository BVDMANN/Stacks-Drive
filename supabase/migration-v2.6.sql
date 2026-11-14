-- Migration v2.6 — quartiers à accès difficile (routes non bitumées)
-- + supplément forfaitaire.
--
-- À EXÉCUTER UNE FOIS dans le SQL Editor Supabase (projet stacks-drive),
-- AVANT le déploiement du code v2.6. Les colonnes sont ajoutées avec
-- IF NOT EXISTS : réexécuter ce fichier est sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql.
--
-- Modèle (v2.6) :
--   * un quartier à accès difficile a un point de dépôt (quartier
--     accessible sur route bitumée) — la course s'y arrête par défaut ;
--   * le passager peut demander la continuité sur route non bitumée
--     (rides.unpaved_requested) — le tarif estimé inclut alors le
--     supplément forfaitaire de 800 FCFA (UNPAVED_ROAD_SUPPLEMENT,
--     lib/pricing.ts) ;
--   * le chauffeur est libre d'accepter ou non la piste
--     (ride_proposals.unpaved_accepted, figé dans rides.unpaved_accepted
--     à l'acceptation) — s'il la refuse, la destination devient le point
--     de dépôt et le supplément est retiré du prix proposé.
-- La liste des quartiers difficiles vit dans lib/neighborhoods.ts
-- (ROAD_ACCESS / DROP_OFF_POINT) — pas en base.

-- Demande de course : le passager a-t-il demandé la route non bitumée ?
alter table public.rides
  add column if not exists unpaved_requested boolean not null default false;

-- Point de dépôt effectif quand la destination est à accès difficile
-- (nom de quartier, ex. 'PK8'). Null pour les destinations normales.
alter table public.rides
  add column if not exists drop_off_point text;

-- Choix du chauffeur, figé à l'acceptation (null tant que non acceptée).
alter table public.rides
  add column if not exists unpaved_accepted boolean;

-- Proposition du chauffeur : prend-il la piste (true) ou s'arrête-t-il
-- au point de dépôt (false) ? Défaut false = arrêt au point de dépôt.
alter table public.ride_proposals
  add column if not exists unpaved_accepted boolean not null default false;
