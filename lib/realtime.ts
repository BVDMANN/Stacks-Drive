/** Temps réel Supabase Realtime (v2.24) — remplace le sondage rapide
 *  pour les propositions, les messages et les demandes, avec repli
 *  propre sur le sondage si Realtime est indisponible.
 *
 *  Principe : le composant garde son sondage, mais l'intervalle
 *  dépend de `live` — quand le canal est abonné (`SUBSCRIBED`), le
 *  sondage ralentit (rafraîchissement de sécurité, 30–60 s, qui
 *  rattrape un événement manqué) ; quand le canal échoue, se ferme
 *  ou n'est pas configuré, le sondage rapide reprend (5–15 s).
 *  Aucun crash si Supabase n'est pas configuré : le hook renvoie
 *  `live: false` et le sondage fait tout le travail.
 *
 *  RLS inchangée : un canal Realtime ne voit que ce que les
 *  politiques SELECT autorisent déjà — exactement les mêmes lignes
 *  que les lectures API actuelles (`ride_proposals` lisible par le
 *  chauffeur auteur ou le passager de la course, `ride_messages`
 *  par les deux parties de la course, `rides` par ses parties).
 *  Côté base, les tables doivent être dans la publication
 *  `supabase_realtime` (migration v2.24) ; sinon le canal se
 *  connecte mais ne reçoit rien — le sondage de sécurité couvre
 *  ce cas, et `live` reste vrai (le canal est abonné) : c'est pour
 *  ça que le sondage lent n'est JAMAIS supprimé, seulement ralenti.
 *
 *  Les événements Realtime ne font que déclencher un rechargement
 *  via l'API (comme un tour de sondage) : la détection des
 *  événements de négociation (`lib/proposal-events.ts`, toasts)
 *  reste inchangée et ne voit jamais un événement deux fois. */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/client';

export interface RealtimeSubscriptionOptions {
  /** Table écoutée (`ride_proposals`, `ride_messages`, `rides`). */
  table: string;
  /** Filtre postgres_changes, ex. `ride_id=eq.<uuid>`. Vide = toute la table
   *  (réservé aux tables dont la RLS limite déjà la visibilité). */
  filter?: string;
  /** Actif ou non (ex. seulement quand une course est en cours). */
  enabled: boolean;
  /** Appelée à chaque INSERT / UPDATE reçu (déclenche un rechargement). */
  onChange: () => void;
}

/** Abonne le client au canal Realtime de la table. Renvoie `live` :
 *  vrai tant que le canal est abonné — le composant adapte alors son
 *  sondage (lent en sécurité, rapide en repli). */
export function useRealtimeSubscription({
  table,
  filter,
  enabled,
  onChange,
}: RealtimeSubscriptionOptions): { live: boolean } {
  const [live, setLive] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!enabled) {
      setLive(false);
      return;
    }
    const supabase = getBrowserClient();
    if (!supabase) {
      setLive(false);
      return;
    }
    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    try {
      channel = supabase
        .channel(`stacks-drive:${table}:${filter ?? 'all'}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table,
            ...(filter ? { filter } : {}),
          },
          () => {
            onChangeRef.current();
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') setLive(true);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            setLive(false);
          }
        });
    } catch {
      setLive(false);
      return;
    }
    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
      setLive(false);
    };
  }, [table, filter, enabled]);

  return { live };
}

/** Intervalle de sondage selon l'état Realtime : rapide en repli,
 *  lent (sécurité) quand le direct fonctionne. */
export function pollingIntervalMs(live: boolean, fastMs: number, slowMs = 60000): number {
  return live ? slowMs : fastMs;
}
