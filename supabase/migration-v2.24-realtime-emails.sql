-- Migration v2.24 — Temps réel (Realtime) + e-mails automatiques (lot B)
--
-- À EXÉCUTER UNE FOIS dans le SQL Editor Supabase (projet stacks-drive),
-- AVANT le déploiement du code v2.24. Réexécuter ce fichier est sans
-- danger (IF NOT EXISTS + CREATE OR REPLACE + gardes).
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql / migration-v2.6.sql.
--
-- 1. Temps réel : les tables `rides`, `ride_proposals` et
--    `ride_messages` entrent dans la publication `supabase_realtime`
--    (canaux postgres_changes). RLS INCHANGÉE : un canal Realtime ne
--    voit que ce que les politiques SELECT autorisent déjà — le
--    passager d'une course et son chauffeur pour les messages, le
--    chauffeur auteur ou le passager de la course pour les
--    propositions. Sans cette publication, les canaux se connectent
--    mais ne reçoivent rien (le sondage lent de sécurité couvre ce
--    cas côté client).
-- 2. E-mails automatiques : drapeaux de déduplication (un seul
--    e-mail par événement) + fonctions SECURITY DEFINER pour les
--    routes cron (sans session, la RLS refuserait l'écriture).
--    - `profiles.welcome_email_sent_at` : bienvenue passager (1 fois).
--    - `profiles.settlement_reminder_sent_at` : rappel de règlement
--      (au plus 1 par semaine et par chauffeur).
--    - `weekly_settlements.driver_email_sent_at` : récap hebdo des
--      gains par chauffeur (1 par relevé).
-- 3. Règles métier inchangées : commission 5 % / 8 % / plafond 10 %
--    (`lib/commission.ts` non touchée), prix côté serveur uniquement,
--    Groupe = 1 place, Solo = véhicule entier.

-- ---------- 1. Publication Realtime ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rides'
  ) then
    alter publication supabase_realtime add table public.rides;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_proposals'
  ) then
    alter publication supabase_realtime add table public.ride_proposals;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_messages'
  ) then
    alter publication supabase_realtime add table public.ride_messages;
  end if;
end $$;

-- ---------- 2. Drapeaux de déduplication des e-mails ----------
alter table public.profiles
  add column if not exists welcome_email_sent_at timestamptz,
  add column if not exists settlement_reminder_sent_at timestamptz;

alter table public.weekly_settlements
  add column if not exists driver_email_sent_at timestamptz;

-- ---------- 3. Fonctions SECURITY DEFINER (routes cron, sans session) ----------
-- Marque le récap hebdo d'un chauffeur comme envoyé par e-mail.
create or replace function public.mark_weekly_settlement_emailed(p_settlement_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.weekly_settlements set driver_email_sent_at = now() where id = p_settlement_id;
$$;

-- Marque le rappel de règlement d'un chauffeur comme envoyé.
create or replace function public.mark_settlement_reminder_sent(p_driver_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set settlement_reminder_sent_at = now() where id = p_driver_id;
$$;
