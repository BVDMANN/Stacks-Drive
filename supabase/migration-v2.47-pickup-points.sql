-- Migration v2.47 — points exacts de course (pickup précis).
--
-- À EXÉCUTER UNE SEULE FOIS dans le SQL Editor Supabase (projet
-- stacks-drive), APRÈS approbation. Sans elle, le code reste
-- résilient : la route POST /api/rides retire les champs si la base
-- répond 42703 (colonne manquante) et la demande part sur les
-- centres de quartiers — mais l'adresse précise n'est alors pas
-- persistée, donc invisible côté chauffeur.
--
-- Contenu : 6 colonnes sur `rides` (coordonnées + adresse résolue
-- du départ et de la destination). Aucun changement de schéma
-- ailleurs, aucune RLS à toucher (les lignes `rides` sont déjà
-- lues/écrites par les mêmes rôles).

alter table public.rides
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists pickup_address text,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision,
  add column if not exists destination_address text;

-- Garde-fou : un point exact sans ses deux coordonnées est ignoré
-- (le code ne lit le point que si lat ET lng sont présents) — pas
-- de contrainte CHECK, les anciens clients n'envoient rien.
