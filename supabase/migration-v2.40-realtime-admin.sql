-- Migration v2.40 — Vue admin en direct : temps réel (Realtime)
--
-- À exécuter une seule fois, pas encore appliquée.
--
-- À EXÉCUTER UNE FOIS dans le SQL Editor Supabase (projet stacks-drive),
-- AVANT le déploiement du code v2.40. Réexécuter ce fichier est sans
-- danger (gardes `if not exists` — même motif que
-- migration-v2.24-realtime-emails.sql).
--
-- Les tables `profiles`, `disputes`, `ride_cancellations`,
-- `verification_tickets`, `fraud_cases` et `audit_log` entrent dans la
-- publication `supabase_realtime` (canaux postgres_changes) pour que la
-- vue admin en direct reçoive les changements sans rechargement.
-- RLS INCHANGÉE : un canal Realtime ne voit que ce que les politiques
-- SELECT autorisent déjà — l'admin seul lit ces tables.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql / migration-v2.6.sql.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'disputes'
  ) then
    alter publication supabase_realtime add table public.disputes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_cancellations'
  ) then
    alter publication supabase_realtime add table public.ride_cancellations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'verification_tickets'
  ) then
    alter publication supabase_realtime add table public.verification_tickets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fraud_cases'
  ) then
    alter publication supabase_realtime add table public.fraud_cases;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audit_log'
  ) then
    alter publication supabase_realtime add table public.audit_log;
  end if;
end $$;
