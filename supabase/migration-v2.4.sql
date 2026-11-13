-- ============================================================
-- Stacks Drive v2.4 — Migration ADDITIVE (à exécuter UNE fois)
-- Dashboard Supabase > SQL Editor, après le déploiement de la v2.4.
-- Ne JAMAIS réexécuter schema.sql (v1), migration-v2.sql,
-- migration-v2.2.sql ni migration-v2.3.sql.
--
-- Contenu :
--  1. Vérification chauffeur AUTOMATISÉE : nouvelles colonnes sur
--     profiles (résultats des contrôles, empreintes, décision auto).
--  2. Tickets de vérification (verification_tickets) : les dossiers
--     ambigus (et les doublons) arrivent dans une file admin, triés
--     par urgence, avec e-mail à l'admin si Resend est configuré.
--  3. RLS sur la nouvelle table (admin partout, chauffeur en lecture
--     de ses propres tickets).
--
-- Modèle économique (décisions Randy, 13/11/2026) — inchangé :
--  commission 5 % au lancement puis 8 %, plafond 10 % ; le passager
--  paie le chauffeur directement (espèces / Airtel / Moov) ; l'appli
--  ne touche jamais l'argent, elle compte seulement ; dépôt 5 000 FCFA ;
--  plafond de dette ~5 000 FCFA. Pas de wallet, pas d'abonnement.
-- ============================================================

-- ---------- 1. Profils : résultats des contrôles automatiques ----------
alter table public.profiles
  add column if not exists verification_checks jsonb,
  add column if not exists verification_doc_hash text,
  add column if not exists verification_image_hash text,
  add column if not exists verification_auto_decision text
    check (verification_auto_decision is null
      or verification_auto_decision in ('verifie', 'refuse', 'ambigu'));

-- Un même numéro de pièce (haché) ne doit servir qu'à un seul compte.
-- Index unique partiel : seuls les hash renseignés sont concernés.
create unique index if not exists profiles_verification_doc_hash_unique_idx
  on public.profiles (verification_doc_hash)
  where verification_doc_hash is not null;

create index if not exists profiles_verification_image_hash_idx
  on public.profiles (verification_image_hash)
  where verification_image_hash is not null;

-- ---------- 2. Tickets de vérification ----------
create table if not exists public.verification_tickets (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  urgency text not null default 'moyenne'
    check (urgency in ('basse', 'moyenne', 'haute', 'critique')),
  status text not null default 'ouvert'
    check (status in ('ouvert', 'en_cours', 'resolu')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id),
  email_sent_at timestamptz
);

create index if not exists verification_tickets_driver_idx
  on public.verification_tickets (driver_id, created_at desc);
create index if not exists verification_tickets_open_idx
  on public.verification_tickets (status, urgency, created_at desc)
  where status = 'ouvert';

-- ---------- 3. RLS ----------
alter table public.verification_tickets enable row level security;

drop policy if exists "Admins manage verification tickets" on public.verification_tickets;
create policy "Admins manage verification tickets"
  on public.verification_tickets for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "Drivers read their own tickets" on public.verification_tickets;
create policy "Drivers read their own tickets"
  on public.verification_tickets for select
  using (driver_id = auth.uid());

drop policy if exists "Drivers file their own tickets" on public.verification_tickets;
create policy "Drivers file their own tickets"
  on public.verification_tickets for insert
  with check (driver_id = auth.uid());

-- ---------- 4. Décision automatique : autoriser l'écriture du statut ----------
-- Le trigger anti-escalade (v2) n'autorisait le chauffeur qu'à passer
-- son statut à « en_attente ». La décision automatique (v2.4) est
-- calculée CÔTÉ SERVEUR (route /api/verification, règles dans
-- lib/verification.ts) : la route écrit le résultat dans profiles.
-- On autorise donc le propriétaire à passer son statut à « verifie »
-- ou « refuse » UNIQUEMENT quand la mise à jour porte la charge
-- utile complète et cohérente de la décision automatique :
--  - verification_auto_decision = nouveau statut,
--  - verification_checks non nul, avec decision identique,
--  - pour « verifie » : nom exact, majeur, pièce valide, aucun doublon,
--    et du texte OCR réellement lu.
-- Limite honnête : un chauffeur techniquement habile pourrait forger
-- une charge utile cohérente en appelant PostgREST directement. Les
-- images et les contrôles restent stockés et visibles par l'admin, les
-- doublons sont vérifiés côté serveur, et le journal d'audit consigne
-- chaque décision. Une re-vérification OCR 100 % serveur (ou un
-- service payant type Veriff / Onfido) reste le durcissement futur.
create or replace function public.verification_auto_payload_consistent(
  p_checks jsonb,
  p_decision text
)
returns boolean
language sql
stable
as $$
  select
    p_checks is not null
    and (p_checks ->> 'decision') = p_decision
    and (
      p_decision = 'refuse'
      or (
        p_decision = 'verifie'
        and (p_checks -> 'server' ->> 'nameMatch') = 'exact'
        and (p_checks -> 'server' ->> 'isMinor') = 'false'
        and (p_checks -> 'server' ->> 'isExpired') = 'false'
        and (p_checks -> 'server' ->> 'duplicateDoc') = 'false'
        and (p_checks -> 'server' ->> 'duplicateImage') = 'false'
        and length(coalesce(p_checks -> 'client' ->> 'ocrText', '')) > 20
        and coalesce((p_checks -> 'client' ->> 'ocrConfidence')::int, -1) >= 0
      )
      or p_decision = 'ambigu'
    );
$$;

-- Remplacement du trigger anti-escalade (v2) : même règles + branche
-- « décision automatique » (v2.4). Les autres cas sont inchangés.
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
    -- v2.4 — décision automatique : le chauffeur peut recevoir le
    -- résultat calculé côté serveur, avec la charge utile complète.
    if auth.uid() = old.id
       and new.verification_status in ('verifie', 'refuse')
       and old.verification_status in ('non_verifie', 'refuse')
       and new.verification_auto_decision = new.verification_status
       and public.verification_auto_payload_consistent(
         new.verification_checks, new.verification_auto_decision) then
      return new;
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
