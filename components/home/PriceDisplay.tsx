'use client';

import { useEffect, useRef, useState } from 'react';
import { formatFcfa } from '@/lib/commission';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { cn } from '@/lib/utils';

/** Prix animé : le chiffre glisse vers la nouvelle valeur (~450 ms) et
 *  fait un petit « pop » à chaque changement d'estimation. */
export function AnimatedPrice({
  value,
  className,
  suffix,
}: {
  value: number | null;
  className?: string;
  suffix?: React.ReactNode;
}) {
  const [display, setDisplay] = useState(value ?? 0);
  const prevRef = useRef(value ?? 0);
  const [popKey, setPopKey] = useState(0);
  useEffect(() => {
    if (value === null) return;
    const from = prevRef.current;
    const to = value;
    prevRef.current = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    setPopKey((k) => k + 1);
    const start = performance.now();
    const dur = 450;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (value === null) return <span className={className}>—</span>;
  return (
    <span key={popKey} className={cn('price-pop', className)}>
      {formatFcfa(display)}
      {suffix}
    </span>
  );
}

/** Le S qui se remplit (v2.52) : pendant le (re)calcul de
 *  l'estimation, le S du logo se remplit à la place du chiffre —
 *  remplace le shimmer rose/sarcelle (v2.11). */
export function PriceSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-label="Calcul du prix…"
      role="status"
      className={cn('inline-flex items-center gap-2', className)}
    >
      <LogoLoader size={22} />
      <span className="text-sm font-bold text-slate-400">Calcul du prix…</span>
    </span>
  );
}
