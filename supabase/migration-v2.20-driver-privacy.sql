-- ============================================================
-- Stacks Drive v2.20 — Confidentialité chauffeur (lien de suivi public).
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.20. Le script est idempotent
-- (CREATE OR REPLACE) : le relancer est sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql / migration-v2.6.sql /
-- migration-v2.10.sql / migration-v2.15-disputes.sql /
-- migration-v2.17-mode-rules.sql / migration-v2.19-seats.sql.
-- ============================================================
--
-- Problème : `get_public_ride` (migration-v2.sql) renvoyait la ligne
-- `profiles` ENTIÈRE du chauffeur (`row_to_json(d)`) à quiconque
-- possède le lien de suivi public — y compris son téléphone, son
-- e-mail, son selfie de vérification et sa pièce d'identité. La page
-- /suivi/[token] n'affichait pas ces champs, mais ils étaient dans la
-- réponse de l'API, lisibles par n'importe qui avec le lien.
--
-- Correctif : la fonction ne renvoie plus que les champs d'affichage
-- du chauffeur assigné (nom, véhicule, plaque, vérifié, zone,
-- position). JAMAIS : phone, email, selfie_url, id_document_url,
-- id_document_type, verification_status, verification_note,
-- verification_checks, verification_*_hash, is_admin, created_at.
-- Le code applicatif applique la même règle en défense en profondeur
-- (`stripDriverPhone` dans lib/db-types.ts, appliqué aux propositions,
-- à la course et au suivi public).
-- ============================================================

create or replace function public.get_public_ride(p_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'ride', row_to_json(r),
    'driver', case when d.id is null then null else jsonb_build_object(
      'id', d.id,
      'full_name', d.full_name,
      'vehicle_type', d.vehicle_type,
      'vehicle_brand', d.vehicle_brand,
      'vehicle_model', d.vehicle_model,
      'vehicle_color', d.vehicle_color,
      'plate', d.plate,
      'seats', d.seats,
      'is_online', d.is_online,
      'is_verified', d.is_verified,
      'is_demo', d.is_demo,
      'current_area', d.current_area,
      'last_lat', d.last_lat,
      'last_lng', d.last_lng
    ) end
  )
  from public.rides r
  left join public.profiles d on d.id = r.driver_id
where r.share_token = p_token
$$;

grant execute on function public.get_public_ride(uuid) to anon, authenticated;
