-- Migration v2.30 — Plancher P1 (lot P1, local, non déployé).
--
-- À EXÉCUTER UNE SEULE FOIS (pas encore appliquée). Sans elle, le code
-- v2.30 reste résilient : les courses planifiées renvoient une erreur
-- explicite, les lieux favoris et la re-vérification selfie sont
-- inactifs, la heatmap et les gains détaillés lisent les tables
-- existantes.
--
-- 1) Courses planifiées : `rides.scheduled_at` (heure prévue, heure de
--    Libreville côté applicatif) + `rides.dispatched_at` (heure d'envoi
--    réel aux chauffeurs, ~15 min avant). Deux nouveaux statuts :
--    `planifiee` (en attente de son heure) et `expiree` (heure passée
--    sans chauffeur — relançable par le passager).
-- 2) Lieux favoris : domicile / travail sur `profiles` (quartier +
--    précision libre, effaçables).
-- 3) Re-vérification selfie ponctuelle : drapeau `selfie_recheck_required`
--    (posé par l'admin après un signalement, ou par le balayage hebdo
--    quand le dernier contrôle date de plus de 30 jours) + date du
--    dernier contrôle `last_selfie_check_at`. Le backfill ci-dessous
--    pose la date du jour pour les chauffeurs déjà vérifiés : personne
--    n'est bloqué à la mise en ligne le jour de la migration.
--    Contrôle = simple présence d'un visage (réutilise la détection
--    v2.4) — JAMAIS de reconnaissance faciale biométrique ni
--    d'identification ; en cas de doute, ticket admin (file v2.4),
--    pas de blocage définitif automatique.
--
-- `lib/commission.ts` (5 % puis 8 %, plafond 10 %) et le modèle de prix
-- sont intouchés. Aucun secret ici (clé anon publique + RLS uniquement).

-- --- Courses planifiées -----------------------------------------------
alter table public.rides
  add column if not exists scheduled_at timestamptz,
  add column if not exists dispatched_at timestamptz;

-- Élargir le contrôle de statut (défini dans migration-v2.sql) aux deux
-- nouveaux statuts. Les anciens statuts restent tous valides.
alter table public.rides drop constraint if exists rides_status_check;
alter table public.rides
  add constraint rides_status_check
  check (status in (
    'recherche', 'propositions', 'acceptee', 'en_cours', 'terminee',
    'annulee', 'planifiee', 'expiree'
  ));

create index if not exists rides_scheduled_idx
  on public.rides (scheduled_at) where status = 'planifiee';

-- --- Lieux favoris ------------------------------------------------------
alter table public.profiles
  add column if not exists home_neighborhood text,
  add column if not exists home_detail text,
  add column if not exists work_neighborhood text,
  add column if not exists work_detail text;

-- --- Re-vérification selfie ---------------------------------------------
alter table public.profiles
  add column if not exists selfie_recheck_required boolean not null default false,
  add column if not exists selfie_recheck_reason text,
  add column if not exists last_selfie_check_at timestamptz;

-- Backfill : les chauffeurs déjà vérifiés ont un contrôle « du jour » —
-- la règle « pas plus d'1 fois par mois » ne les bloque pas à la
-- migration, elle ne s'appliquera qu'après 30 jours sans contrôle.
update public.profiles
  set last_selfie_check_at = now()
  where is_verified = true and last_selfie_check_at is null;
