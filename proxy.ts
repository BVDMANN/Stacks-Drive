import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/** Next.js 16 : le middleware s'appelle désormais « proxy ».
 *  Il rafraîchit la session Supabase et protège les pages privées. */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
