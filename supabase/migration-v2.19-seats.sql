-- ============================================================
-- Stacks Drive v2.19 — Places libres + statut chauffeur.
-- À EXÉCUTER UNE SEULE FOIS dans Supabase (Dashboard > SQL Editor),
-- AVANT le déploiement du code v2.19. Le script est idempotent
-- (IF NOT EXISTS + CREATE OR REPLACE + DROP TRIGGER IF EXISTS) :
-- le relancer est sans danger.
--
-- NE JAMAIS réexécuter schema.sql / migration-v2.sql / migration-v2.2.sql
-- / migration-v2.3.sql / migration-v2.4.sql / migration-v2.6.sql /
-- migration-v2.10.sql / migration-v2.15-disputes.sql /
-- migration-v2.17-mode-rules.sql.
-- ============================================================
--
-- Modèle (v2.19) :
--   * Capacité du véhicule : `profiles.seats` (déjà existante,
--     déclarée dans le profil chauffeur, 1 à 9 places).
--   * Places libres déclarées : nouvelle colonne `profiles.free_seats`
--     (0 à 9, NULL = jamais déclarées = capacité entière libre).
--     Le chauffeur la déclare quand il se met en ligne (pop-up
--     « Combien de places libres dans ton véhicule ? ») et la modifie
--     à tout moment depuis son accueil / tableau de bord (« Mes places »).
--   * Statut chauffeur : DÉRIVÉ, jamais stocké — il se recalcule à
--     chaque lecture depuis les places libres + les courses en cours
--     (`lib/seats.ts` : deriveDriverStatus) :
--       Vide      = aucune course en cours, véhicule entièrement libre.
--       En course = course en cours avec des places encore libres, ou
--                   course Solo en cours (véhicule entier pris, sans
--                   disponibilité jusqu'à la fin de la course).
--       Plein     = 0 place libre.
--   * Transitions (côté serveur uniquement, jamais depuis le client) :
--       acceptation Groupe  → free_seats − 1 ;
--       acceptation Solo    → free_seats = 0 ;
--       fin / annulation    → Groupe + 1 (plafonné à la capacité),
--                             Solo → capacité entière.
--     Groupe = 1 place, Solo = véhicule entier : aucun compteur de
--     passagers côté passager.
--   * Matching (dispatch, `lib/rides.ts` getIncomingRequests) :
--       Groupe → chauffeurs avec au moins 1 place libre (y compris
--                 ceux déjà en course Groupe avec des places
--                 restantes — taxi partagé) ;
--       Solo   → chauffeurs TOTALEMENT vides (aucune course en cours) ;
--       Plein  → plus aucune demande (ni Groupe, ni Solo).
--     Le filtre places / statut s'AJOUTE au filtre rayon (5 km puis
--     25 km après 30 s, v2.18), il ne le remplace pas.
--
-- Compatibilité avant exécution : le code v2.19 est résilient si
-- cette migration n'est pas encore appliquée — la colonne absente
-- (erreur 42703) est traitée comme « jamais déclarées » et les places
-- libres sont déduites des courses en cours (capacité − Groupes en
-- cours, 0 si une Solo est en cours). Le statut et le matching restent
-- donc corrects avant comme après la migration ; la déclaration
-- manuelle des places (« Mes places ») exige en revanche la colonne.
--
-- RLS : aucun changement de politique — le chauffeur modifie SES
-- propres places via la politique existante « Users update their own
-- profile » (auth.uid() = id), l'admin lit tout via « Admins update
-- any profile » / la lecture publique des profils. Le trigger
-- ci-dessous ne fait que BORNER la valeur (jamais au-dessus de la
-- capacité, jamais négative) : il ne donne aucun droit nouveau.
-- La règle 2 (v2.17) n'est pas touchée : ce fichier ne redéfinit PAS
-- le trigger anti-escalade — il ajoute un trigger séparé.

-- ---------- 1. Colonne places libres ----------
alter table public.profiles
  add column if not exists free_seats int
    check (free_seats is null or (free_seats between 0 and 9));

-- Remplissage initial : tout chauffeur qui a déclaré une capacité
-- part avec toutes ses places libres (comportement d'avant la v2.19).
update public.profiles
  set free_seats = seats
  where free_seats is null
    and seats is not null;

-- ---------- 2. Borne automatique : 0 <= free_seats <= seats ----------
-- Un chauffeur ne peut jamais déclarer plus de places libres que la
-- capacité de son véhicule (ni directement via PostgREST, ni via
-- l'API) : on borne au lieu de rejeter, pour ne jamais bloquer une
-- mise en ligne à cause d'une capacité modifiée entre-temps (ex. le
-- chauffeur passe de 6 à 4 places alors qu'il en avait 5 libres :
-- ses places libres tombent à 4, il reste en ligne).
create or replace function public.sync_free_seats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.free_seats is not null then
    if new.seats is null then
      -- Pas de véhicule déclaré : aucune place libre déclarable.
      new.free_seats := 0;
    else
      new.free_seats := least(greatest(new.free_seats, 0), new.seats);
    end if;
  end if;
  -- Mise en ligne avec des places jamais déclarées : on part de la
  -- capacité entière libre (même règle que le remplissage initial).
  if new.is_online is true
     and old.is_online is not true
     and new.free_seats is null
     and new.seats is not null then
    new.free_seats := new.seats;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_sync_free_seats on public.profiles;
create trigger profiles_sync_free_seats
  before update on public.profiles
  for each row execute function public.sync_free_seats();

-- ---------- Vérifications rapides (à lancer après exécution) ----------
-- Ces requêtes ne doivent rien retourner :
--   select count(*) from public.profiles
--     where free_seats is not null
--       and (free_seats < 0 or free_seats > coalesce(seats, 0));
-- (0 = aucune place libre hors bornes.)
--   select count(*) from public.profiles
--     where role = 'chauffeur' and is_online = true
--       and free_seats is null and seats is not null;
-- (0 = aucun chauffeur en ligne sans places déclarées — le trigger
--  les initialise à la mise en ligne, le remplissage initial couvre
--  les comptes déjà en ligne.)
