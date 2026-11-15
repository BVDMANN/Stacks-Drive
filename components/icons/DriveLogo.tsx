/**
 * DriveLogo — le logo officiel Stacks Drive (v2.52).
 *
 * Le logo officiel (reçu 15/11) : un « S » blanc + violet traversé
 * par une route (marquages jaune/vert/bleu — les couleurs du Gabon),
 * une voiture de face, « StacksDrive® » et « VTC • GABON », sur fond
 * sombre avec une bordure carrée arrondie violette lumineuse.
 *
 * Le S ci-dessous est un retracé fidèle de celui du logo (mêmes
 * barres, même violet, même courbe de route), simplifié pour les
 * petites tailles : pas de voiture, pas de texte. Le violet du S
 * est mesuré sur le fichier du logo : #A139FA au centre de la
 * barre — valeur canonique retenue : #A134F5.
 *
 * Usages :
 *  - DriveSMark : le S seul (en-tête, petites tailles).
 *  - LogoLoader : le S qui se remplit (tous les chargements de
 *    l'appli, règle n°1 : un indicateur visible partout où il y
 *    a une attente). `progress` (0-1) = remplissage réel quand il
 *    existe, sinon animation de remplissage en boucle.
 *  - Le logo complet (PNG) : écrans de connexion/inscription,
 *    pied de page, favicon — via next/image, /logo-stacks-drive.png.
 */

import { useId } from 'react';

export const DRIVE_BRAND_VIOLET = '#A134F5';
export const DRIVE_BRAND_VIOLET_LIGHT = '#C78CFA';
export const DRIVE_BRAND_VIOLET_DEEP = '#7E22CE';

/** Les trois barres du S + la route, dans un viewBox 0 0 570 400
 *  (même repère que le recadrage du logo, pour comparer 1:1). */
export function SPaths() {
  return (
    <>
      {/* Barre haute — blanche */}
      <path
        fill="#FFFFFF"
        d="M 38 210 C 30 175, 32 150, 45 130 C 90 70, 180 15, 300 8 L 512 8 L 468 78 L 210 95 C 170 100, 140 125, 120 150 C 95 180, 60 200, 38 210 Z"
      />
      {/* Barre du milieu — violette, avec le crochet qui descend */}
      <path
        fill={DRIVE_BRAND_VIOLET}
        d="M 98 182 L 148 132 L 398 132 C 452 132, 480 168, 472 214 C 466 250, 458 274, 448 292 L 434 292 C 442 258, 440 224, 420 208 L 140 208 Z"
      />
      {/* Barre basse — blanche, effilée vers la droite */}
      <path
        fill="#FFFFFF"
        d="M 2 318 L 2 234 C 60 228, 150 228, 220 230 L 336 234 L 150 318 Z"
      />
      {/* Route : liserés blancs + marquages jaune/vert/bleu */}
      <path fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" d="M 345 214 C 390 214, 430 218, 462 228" />
      <path fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" d="M 298 306 C 345 304, 405 296, 448 286" />
      <path fill="#0E9F5B" d="M 232 302 L 288 300 L 300 318 L 244 320 Z" />
      <path fill="#F2C200" d="M 330 266 L 392 262 L 382 284 L 320 288 Z" />
      <path fill="#2B7DE9" d="M 412 230 L 436 228 L 430 246 L 406 248 Z" />
    </>
  );
}

/** Le S seul, fidèle au logo. `size` = largeur en px. */
export function DriveSMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 570 400"
      width={size}
      height={(size * 400) / 570}
      className={className}
      role="img"
      aria-label="Stacks Drive"
    >
      <SPaths />
    </svg>
  );
}

/**
 * LogoLoader — le S qui se remplit.
 *
 * - Sans `progress` : le remplissage monte en boucle (1,6 s), comme
 *   un « je réfléchis » ; le S fantôme reste visible en dessous.
 * - Avec `progress` (0 à 1) : le remplissage suit la progression
 *   réelle, sans boucle.
 * Le S reste reconnaissable même en petit (20 px) : barres épaisses,
 * violet franc.
 */
export function LogoLoader({
  size = 64,
  progress,
  label,
  className,
}: {
  size?: number;
  progress?: number;
  label?: string;
  className?: string;
}) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = progress === undefined ? undefined : Math.min(1, Math.max(0, progress));
  return (
    <span
      className={`logo-loader ${className ?? ''}`}
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Chargement'}
    >
      <svg
        viewBox="0 0 570 400"
        width={size}
        height={(size * 400) / 570}
        aria-hidden="true"
      >
        {/* S fantôme — le contour à remplir */}
        <g opacity={0.16}>
          <SPaths />
        </g>
        {/* S rempli — clip animé (boucle) ou piloté par progress */}
        <g
          className={p === undefined ? 'logo-loader-fill' : undefined}
          style={
            p !== undefined
              ? { clipPath: `inset(${(1 - p) * 100}% 0 0 0)` }
              : undefined
          }
        >
          <SPaths />
        </g>
      </svg>
      {label ? <span className="logo-loader-label">{label}</span> : null}
    </span>
  );
}
