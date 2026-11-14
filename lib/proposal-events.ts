import type { RideProposal } from '@/types';

/** Détection des événements de négociation (v2.12) : compare la liste
 *  des propositions du sondage précédent avec la nouvelle, et émet un
 *  événement par changement — jamais deux fois le même (l'instantané
 *  est mis à jour à chaque sondage). Pur, sans effet de bord. */

export type ProposalSnapshot = Map<
  string,
  { status: string; proposedPrice: number; counterPrice: number | null }
>;

export type ProposalEvent<T extends RideProposal = RideProposal> =
  /** Nouvelle proposition en attente jamais vue. */
  | { kind: 'new'; proposal: T }
  /** Le chauffeur a changé son prix (après une contre-proposition :
   *  la contre-proposition est effacée par le reprice). */
  | { kind: 'repriced'; proposal: T; previousPrice: number }
  /** Le passager a contre-proposé un prix (apparition ou changement). */
  | { kind: 'counter'; proposal: T }
  /** Une proposition en attente vient d'être acceptée (prix figé). */
  | { kind: 'accepted'; proposal: T };

export function snapshotProposals(list: RideProposal[]): ProposalSnapshot {
  return new Map(
    list.map((p) => [
      p.id,
      { status: p.status, proposedPrice: p.proposedPrice, counterPrice: p.counterPrice },
    ])
  );
}

/** Compare l'instantané précédent avec la nouvelle liste. Renvoie les
 *  événements détectés ET le nouvel instantané à conserver. Générique :
 *  le type des propositions est conservé (ex. `MyProposal` côté
 *  chauffeur, avec le trajet joint). */
export function detectProposalEvents<T extends RideProposal>(
  prev: ProposalSnapshot,
  next: T[]
): { events: ProposalEvent<T>[]; snapshot: ProposalSnapshot } {
  const events: ProposalEvent<T>[] = [];
  for (const p of next) {
    const old = prev.get(p.id);
    if (!old) {
      if (p.status === 'pending') events.push({ kind: 'new', proposal: p });
      else if (p.status === 'accepted') events.push({ kind: 'accepted', proposal: p });
      continue;
    }
    if (old.status === 'pending' && p.status === 'accepted') {
      events.push({ kind: 'accepted', proposal: p });
      continue;
    }
    if (p.status !== 'pending') continue;
    if (old.counterPrice !== p.counterPrice && p.counterPrice !== null) {
      events.push({ kind: 'counter', proposal: p });
      continue;
    }
    if (old.proposedPrice !== p.proposedPrice) {
      events.push({ kind: 'repriced', proposal: p, previousPrice: old.proposedPrice });
    }
  }
  return { events, snapshot: snapshotProposals(next) };
}

/** Prénom du chauffeur d'une proposition (jamais de téléphone). */
export function driverFirstName(p: RideProposal): string {
  return p.driver?.name?.trim().split(' ')[0] ?? 'Le chauffeur';
}
