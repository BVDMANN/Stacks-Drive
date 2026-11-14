/** Protection des routes cron Vercel (v2.15).
 *
 *  Vercel Cron appelle la route avec `Authorization: Bearer <CRON_SECRET>`
 *  quand la variable CRON_SECRET est définie dans le projet Vercel.
 *  Le secret n'est JAMAIS écrit en dur : il vit dans Vercel > Settings >
 *  Environment Variables (et dans .env.local en développement).
 *  Sans secret configuré, la route refuse tout appel (503).
 */

import type { NextRequest } from 'next/server';

export function requireCronSecret(request: NextRequest): { ok: true } | { ok: false; status: number; error: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: 'CRON_SECRET non configuré.' };
  }
  const header = request.headers.get('authorization') ?? '';
  if (header !== `Bearer ${secret}`) {
    return { ok: false, status: 401, error: 'Non autorisé.' };
  }
  return { ok: true };
}
