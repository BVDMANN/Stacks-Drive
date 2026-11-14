/** Nettoyage automatique des données (v2.26, lot D — RGPD).
 *
 *  Ce que disent les règles en place (vérifié avant d'écrire ce
 *  lot — `app/confidentialite/page.tsx` §5, mis à jour ici même
 *  avec les durées ci-dessous) : les données sont conservées tant
 *  que le compte est actif ; les documents de vérification sont
 *  supprimés quand le chauffeur n'est plus actif ; la suppression
 *  d'un compte se fait sur demande, sous 30 jours, sauf obligation
 *  légale. La politique ne prévoit AUCUNE suppression automatique
 *  de compte — donc ce lot ne supprime JAMAIS un compte, ni ne
 *  l'anonymise : les comptes inactifs sont seulement COMPTÉS et
 *  listés pour l'administrateur (qui contacte, puis supprime sur
 *  demande ou par décision tracée). En cas de doute, on expire /
 *  on archive plutôt que de supprimer — c'est la règle appliquée
 *  ici aux propositions (statut `expired`, historique conservé).
 *
 *  Ce qui est nettoyé, chaque semaine, par le cron existant
 *  `/api/cron/weekly-report` (AUCUN nouveau cron Vercel — limite
 *  du plan gratuit) :
 *    1. Positions chauffeur anciennes (`driver_locations`) : une
 *       seule ligne par course, utile uniquement jusqu'au pickup.
 *       Supprimée quand la course n'est plus `acceptee` ou quand
 *       la position a plus de 24 h. La position n'est jamais
 *       conservée après la course (politique de confidentialité §2).
 *    2. Propositions expirées (`ride_proposals`) : les propositions
 *       `pending` dont `expires_at` est dépassée passent à
 *       `expired` (même statut que l'expiration à la lecture,
 *       `app/api/proposals/[id]/route.ts`) — l'historique reste
 *       lisible, rien n'est supprimé.
 *    3. Comptes inactifs : COMPTÉS seulement (aucune suppression,
 *       aucune anonymisation) — 12 mois sans activité (ni course,
 *       ni mise en ligne). Le chiffre est journalisé (table
 *       `data_cleanups`, visible dans /admin) et repris dans la
 *       réponse du cron hebdo.
 *
 *  Exécution : la fonction SQL SECURITY DEFINER `run_data_cleanup`
 *  (migration v2.26) fait le travail en base — la route cron n'a
 *  pas de session, la RLS refuserait les suppressions directes.
 *  Sans la migration, le nettoyage est sauté proprement (le cron
 *  hebdo continue) et le rapport le signale. */

import type { SupabaseClient } from '@supabase/supabase-js';
import { purgeExpiredTripAudio } from './trip-audio';

// ---------------------------------------------------------------------------
// Durées de conservation (UNIQUES sources de vérité).
// ---------------------------------------------------------------------------

/** Âge maximal d'une position chauffeur (heures) : au-delà, la
 *  ligne est supprimée — la course est finie, la position ne sert
 *  plus à personne. */
export const DRIVER_LOCATION_MAX_AGE_HOURS = 24;

/** Inactivité d'un compte avant d'être signalé à l'admin (jours).
 *  12 mois : au-delà, le compte est compté comme inactif — jamais
 *  supprimé automatiquement (voir en-tête). */
export const INACTIVE_ACCOUNT_DAYS = 365;

export interface DataCleanupResult {
  /** Le nettoyage a-t-il tourné (false = migration v2.26 absente) ? */
  ran: boolean;
  /** Positions chauffeur supprimées. */
  locationsDeleted: number;
  /** Propositions `pending` expirées → `expired`. */
  proposalsExpired: number;
  /** Comptes inactifs (≥ 12 mois) — comptés seulement, jamais
   *  supprimés ni anonymisés. */
  inactiveAccounts: number;
  runAt: string;
}

/** Résultat « non exécuté » (migration absente) — le cron continue. */
export function cleanupNotRun(): DataCleanupResult {
  return {
    ran: false,
    locationsDeleted: 0,
    proposalsExpired: 0,
    inactiveAccounts: 0,
    runAt: new Date().toISOString(),
  };
}

/** Lance le nettoyage hebdomadaire (cron `/api/cron/weekly-report`).
 *  Appelle `run_data_cleanup()` (SECURITY DEFINER, migration v2.26)
 *  qui supprime les positions anciennes, expire les propositions
 *  échues, compte les comptes inactifs, et journalise le passage
 *  dans `data_cleanups`. Ne lève jamais d'exception. */
export async function runWeeklyCleanup(supabase: SupabaseClient): Promise<DataCleanupResult> {
  try {
    const { data, error } = await supabase.rpc('run_data_cleanup');
    if (error || !data) {
      if (error) console.error('[data-cleanup] run_data_cleanup indisponible :', error.message);
      return cleanupNotRun();
    }
    const row = data as {
      locations_deleted: number;
      proposals_expired: number;
      inactive_accounts: number;
    };
    // Audio de trajet (v2.34) : suppression des enregistrements
    // expirés sans litige (7 jours) — meilleur effort, jamais bloquant.
    purgeExpiredTripAudio(supabase)
      .then((r) => {
        if (r.deleted > 0) console.log(`[data-cleanup] trip_audio expirés supprimés : ${r.deleted}`);
      })
      .catch(() => undefined);
    return {
      ran: true,
      locationsDeleted: row.locations_deleted ?? 0,
      proposalsExpired: row.proposals_expired ?? 0,
      inactiveAccounts: row.inactive_accounts ?? 0,
      runAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[data-cleanup]', err);
    return cleanupNotRun();
  }
}

export interface DataCleanupLogEntry {
  id: string;
  runAt: string;
  locationsDeleted: number;
  proposalsExpired: number;
  inactiveAccounts: number;
}

/** Dernier nettoyage journalisé (admin). null si la table n'existe
 *  pas (migration v2.26 non appliquée) ou si aucun passage n'a eu
 *  lieu. */
export async function getLatestDataCleanup(
  supabase: SupabaseClient
): Promise<DataCleanupLogEntry | null> {
  try {
    const { data, error } = await supabase
      .from('data_cleanups')
      .select('id, run_at, locations_deleted, proposals_expired, inactive_accounts')
      .order('run_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return null;
    const row = data as {
      id: string;
      run_at: string;
      locations_deleted: number;
      proposals_expired: number;
      inactive_accounts: number;
    };
    return {
      id: row.id,
      runAt: row.run_at,
      locationsDeleted: row.locations_deleted ?? 0,
      proposalsExpired: row.proposals_expired ?? 0,
      inactiveAccounts: row.inactive_accounts ?? 0,
    };
  } catch {
    return null;
  }
}
