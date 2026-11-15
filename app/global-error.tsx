'use client';

import Link from 'next/link';
import { Car, RefreshCw } from 'lucide-react';

/** Erreur globale (v2.2) : même message de marque que app/error.tsx,
 *  pour les pannes qui touchent toute l'appli (ex : Supabase injoignable).
 *  Doit être autonome (pas de layout partagé). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          background: '#17112E',
          color: '#F4F6FF',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif",
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 16,
            background: '#FF4D8D',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#17112E',
          }}
        >
          <Car size={32} />
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: '24px 0 0' }}>
          Service momentanément indisponible
        </h1>
        <p style={{ color: '#94A3B8', maxWidth: 480, lineHeight: 1.6 }}>
          Quelque chose n’a pas fonctionné de notre côté. Tes courses et tes
          gains sont en sécurité — réessaie dans quelques instants.
        </p>
        {error?.digest && (
          <p style={{ color: '#64748B', fontSize: 12 }}>Référence : {error.digest}</p>
        )}
        <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 24px',
              borderRadius: 999,
              background: '#FF4D8D',
              color: '#17112E',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} /> Réessayer
          </button>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 24px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.1)',
              color: '#F4F6FF',
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            Retour à l’accueil
          </Link>
        </div>
        <p style={{ color: '#64748B', fontSize: 12, marginTop: 24 }}>
          Le problème persiste ? Écris à Stacks Drive : stacks.markett@gmail.com
        </p>
      </body>
    </html>
  );
}
