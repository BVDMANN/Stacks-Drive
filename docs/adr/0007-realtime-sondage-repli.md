# ADR 0007 — Realtime + sondage en repli, pas l'un ou l'autre

- Statut : Acceptée
- Date : 14/11/2026 (v2.24, lot B)

## Contexte

Les propositions, les demandes et les messages doivent arriver vite
(la négociation se joue en secondes). Supabase Realtime le permet —
mais un canal peut échouer, se fermer, ou ne rien recevoir si les
tables ne sont pas dans la publication `supabase_realtime`. Un système
qui dépend uniquement de Realtime tombe en silence dans ces cas.

## Décision

- **Supabase Realtime** (`postgres_changes`) sur `rides`,
  `ride_proposals`, `ride_messages` (migration v2.24), via le hook
  `useRealtimeSubscription` (`lib/realtime.ts`).
- **Le sondage reste, son intervalle s'adapte** : canal abonné →
  sondage lent de sécurité (30–60 s, rattrape un événement manqué) ;
  canal en échec → sondage rapide (5–15 s). Le sondage lent n'est
  **jamais supprimé**, seulement ralenti.
- Les événements Realtime ne font que déclencher un rechargement via
  l'API : la détection des événements de négociation
  (`lib/proposal-events.ts`, toasts) ne voit jamais un événement deux
  fois. **RLS inchangée** : un canal ne voit que ce que les politiques
  SELECT autorisent déjà.

## Conséquences

- Temps réel quand il fonctionne, sondage quand il ne fonctionne pas —
  sans code de secours séparé à maintenir : c'est le même rechargement.
- Aucun crash si Supabase n'est pas configuré : le hook renvoie
  `live: false` et le sondage fait tout le travail.
- Les fréquences restent sobres : position chauffeur toutes les ~10 s
  en course acceptée, ETA recalculée sur mouvement ~100 m ou 30 s.

## Alternatives écartées

- **Realtime seul** : tombe en silence si la publication est
  incomplète (canal abonné mais sans événement) — c'est le cas que le
  sondage de sécurité couvre.
- **Sondage seul** : latence de 5–15 s sur chaque proposition — trop
  lent pour une négociation, et plus de requêtes en permanence.
- **WebSocket maison / Pusher** : une infrastructure de plus à opérer
  pour un besoin déjà couvert par Supabase.
