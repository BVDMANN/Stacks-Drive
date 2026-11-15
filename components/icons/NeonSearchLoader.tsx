/**
 * NeonSearchLoader — l'attente de recherche de chauffeur (v2.52).
 *
 * Recréé en CSS/SVG d'après l'animation néon envoyée par le
 * propriétaire (GIF, 15/11) — PAS le GIF lui-même : propre, fluide,
 * léger, boucle parfaite. Fond sombre, silhouette de voiture de
 * profil au centre, ARC NÉON VIOLET qui balaie au-dessus d'elle
 * (avec les marquages jaune/vert/bleu — les couleurs du Gabon, comme
 * la route du logo), et BARRE NÉON arrondie en dessous qui se
 * remplit pendant l'attente. Boucle : 2,4 s, tout est synchronisé
 * (l'arc balaie, la voiture s'illumine au passage du balayage, la
 * barre se remplit).
 *
 * Répartition des chargements (v2.52) : le S du logo qui se remplit
 * (LogoLoader) est le chargeur général (connexion, recherches, prix,
 * mise en ligne, switch, admin). L'animation voiture néon est
 * réservée à la RECHERCHE DE CHAUFFEUR — le moment où le passager
 * attend qu'un chauffeur accepte. Chaque chargement a UNE animation,
 * pas deux en même temps.
 */

export function NeonSearchLoader({
  width = 320,
  label,
  className,
}: {
  width?: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`neon-search ${className ?? ''}`}
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Recherche de chauffeurs…'}
    >
      <svg
        viewBox="0 0 360 150"
        width={width}
        height={(width * 150) / 360}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="neon-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#C78CFA" />
            <stop offset="55%" stopColor="#A134F5" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>
          <linearGradient id="neon-bar" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7E22CE" />
            <stop offset="55%" stopColor="#A134F5" />
            <stop offset="100%" stopColor="#C78CFA" />
          </linearGradient>
          <linearGradient id="neon-streak" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#A134F5" stopOpacity="0" />
            <stop offset="100%" stopColor="#A134F5" stopOpacity="0.8" />
          </linearGradient>
          <filter id="neon-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Arc fantôme — le dôme au-dessus de la voiture */}
        <path
          d="M 60 108 C 80 45, 130 22, 180 22 C 230 22, 280 45, 300 108"
          fill="none"
          stroke="#A134F5"
          strokeOpacity="0.3"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Balayage néon — segment lumineux qui traverse l'arc */}
        <path
          className="neon-sweep"
          d="M 60 108 C 80 45, 130 22, 180 22 C 230 22, 280 45, 300 108"
          pathLength={100}
          fill="none"
          stroke="url(#neon-sweep)"
          strokeWidth="3.5"
          strokeLinecap="round"
          filter="url(#neon-glow)"
        />
        {/* Marquages de l'arc — jaune / vert / bleu, ils s'allument
            quand le balayage passe (décalés dans la boucle). */}
        <path className="neon-dash neon-dash-yellow" d="M 225 28 Q 240 30, 252 38" fill="none" stroke="#F2C200" strokeWidth="5" strokeLinecap="round" />
        <path className="neon-dash neon-dash-green" d="M 258 44 Q 270 55, 278 68" fill="none" stroke="#0E9F5B" strokeWidth="5" strokeLinecap="round" />
        <path className="neon-dash neon-dash-blue" d="M 282 74 Q 288 86, 292 96" fill="none" stroke="#2B7DE9" strokeWidth="5" strokeLinecap="round" />

        {/* Voiture — silhouette de profil, sombre au repos */}
        <g>
          <path
            d="M 122 104 L 126 96 C 130 90, 140 86, 152 84 L 158 83 C 168 74, 190 70, 210 72 L 222 76 C 238 78, 250 84, 254 92 L 256 100 C 257 103, 255 105, 252 105 L 128 105 C 124 105, 122 105, 122 104 Z"
            fill="#12102A"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M 162 84 L 172 76 C 184 72, 198 72, 208 74 L 216 78 L 212 84 L 166 85 Z"
            fill="#1E1940"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
          />
          <circle cx="150" cy="105" r="9" fill="#0B0A17" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <circle cx="150" cy="105" r="3" fill="rgba(255,255,255,0.35)" />
          <circle cx="224" cy="105" r="9" fill="#0B0A17" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
          <circle cx="224" cy="105" r="3" fill="rgba(255,255,255,0.35)" />
        </g>
        {/* Voiture illuminée — phares + lueur, au passage du balayage */}
        <g className="neon-car-lit">
          <line x1="92" y1="100" x2="122" y2="100" stroke="url(#neon-streak)" strokeWidth="3" strokeLinecap="round" />
          <path
            d="M 122 104 L 126 96 C 130 90, 140 86, 152 84 L 158 83 C 168 74, 190 70, 210 72 L 222 76 C 238 78, 250 84, 254 92 L 256 100 C 257 103, 255 105, 252 105 L 128 105 C 124 105, 122 105, 122 104 Z"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinejoin="round"
            filter="url(#neon-glow)"
          />
          <circle cx="252" cy="97" r="3" fill="#FFFFFF" filter="url(#neon-glow)" />
          <circle cx="126" cy="97" r="2" fill="#FF5F6D" filter="url(#neon-glow)" />
        </g>

        {/* Barre néon — contour + remplissage qui monte */}
        <rect x="40" y="126" width="280" height="14" rx="7" fill="none" stroke="#A134F5" strokeOpacity="0.55" strokeWidth="1.5" />
        <rect className="neon-bar-fill" x="44" y="130" width="272" height="6" rx="3" fill="url(#neon-bar)" filter="url(#neon-glow)" />
      </svg>
      {label ? <span className="neon-search-label">{label}</span> : null}
    </span>
  );
}
