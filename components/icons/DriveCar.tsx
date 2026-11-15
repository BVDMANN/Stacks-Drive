'use client';

import { useId } from 'react';

/** Voitures dessinées Drive (v2.52) — le langage visuel signature.
 *
 *  Ce ne sont plus des pictogrammes plats : chaque voiture est DESSINÉE
 *  — carrosserie en dégradé avec bande de reflet spéculaire, vitres
 *  avec reflets diagonaux, phare LED + faisceau lumineux (le
 *  « Faisceau Drive », élément signature n°1), calandre à lamelles,
 *  rétroviseur, poignées et lignes de portes, jantes détaillées à
 *  5 branches avec moyeu rose, ombre portée + lueur rose au sol.
 *
 *  Un seul langage, trois tailles : XL (cartes de classes), M (marqueurs
 *  carte, via les chaînes SVG exportées plus bas — sans `url(#…)` pour
 *  rester autonomes dans le HTML Leaflet), S (miniatures, historique,
 *  propositions). La palette « Nuit violette » est la seule utilisée :
 *  rose #FF4D8D (Solo/Confort), sarcelle #2FD6C8 (Groupe), corail
 *  #FF5F6D (feux arrière), nuit #17112E (vitres, pneus).
 *
 *  Les `id` de dégradés sont uniques par instance (`useId`) : plusieurs
 *  berlines peuvent coexister sur la même page sans conflit.
 */

export type DriveCarVariant = 'sedan' | 'hatch' | 'moto';

const BODY_GRADIENTS = {
  sedan: ['#FF9EC2', '#FF4D8D', '#D6336C'],
  hatch: ['#8CEFE4', '#2FD6C8', '#0E9F94'],
  moto: ['#FF9EC2', '#FF4D8D', '#D6336C'],
} as const;

/** Arrondi à 2 décimales — les coordonnées calculées (trigonométrie
 *  des jantes, ombres) doivent être IDENTIQUES côté serveur et côté
 *  client, sinon React signale un défaut d'hydratation (le serveur
 *  sérialise le flottant complet, le client l'arrondit). */
const r2 = (n: number) => Math.round(n * 100) / 100;

function Wheel({ cx, cy, r, id }: { cx: number; cy: number; r: number; id: string }) {
  const spokes = [0, 72, 144, 216, 288].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const x2 = r2(cx + Math.cos(rad) * (r - 3.4));
    const y2 = r2(cy + Math.sin(rad) * (r - 3.4));
    return <line key={deg} x1={cx} y1={cy} x2={x2} y2={y2} stroke="#E8E6F0" strokeWidth="1.7" strokeLinecap="round" />;
  });
  return (
    <g>
      {/* Pneu */}
      <circle cx={cx} cy={cy} r={r} fill="#17112E" stroke="#453A6B" strokeWidth="1" />
      {/* Reflet sur le pneu */}
      <path
        d={`M ${r2(cx - r * 0.62)} ${r2(cy - r * 0.55)} A ${r2(r * 0.85)} ${r2(r * 0.85)} 0 0 1 ${r2(cx - r * 0.1)} ${r2(cy - r * 0.82)}`}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Disque de frein + jante */}
      <circle cx={cx} cy={cy} r={r - 3.6} fill="#2A1D55" />
      <circle cx={cx} cy={cy} r={r - 3.6} fill={`url(#${id}-rim)`} opacity="0.9" />
      {spokes}
      {/* Moyeu rose */}
      <circle cx={cx} cy={cy} r="2.3" fill="#FF4D8D" stroke="#FFD9E8" strokeWidth="0.7" />
    </g>
  );
}

function GroundShadow({ cx, rx, beam }: { cx: number; rx: number; beam: boolean }) {
  return (
    <g>
      <ellipse cx={cx} cy="59" rx={rx} ry="3.2" fill="rgba(0,0,0,0.45)" />
      <ellipse cx={cx} cy="59.5" rx={r2(rx * 0.78)} ry="1.8" fill="rgba(255,77,141,0.28)" />
      {beam && <ellipse cx={r2(cx + rx * 0.72)} cy="59" rx={r2(rx * 0.3)} ry="1.6" fill="rgba(255,255,255,0.22)" />}
    </g>
  );
}

