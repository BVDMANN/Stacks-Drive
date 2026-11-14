-- ============================================================
-- Stacks Drive v2.17 — « Les 2 règles » : verrouillage du switch
-- Passager → Chauffeur + mise en ligne (règle 2), côté base.
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor).
-- Ne jamais réexécuter sans vérifier (le script est idempotent :
-- CREATE OR REPLACE + DROP TRIGGER IF EXISTS).
-- ============================================================
--
-- Pourquoi une migration, alors que PATCH /api/profile applique déjà
-- les mêmes verrous ? Parce que la politique RLS « Users update their
-- own profile » autorise un utilisateur authentifié à modifier sa
-- propre ligne `profiles` directement via PostgREST (clé anon) — le
-- trigger anti-escalade ne bloquait jusqu'ici que `is_verified` et
-- `is_admin`. Sans ce trigger, un passager techniquement habile
-- pouvait passer `role = 'chauffeur'` et `is_online = true` en
-- appelant Supabase directement, sans passer par l'appli. Ce trigger
-- ferme ce chemin : c'est la même règle 2, appliquée au plus près
-- des données. L'API reste le premier rempart (message clair +
-- redirection vers « Devenir chauffeur ») ; le trigger est le filet.
--
-- Règles ajoutées (appelants non-admin uniquement ; l'admin garde
-- tous les droits, et le SQL direct — auth.uid() null — aussi,
-- comme pour le reste du trigger) :
--   1. Passer en mode Chauffeur exige un compte chauffeur CRÉÉ :
--      rôle déjà chauffeur, ou dossier de vérification existant
--      (statut en_attente / verifie / refuse — un tel dossier ne
--      peut exister que via le parcours chauffeur), ou documents de
--      vérification enregistrés. Un passager sans dossier est rejeté.
--      L'INSCRIPTION n'est pas concernée : le rôle chauffeur est
--      posé à la création du compte (INSERT, pas UPDATE) via
--      /inscription?role=chauffeur — c'est le chemin normal pour
--      devenir chauffeur.
--   2. Se mettre en ligne (is_online = true) exige un compte
--      chauffeur VÉRIFIÉ (is_verified déjà vrai). On teste
--      OLD.is_verified — la valeur déjà établie — parce que ce
--      trigger tourne AVANT profiles_sync_verified_flag (ordre
--      alphabétique) : NEW.is_verified ne serait pas encore
--      synchronisé avec verification_status à ce stade.
-- Un chauffeur refusé ou en attente garde donc son compte (il peut
-- repasser en mode Chauffeur pour renvoyer ses documents) mais ne
-- peut pas se mettre en ligne tant qu'il n'est pas vérifié. Le radar
-- ne montre de toute façon que les chauffeurs vérifiés et en ligne.

-- ---------- Remplacement du trigger anti-escalade (v2.4 + v2.17) ----------
-- Reprise intégrale de la version v2.4, + les deux règles ci-dessus
-- en fin de fonction (après le bloc verification_status, dont les
-- retours anticipés concernent des mises à jour qui ne touchent ni
-- au rôle ni à la mise en ligne).
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
  -- v2.17 — règle 2 : bascule en mode Chauffeur = compte chauffeur créé.
  if new.role = 'chauffeur'
     and old.role is distinct from 'chauffeur'
     and coalesce(old.is_verified, false) is not true
     and coalesce(old.verification_status, 'non_verifie') = 'non_verifie'
     and old.selfie_url is null
     and old.id_document_url is null then
    raise exception 'Crée d’abord ton compte chauffeur (inscription chauffeur + vérification) pour passer en mode Chauffeur.';
  end if;
  -- v2.17 — règle 2 : mise en ligne = compte chauffeur vérifié.
  -- Garde de TRANSITION uniquement (false → true) : une ligne déjà
  -- en ligne avant v2.17 (compte non vérifié resté en ligne) ne doit
  -- pas bloquer les autres modifications du profil — le radar ne
  -- montre de toute façon que les chauffeurs vérifiés et en ligne,
  -- et toute nouvelle activation est rejetée ici.
  if new.is_online is true
     and old.is_online is not true
     and coalesce(old.is_verified, false) is not true then
    raise exception 'Fais vérifier ton compte chauffeur avant de te mettre en ligne.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_privilege_escalation on public.profiles;
create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_privilege_escalation();

-- ---------- Vérification rapide (à lancer après exécution) ----------
-- Ces requêtes ne doivent rien retourner :
--   select count(*) from public.profiles
--     where role = 'chauffeur' and is_verified = false
--       and verification_status = 'non_verifie'
--       and selfie_url is null and id_document_url is null;
-- (0 = aucun compte chauffeur sans dossier — si le nombre est > 0,
--  ce sont d'anciens comptes basculés avant v2.17, à régulariser
--  manuellement : les inviter à se faire vérifier ou repasser
--  leur rôle à 'passager'.)
