/** Règlements hebdo + rapport hebdo (v2.15) — types et helpers de dates
 *  partagés (client + serveur). Aucun import serveur ici : ce fichier
 *  peut être importé par des composants clients. Les lectures et calculs
 *  serveur vivent dans lib/settlements.ts.
 */

export type WeeklySettlementStatus = 'genere' | 'declare' | 'valide';
export type DeclarationStatus = 'declare' | 'valide' | 'refuse';

export interface WeeklySettlement {
  id: string;
  driverId: string;
  driverName: string | null;
  weekStart: string; // lundi, YYYY-MM-DD
  weekEnd: string; // dimanche, YYYY-MM-DD
  ridesCount: number;
  faresTotal: number;
  commissionDue: number;
  debtTotal: number;
  depositPaid: boolean;
  status: WeeklySettlementStatus;
  createdAt: string;
  /** E-mail récap hebdo envoyé au chauffeur (v2.24) — null si la
   *  colonne n'existe pas encore (migration non appliquée). */
  emailSent?: boolean | null;
}

export interface SettlementDeclaration {
  id: string;
  weeklySettlementId: string | null;
  driverId: string;
  driverName: string | null;
  amount: number;
  method: string;
  reference: string | null;
  status: DeclarationStatus;
  createdAt: string;
  validatedAt: string | null;
}

export interface WeeklyReport {
  id: string;
  weekStart: string;
  weekEnd: string;
  ridesCount: number;
  commissionTotal: number;
  newDrivers: number;
  openDisputes: number;
  alerts: WeeklyAlert[];
  emailSent: boolean;
  createdAt: string;
}

export interface WeeklyAlert {
  type: 'debt_cap' | 'old_debt' | 'stale_dispute' | 'no_deposit';
  driverId?: string;
  driverName?: string | null;
  disputeId?: string;
  label: string;
}

/** Lundi de la semaine de `date` (heure de Libreville), YYYY-MM-DD. */
export function librevilleMonday(date = new Date()): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Libreville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '01';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  const d = new Date(`${day}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - dow);
  return monday.toISOString().slice(0, 10);
}

/** Lundi de la semaine DERNIÈRE (terminée) + son dimanche. */
export function lastCompletedWeek(date = new Date()): { weekStart: string; weekEnd: string } {
  const monday = librevilleMonday(date);
  const start = new Date(`${monday}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10),
  };
}

/** Libellé français d'une semaine (« semaine du 10 au 16 nov. 2026 »). */
export function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
      new Date(`${iso}T12:00:00Z`)
    );
  const year = weekStart.slice(0, 4);
  return `semaine du ${fmt(weekStart)} au ${fmt(weekEnd)} ${year}`;
}
