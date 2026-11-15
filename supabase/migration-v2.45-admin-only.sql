-- ============================================================
-- Stacks Drive v2.45 — « Compte admin = admin uniquement ».
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- APRÈS approbation du push du code v2.45.
-- Ne jamais réexécuter sans vérifier (le script est idempotent :
-- CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- ============================================================
--
-- Aucun changement de schéma : aucune colonne ajoutée, aucune
-- valeur de rôle ajoutée — le drapeau `profiles.is_admin` existant
-- est la seule source de vérité (aucun e-mail ni nom codé en dur,
-- ni ici ni dans le code).
--
-- Pourquoi une migration, alors que les routes API appliquent déjà
-- les mêmes verrous (POST /api/rides, PATCH /api/profile,
-- POST /api/verification, POST /api/proposals, /api/driver/seats) ?
-- Parce que la politique RLS « Users update their own profile »
-- autorise un utilisateur authentifié à modifier sa propre ligne
-- `profiles` directement via PostgREST (clé anon) — comme pour la
-- règle 2 (migration v2.17), le trigger ferme ce chemin : c'est la
-- même séparation admin, appliquée au plus près des données. L'API
-- reste le premier rempart (message clair + code
-- `admin_not_allowed`) ; le trigger est le filet.
--
-- Règles ajoutées (niveau LIGNE — elles s'appliquent quel que soit
-- l'appelant, y compris l'admin lui-même et le SQL direct) :
--   1. Un compte `is_admin` ne peut pas être chauffeur : `role`
--      doit rester 'passager' et `is_online` doit rester faux.
--      Conséquence voulue : on ne « promeut » pas un chauffeur
--      existant en admin — l'admin est un compte séparé. Pour
--      rendre un chauffeur admin, il faut d'abord le repasser
--      en mode passager et hors ligne (ou, plus simplement, créer
--      un compte admin dédié).
--   2. Un compte `is_admin` ne peut pas être passager d'une
--      course : INSERT dans `rides` avec un `passenger_id` admin
--      est rejeté.
--   3. Un compte `is_admin` ne peut pas proposer de prix : INSERT
--      dans `ride_proposals` avec un `driver_id` admin est rejeté.
-- Les lectures et les compteurs ne changent pas ici : les listes
-- (`getOnlineDrivers`, `getAdminStats`) et les compteurs
-- (/admin, /admin/live) excluent déjà l'admin côté code.
--
-- Ordre d'exécution (après approbation du push v2.45) :
--   1. Déployer le code v2.45 (push approuvé, Vercel).
--   2. Exécuter CE fichier une seule fois (SQL Editor).
--   3. Vérifier (requêtes ci-dessous, section « Vérification »).
-- Le code fonctionne sans cette migration (verrous API) ; la
-- migration ne fait que fermer le contournement direct PostgREST.

-- ---------- 1. Le compte admin n'est ni chauffeur ni en ligne ----------
create or replace function public.prevent_admin_operational_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.is_admin, false) is true then
    if new.role = 'chauffeur' then
      raise exception 'Un compte admin ne peut pas être chauffeur.';
    end if;
    if coalesce(new.is_online, false) is true then
      raise exception 'Un compte admin ne peut pas se mettre en ligne.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_admin_operational_role on public.profiles;
create trigger trg_prevent_admin_operational_role
  before insert or update on public.profiles
  for each row execute function public.prevent_admin_operational_role();

-- ---------- 2. Le compte admin ne commande pas de course ----------
create or replace function public.prevent_admin_ride_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  passenger_is_admin boolean;
begin
  if new.passenger_id is null then
    return new;
  end if;
  select p.is_admin into passenger_is_admin
    from public.profiles p where p.id = new.passenger_id;
  if coalesce(passenger_is_admin, false) is true then
    raise exception 'Le compte admin ne commande pas de courses.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_admin_ride_request on public.rides;
create trigger trg_prevent_admin_ride_request
  before insert on public.rides
  for each row execute function public.prevent_admin_ride_request();

-- ---------- 3. Le compte admin ne propose pas de prix ----------
create or replace function public.prevent_admin_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  driver_is_admin boolean;
begin
  if new.driver_id is null then
    return new;
  end if;
  select p.is_admin into driver_is_admin
    from public.profiles p where p.id = new.driver_id;
  if coalesce(driver_is_admin, false) is true then
    raise exception 'Le compte admin ne propose pas de courses.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_admin_proposal on public.ride_proposals;
create trigger trg_prevent_admin_proposal
  before insert on public.ride_proposals
  for each row execute function public.prevent_admin_proposal();

-- ---------- Vérification (après exécution, SQL Editor) ----------
-- 1. Les trois triggers existent :
--    select tgname from pg_trigger
--      where tgname like 'trg_prevent_admin%';
--    -- attendu : 3 lignes.
-- 2. Le compte admin ne peut pas passer chauffeur (remplacer
--    <admin_uuid> par l'id du compte admin — requête à lancer
--    CONNECTÉ EN TANT QU'ADMIN, ou en SQL direct avec auth.uid()
--    null, les deux doivent échouer) :
--    update public.profiles set role = 'chauffeur'
--      where id = '<admin_uuid>';
--    -- attendu : ERREUR « Un compte admin ne peut pas être chauffeur. »
-- 3. Le compte admin ne peut pas se mettre en ligne :
--    update public.profiles set is_online = true
--      where id = '<admin_uuid>';
--    -- attendu : ERREUR « Un compte admin ne peut pas se mettre en ligne. »
-- 4. Aucune course existante n'a l'admin comme passager ou chauffeur
--    (doit rester vrai après la migration — sinon, nettoyer d'abord) :
--    select count(*) from public.rides
--      where passenger_id in (select id from public.profiles where is_admin)
--         or driver_id in (select id from public.profiles where is_admin);
--    -- attendu : 0.
