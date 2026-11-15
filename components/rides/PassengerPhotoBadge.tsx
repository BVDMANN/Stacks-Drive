'use client';

import { useEffect, useState } from 'react';

/** Photo du passager, pour le chauffeur assigné UNIQUEMENT pendant
 *  la course (v2.49, règle v2.20). L'API
 *  /api/rides/[id]/passenger-photo refuse tout le reste (403) —
 *  le composant n'affiche alors rien : pas de photo, pas de
 *  placeholder, pas d'erreur. */

export function PassengerPhotoBadge({ rideId }: { rideId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rides/${rideId}/passenger-photo`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && d?.url) setUrl(d.url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Photo du passager"
      className="w-14 h-14 rounded-full object-cover border-2 border-stacks-green shrink-0"
    />
  );
}