/** Berline élancée — Solo et Confort. Face à droite (avant à droite). */
export function SedanIllustration({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bodyId = `sedan-body-${uid}`;
  const glassId = `sedan-glass-${uid}`;
  const beamId = `sedan-beam-${uid}`;
  const rimId = `sedan-rim-${uid}`;
  return (
    <svg viewBox="0 0 160 64" className={className ?? 'w-full h-auto'} role="img" aria-label="Berline">
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF9EC2" />
          <stop offset="45%" stopColor="#FF4D8D" />
          <stop offset="100%" stopColor="#D6336C" />
        </linearGradient>
        <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A3A8C" />
          <stop offset="100%" stopColor="#17112E" />
        </linearGradient>
        <linearGradient id={beamId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <radialGradient id={rimId} cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#7C8698" />
        </radialGradient>
      </defs>
      <GroundShadow cx={80} rx={64} beam />
      {/* Faisceau du phare — le « Faisceau Drive » : il sort du cadre. */}
      <polygon points="149,39 160,35 160,47 149,44" fill={`url(#${beamId})`} />
      {/* Carrosserie */}
      <path
        d="M12 50 L10 44 Q10 40 16 38 L28 35 Q40 33 48 26 L54 20 Q57 17 62 17 L98 17 Q104 17 108 21 L122 32 Q124 34 128 34 L142 37 Q149 39 149 44 L149 48 Q149 51 146 51 L131.5 51 A13.5 13.5 0 0 0 104.5 51 L59.5 51 A13.5 13.5 0 0 0 32.5 51 L15 51 Q12 51 12 50 Z"
        fill={`url(#${bodyId})`}
      />
      {/* Vitres : lunette + latérales, avec reflets diagonaux */}
      <path d="M56 22 L62 20 L96 20 Q102 20 105 23 L114 31 L58 31 Z" fill={`url(#${glassId})`} />
      <path d="M66 20.5 L72 20.5 L70 30.5 L64 30.5 Z" fill="rgba(255,255,255,0.5)" />
      <path d="M78 20.5 L83 20.5 L81 30.5 L76 30.5 Z" fill="rgba(255,255,255,0.28)" />
      {/* Montant central */}
      <path d="M74 20.5 L76 20.5 L76 30.5 L74 30.5 Z" fill="rgba(23,17,46,0.6)" />
      {/* Bande de reflet spéculaire sur la carrosserie */}
      <path d="M18 38 C50 34 110 34 144 39" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 40.5 C52 37 108 37 140 41" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeLinecap="round" />
      {/* Liseré sarcelle bas de caisse */}
      <path d="M34 49.5 L103 49.5" stroke="#2FD6C8" strokeWidth="1" strokeLinecap="round" opacity="0.45" />
      {/* Lignes de portes + poignées */}
      <path d="M66 33 L64 49 M104 33 L106 49" fill="none" stroke="rgba(23,17,46,0.28)" strokeWidth="1" />
      <rect x="72" y="35.5" width="8" height="2.2" rx="1.1" fill="rgba(23,17,46,0.4)" />
      <rect x="110" y="35.5" width="8" height="2.2" rx="1.1" fill="rgba(23,17,46,0.4)" />
      {/* Rétroviseur */}
      <path d="M57 29 Q54 28 54 31 Q54 33 57 33 L60 33 L60 29 Z" fill="#B32A5E" />
      {/* Calandre à lamelles */}
      <path d="M136 44 L148 44 L148 47.5 Q148 49 146 49 L138 49 Q136 49 136 47 Z" fill="#17112E" opacity="0.85" />
      <path d="M138 45.5 L146 45.5 M138 47.2 L146 47.2" stroke="#FF7EB0" strokeWidth="0.8" opacity="0.8" />
      {/* Phare LED + halo */}
      <circle cx="143" cy="41" r="4.5" fill="rgba(255,255,255,0.55)" />
      <path d="M133 38.5 L146 39.5 Q149 40 149 42 L146 44 L133 43 Z" fill="#FFFFFF" />
      <path d="M136 40.5 L144 41" stroke="#FFD9E8" strokeWidth="1.4" strokeLinecap="round" />
      {/* Feu arrière corail */}
      <path d="M11 41 Q10 44 13 44.5 L19 44.5 L19 41.5 L13 40.5 Z" fill="#FF5F6D" />
      <circle cx="13" cy="42.5" r="2.2" fill="rgba(255,255,255,0.5)" />
      {/* Roues détaillées */}
      <Wheel cx={46} cy={50} r={11.5} id={rimId} />
      <Wheel cx={118} cy={50} r={11.5} id={rimId} />
    </svg>
  );
}

/** Citadine compacte — Groupe (partagée). Même langage, toit plus haut. */
export function HatchIllustration({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bodyId = `hatch-body-${uid}`;
  const glassId = `hatch-glass-${uid}`;
  const beamId = `hatch-beam-${uid}`;
  const rimId = `hatch-rim-${uid}`;
  return (
    <svg viewBox="0 0 150 64" className={className ?? 'w-full h-auto'} role="img" aria-label="Citadine">
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8CEFE4" />
          <stop offset="45%" stopColor="#2FD6C8" />
          <stop offset="100%" stopColor="#0E9F94" />
        </linearGradient>
        <linearGradient id={glassId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A3A8C" />
          <stop offset="100%" stopColor="#17112E" />
        </linearGradient>
        <linearGradient id={beamId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <radialGradient id={rimId} cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#7C8698" />
        </radialGradient>
      </defs>
      <GroundShadow cx={75} rx={58} beam />
      {/* Faisceau du phare */}
      <polygon points="139,39 150,35 150,47 139,44" fill={`url(#${beamId})`} />
      {/* Carrosserie */}
      <path
        d="M12 50 L10 43 Q10 39 15 37 L26 34 L36 22 Q39 18 44 18 L92 18 Q98 18 102 22 L112 31 Q114 33 118 33 L136 36 Q145 38 145 44 L145 48 Q145 51 142 51 L123.5 51 A13.5 13.5 0 0 0 96.5 51 L55.5 51 A13.5 13.5 0 0 0 28.5 51 L15 51 Q12 51 12 50 Z"
        fill={`url(#${bodyId})`}
      />
      {/* Vitres avec reflets */}
      <path d="M42 22 L48 20 L88 20 Q93 20 96 23 L104 31 L46 31 Z" fill={`url(#${glassId})`} />
      <path d="M54 20.5 L59 20.5 L57 30.5 L52 30.5 Z" fill="rgba(255,255,255,0.5)" />
      <path d="M64 20.5 L68 20.5 L66 30.5 L62 30.5 Z" fill="rgba(255,255,255,0.28)" />
      <path d="M60 20.5 L62 20.5 L62 30.5 L60 30.5 Z" fill="rgba(23,17,46,0.6)" />
      {/* Bande de reflet spéculaire */}
      <path d="M18 38 C46 34 100 34 134 39" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22 40.5 C48 37 98 37 130 41" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1" strokeLinecap="round" />
      {/* Liseré rose bas de caisse */}
      <path d="M30 49.5 L95 49.5" stroke="#FF4D8D" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
      {/* Lignes de portes + poignées */}
      <path d="M58 33 L56 49 M94 33 L96 49" fill="none" stroke="rgba(23,17,46,0.28)" strokeWidth="1" />
      <rect x="63" y="35.5" width="7" height="2.2" rx="1.1" fill="rgba(23,17,46,0.4)" />
      <rect x="99" y="35.5" width="7" height="2.2" rx="1.1" fill="rgba(23,17,46,0.4)" />
      {/* Rétroviseur */}
      <path d="M45 29 Q42 28 42 31 Q42 33 45 33 L48 33 L48 29 Z" fill="#0B7A70" />
      {/* Calandre + phare LED */}
      <path d="M126 44 L138 44 L138 47.5 Q138 49 136 49 L128 49 Q126 49 126 47 Z" fill="#17112E" opacity="0.85" />
      <path d="M128 45.5 L136 45.5 M128 47.2 L136 47.2" stroke="#7FE8DD" strokeWidth="0.8" opacity="0.8" />
      <circle cx="133" cy="41" r="4.5" fill="rgba(255,255,255,0.55)" />
      <path d="M123 38.5 L136 39.5 Q139 40 139 42 L136 44 L123 43 Z" fill="#FFFFFF" />
      <path d="M126 40.5 L134 41" stroke="#D9FFF8" strokeWidth="1.4" strokeLinecap="round" />
      {/* Feu arrière corail */}
      <path d="M11 41 Q10 44 13 44.5 L19 44.5 L19 41.5 L13 40.5 Z" fill="#FF5F6D" />
      <circle cx="13" cy="42.5" r="2.2" fill="rgba(255,255,255,0.5)" />
      {/* Roues détaillées */}
      <Wheel cx={42} cy={50} r={11.5} id={rimId} />
      <Wheel cx={110} cy={50} r={11.5} id={rimId} />
    </svg>
  );
}

/** Moto détaillée — chauffeurs moto (Solo uniquement). Face à droite. */
export function MotoIllustration({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const bodyId = `moto-body-${uid}`;
  const beamId = `moto-beam-${uid}`;
  const rimId = `moto-rim-${uid}`;
  return (
    <svg viewBox="0 0 120 64" className={className ?? 'w-full h-auto'} role="img" aria-label="Moto">
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF7EB0" />
          <stop offset="55%" stopColor="#FF4D8D" />
          <stop offset="100%" stopColor="#D6336C" />
        </linearGradient>
        <linearGradient id={beamId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0.75)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <radialGradient id={rimId} cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="55%" stopColor="#CBD5E1" />
          <stop offset="100%" stopColor="#7C8698" />
        </radialGradient>
      </defs>
      <GroundShadow cx={60} rx={48} beam />
      {/* Faisceau du phare */}
      <polygon points="104,30 120,26 120,36 104,33" fill={`url(#${beamId})`} />
      {/* Fourche + guidon */}
      <path d="M92 24 L84 44" stroke="#CBD5E1" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M88 20 L96 24" stroke="#E8E6F0" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="88" cy="20" r="2" fill="#17112E" stroke="#E8E6F0" strokeWidth="1" />
      {/* Rétroviseur */}
      <path d="M86 20 L82 13" stroke="#CBD5E1" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="81" cy="12" rx="3" ry="2" fill="#2A1D55" stroke="#E8E6F0" strokeWidth="0.8" />
      {/* Carénage avant + réservoir + selle + arrière */}
      <path
        d="M94 26 L100 24 Q106 25 105 30 L102 36 L88 38 L86 30 Q87 26 94 26 Z"
        fill={`url(#${bodyId})`}
      />
      <path d="M96 27 L103 27 L101 33 L95 33 Z" fill="rgba(255,255,255,0.45)" />
      <path d="M62 28 Q70 24 80 27 L86 32 L78 36 L64 34 Q60 31 62 28 Z" fill={`url(#${bodyId})`} />
      <path d="M66 28 L76 28" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M40 32 L62 30 L60 37 L38 38 Q34 35 40 32 Z" fill="#201646" />
      <path d="M24 36 L40 34 L38 39 L22 40 Q18 38 24 36 Z" fill={`url(#${bodyId})`} />
      {/* Phare + feu arrière */}
      <circle cx="101" cy="30" r="3.4" fill="#FFFFFF" />
      <circle cx="101" cy="30" r="5.5" fill="rgba(255,255,255,0.35)" />
      <circle cx="20" cy="37" r="2" fill="#FF5F6D" />
      {/* Échappement */}
      <path d="M52 44 L82 44 Q88 44 88 47 Q88 50 82 50 L54 50 Q50 50 50 47 Q50 44 52 44 Z" fill="#3A3454" />
      <path d="M54 46 L84 46" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="86" cy="47" r="2.6" fill="#17112E" stroke="#CBD5E1" strokeWidth="1" />
      {/* Cadre */}
      <path d="M60 36 L84 44 M44 38 L60 36" stroke="#453A6B" strokeWidth="2" strokeLinecap="round" />
      {/* Roues détaillées */}
      <Wheel cx={28} cy={50} r={11} id={rimId} />
      <Wheel cx={92} cy={50} r={11} id={rimId} />
    </svg>
  );
}

/** Illustration par variante (cartes de classes, fiches chauffeur…). */
export function DriveCarIllustration({ variant, className }: { variant: DriveCarVariant; className?: string }) {
  if (variant === 'hatch') return <HatchIllustration className={className} />;
  if (variant === 'moto') return <MotoIllustration className={className} />;
  return <SedanIllustration className={className} />;
}

/** Marque Drive (en-tête, pied de page) : la berline détaillée en
 *  miniature, dans un disque rose verni — pas un pictogramme plat.
 *  Remplace le carré rose + Lucide `Car` (v2.52). Le vrai logo reste
 *  à fournir par le propriétaire ; ceci est la marque d'interface. */
export function DriveMark({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const discId = `mark-disc-${uid}`;
  return (
    <svg viewBox="0 0 48 48" className={className ?? 'w-9 h-9'} role="img" aria-label="Stacks Drive">
      <defs>
        <linearGradient id={discId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF7EB0" />
          <stop offset="55%" stopColor="#FF4D8D" />
          <stop offset="100%" stopColor="#D6336C" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${discId})`} />
      {/* Reflet verni en haut du disque */}
      <path d="M8 10 Q24 4 40 10" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M10 14 Q24 9 38 14" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.4" strokeLinecap="round" />
      {/* Berline miniature, nuit, phare blanc */}
      <g>
        <path
          d="M9 31 L8.5 28 Q8.5 26.5 10.5 26 L15 25 Q18 24.5 20 22.5 L22 20.5 Q23 19.5 25 19.5 L33 19.5 Q35 19.5 36.5 21 L39.5 24 Q40 24.5 41 24.5 L43.5 25.5 Q44.5 26 44.5 27.5 L44.5 29 Q44.5 30.5 43 30.5 L40 30.5 A4.5 4.5 0 0 0 31 30.5 L20 30.5 A4.5 4.5 0 0 0 11 30.5 L10 30.5 Q9 30.5 9 31 Z"
          fill="#17112E"
        />
        <path d="M23 21 L25.5 20.5 L32.5 20.5 Q34 20.5 35 21.5 L37 24 L24 24 Z" fill="#4A3A8C" />
        <path d="M26 20.8 L28 20.8 L27.4 23.8 L25.6 23.8 Z" fill="rgba(255,255,255,0.6)" />
        <circle cx="42" cy="27" r="1.6" fill="#FFFFFF" />
        <path d="M9.5 26.5 L43 26.5" stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" strokeLinecap="round" />
        <circle cx="15.5" cy="30.5" r="3.4" fill="#17112E" stroke="#E8E6F0" strokeWidth="1" />
        <circle cx="15.5" cy="30.5" r="1.2" fill="#FF4D8D" />
        <circle cx="35.5" cy="30.5" r="3.4" fill="#17112E" stroke="#E8E6F0" strokeWidth="1" />
        <circle cx="35.5" cy="30.5" r="1.2" fill="#FF4D8D" />
      </g>
    </svg>
  );
}

/** Miniature voiture/moto (puces de filtre, listes) : la version
 *  marqueur, en React. `tone="light"` = carrosserie claire, pour
 *  les fonds nuit (la version sombre est faite pour les pastilles
 *  roses des marqueurs). */
export function DriveCarMini({ variant, size = 16, tone = 'dark', className }: { variant: 'sedan' | 'moto'; size?: number; tone?: 'dark' | 'light'; className?: string }) {
  const base = variant === 'moto' ? DRIVE_MOTO_MARKER_SVG : DRIVE_CAR_MARKER_SVG;
  const svg =
    tone === 'light'
      ? base.replaceAll('#17112E', '#F4F6FF').replaceAll('#4A3A8C', '#8B7FD4').replaceAll('rgba(0,0,0,0.35)', 'rgba(0,0,0,0.25)')
      : base;
  return (
    <span
      className={`inline-flex shrink-0 [&>svg]:h-full [&>svg]:w-full ${className ?? ''}`}
      style={{ width: size, height: size }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
      aria-hidden="true"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Chaînes SVG autonomes pour Leaflet (divIcon HTML) — v2.52.        */
/*  Aucun `url(#…)` : les dégradés sont remplacés par des aplats +     */
/*  reflets en opacité, pour que la même chaîne puisse être répétée    */
/*  dans des dizaines de marqueurs sans conflit d'identifiant.        */
/* ------------------------------------------------------------------ */

/** Voiture détaillée 20 px — glyph des marqueurs chauffeurs (v2.52).
 *  Remplace le trait Lucide `car` : carrosserie rose pleine, vitre
 *  nuit avec reflet, phare blanc, jantes à branches, ombre. */
export const DRIVE_CAR_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24"><ellipse cx="12" cy="20" rx="9" ry="1.6" fill="rgba(0,0,0,0.35)"/><path d="M2.5 15.5 L2 13.5 Q2 12.5 3 12.2 L5 11.5 Q6.5 11.2 7.5 10 L8.8 8.6 Q9.4 8 10.4 8 L15.5 8 Q16.5 8 17.2 8.8 L18.8 10.5 Q19 10.8 19.6 10.9 L21 11.4 Q22 11.7 22 12.8 L22 14 Q22 15 21 15 L19.6 15 A2.6 2.6 0 0 0 14.4 15 L9.6 15 A2.6 2.6 0 0 0 4.4 15 L3.5 15 Q2.5 15.5 2.5 15.5 Z" fill="#17112E"/><path d="M9 9.2 L10.2 8.6 L14.8 8.6 Q15.6 8.6 16 9.2 L17 10.8 L9.6 10.8 Z" fill="#4A3A8C"/><path d="M10.6 8.8 L11.6 8.8 L11.2 10.6 L10.4 10.6 Z" fill="rgba(255,255,255,0.7)"/><path d="M3.5 12.6 L20.5 12.6" stroke="rgba(255,255,255,0.45)" stroke-width="0.7" stroke-linecap="round"/><circle cx="21" cy="13.2" r="0.9" fill="#FFFFFF"/><circle cx="7" cy="15" r="2.6" fill="#17112E" stroke="#E8E6F0" stroke-width="0.8"/><circle cx="7" cy="15" r="0.9" fill="#FF4D8D"/><circle cx="17" cy="15" r="2.6" fill="#17112E" stroke="#E8E6F0" stroke-width="0.8"/><circle cx="17" cy="15" r="0.9" fill="#FF4D8D"/><path d="M7 12.6 L7 17.4 M4.8 15 L9.2 15 M17 12.6 L17 17.4 M14.8 15 L19.2 15" stroke="#E8E6F0" stroke-width="0.6"/></svg>`;

/** Moto détaillée 21 px — glyph des marqueurs chauffeurs moto. */
export const DRIVE_MOTO_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="21" height="21" viewBox="0 0 24 24"><ellipse cx="12" cy="20" rx="8.5" ry="1.5" fill="rgba(0,0,0,0.35)"/><path d="M17.5 8.5 L18.5 8.5 Q20 8.8 19.6 10 L19 11.5 L16.5 12 L16 10 Q16.2 8.8 17.5 8.5 Z" fill="#17112E"/><path d="M11 9.5 Q13 8.8 14.5 9.5 L16 11 L13.5 12 L11.5 11 Q10.8 10.2 11 9.5 Z" fill="#17112E"/><path d="M7 11.5 L11 10.8 L10.8 12.6 L6.8 13 Q6 12.4 7 11.5 Z" fill="#17112E"/><path d="M16.5 7 L18 8" stroke="#E8E6F0" stroke-width="0.9" stroke-linecap="round"/><circle cx="18.6" cy="10" r="1" fill="#FFFFFF"/><path d="M5 15 L15 15" stroke="#E8E6F0" stroke-width="0.9" stroke-linecap="round"/><circle cx="5" cy="16.5" r="2.8" fill="#17112E" stroke="#E8E6F0" stroke-width="0.9"/><circle cx="5" cy="16.5" r="1" fill="#FF4D8D"/><circle cx="17.5" cy="16.5" r="2.8" fill="#17112E" stroke="#E8E6F0" stroke-width="0.9"/><circle cx="17.5" cy="16.5" r="1" fill="#FF4D8D"/><path d="M5 14 L5 19 M2.5 16.5 L7.5 16.5 M17.5 14 L17.5 19 M15 16.5 L20 16.5" stroke="#E8E6F0" stroke-width="0.6"/></svg>`;

/** Épingle de destination détaillée — tête vernie rose, anneau
 *  sarcelle, point nuit, reflet blanc. Remplace le Lucide `map-pin`. */
export const DRIVE_PIN_MARKER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36"><ellipse cx="18" cy="33" rx="8" ry="2" fill="rgba(0,0,0,0.4)"/><path d="M18 2 C10 2 5 8 5 14 C5 22 18 32 18 32 C18 32 31 22 31 14 C31 8 26 2 18 2 Z" fill="#FF4D8D"/><path d="M9 8 Q13 4.5 18 4.5" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="2" stroke-linecap="round"/><circle cx="18" cy="14" r="6.5" fill="#17112E" stroke="#2FD6C8" stroke-width="1.6"/><circle cx="18" cy="14" r="2.6" fill="#FFD9E8"/></svg>`;
