'use client';

import { useId } from 'react';

/** Icônes d'interface dessinées Drive (v2.52) — remplaçantes des
 *  traits Lucide plats sur les écrans PUBLICS (accueil, carte,
 *  course, compte, historique, auth, aide, tuto).
 *
 *  Chaque icône est DESSINÉE : formes pleines, reflets blancs,
 *  détails (aiguilles, vitres allumées, vagues, liserés), jamais
 *  un simple trait posé à la va-vite. La couleur principale est
 *  `currentColor` (les `text-*` existants continuent de marcher) ;
 *  les accents sont codés en dur (blanc, nuit #17112E, rose,
 *  sarcelle, corail). Les écrans ADMIN gardent Lucide (non
 *  visibles du public, hors périmètre du lot).
 *
 *  Convention : `size` = taille en px (défaut 20), `className`
 *  pour la couleur / le positionnement. Les `id` de dégradés sont
 *  uniques par instance (`useId`).
 */

export interface DriveIconProps {
  size?: number;
  className?: string;
}

type IconFn = (props: DriveIconProps) => React.JSX.Element;

function useGid(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

function Svg({ size = 20, className, children, label }: DriveIconProps & { children: React.ReactNode; label: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

/* ------------------------------ Lieux ------------------------------ */

/** Épingle détaillée : tête vernie, anneau sarcelle, point nuit. */
export const DrivePin: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Épingle">
    <path d="M12 2 C7 2 3.5 5.8 3.5 10.5 C3.5 16.5 12 22 12 22 C12 22 20.5 16.5 20.5 10.5 C20.5 5.8 17 2 12 2 Z" fill="currentColor" />
    <path d="M7 6 Q9.5 3.8 12 3.8" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="12" cy="10.5" r="4.2" fill="#17112E" stroke="#2FD6C8" strokeWidth="1.2" />
    <circle cx="12" cy="10.5" r="1.7" fill="#FFD9E8" />
  </Svg>
);

/** Flèche de navigation : pointe + traînée lumineuse. */
export const DriveNavigation: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Navigation">
    <path d="M12 2 L19 19 L12 15.8 L5 19 Z" fill="currentColor" />
    <path d="M12 2 L19 19 L12 15.8 Z" fill="rgba(255,255,255,0.35)" />
    <path d="M12 6 L15.5 16.5 L12 14.8 Z" fill="rgba(255,255,255,0.4)" />
    <circle cx="12" cy="11" r="1.4" fill="#17112E" opacity="0.55" />
  </Svg>
);

/** Cible de géolocalisation : anneaux + point central lumineux. */
export const DriveLocate: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Me localiser">
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="12" cy="12" r="8.5" fill="currentColor" fillOpacity="0.08" />
    <circle cx="12" cy="12" r="4.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="#FFFFFF" />
    <path d="M12 1.5 L12 4 M12 20 L12 22.5 M1.5 12 L4 12 M20 12 L22.5 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

/** Déplacement / préciser sur la carte : 4 flèches + point. */
export const DriveMove: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Déplacer">
    <path d="M12 2.5 L14.5 5.5 L12 5.5 L12 8.5 M12 21.5 L9.5 18.5 L12 18.5 L12 15.5 M2.5 12 L5.5 9.5 L5.5 12 L8.5 12 M21.5 12 L18.5 14.5 L18.5 12 L15.5 12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="#17112E" />
  </Svg>
);

/* ---------------------------- Chevrons ----------------------------- */

function Chevron({ size, className, label, rotate }: DriveIconProps & { label: string; rotate: number }) {
  return (
    <Svg size={size} className={className} label={label}>
      <g transform={`rotate(${rotate} 12 12)`}>
        <path d="M6 9.5 L12 15.5 L18 9.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 9.5 L12 15.5 L18 9.5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" transform="translate(0 -1.2)" />
      </g>
    </Svg>
  );
}

export const DriveChevronDown: IconFn = (p) => <Chevron {...p} label="Déplier" rotate={0} />;
export const DriveChevronUp: IconFn = (p) => <Chevron {...p} label="Replier" rotate={180} />;
export const DriveChevronRight: IconFn = (p) => <Chevron {...p} label="Suivant" rotate={-90} />;
export const DriveChevronLeft: IconFn = (p) => <Chevron {...p} label="Précédent" rotate={90} />;

/* ---------------------------- Statuts ------------------------------ */

/** Horloge détaillée : cadran, aiguilles, reflet, index. */
export const DriveClock: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Horloge">
    <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.9" />
    <path d="M6.5 7 Q9 4.8 12 4.8" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M12 7 L12 12 L15.8 13.8" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    <path d="M12 3.2 L12 4.6 M12 19.4 L12 20.8 M3.2 12 L4.6 12 M19.4 12 L20.8 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
  </Svg>
);

/** Coche dans un disque verni rose. */
export const DriveCheck: IconFn = ({ size, className }) => {
  const gid = useGid('check');
  return (
    <Svg size={size} className={className} label="Validé">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF7EB0" />
          <stop offset="100%" stopColor="#D6336C" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={`url(#${gid})`} />
      <path d="M6.5 5.5 Q12 3.5 17.5 5.5" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7.5 12.5 L10.8 15.8 L16.8 9" fill="none" stroke="#17112E" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

/** Badge « Vérifié » : écusson + coche + reflet. */
export const DriveCheckBadge: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Vérifié">
    <path d="M12 2 L19.5 4.8 L19.5 11 C19.5 16.5 16.2 20.3 12 22 C7.8 20.3 4.5 16.5 4.5 11 L4.5 4.8 Z" fill="currentColor" />
    <path d="M12 2 L19.5 4.8 L19.5 11 C19.5 16.5 16.2 20.3 12 22 C7.8 20.3 4.5 16.5 4.5 11 L4.5 4.8 Z" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
    <path d="M8 6 Q12 4.5 16 6" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M8.2 12.2 L11 15 L16.2 9.6" fill="none" stroke="#17112E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** Croix : traits épais arrondis + lueur. */
export const DriveX: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Fermer">
    <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M6 6 L18 18" stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeLinecap="round" />
  </Svg>
);

/** Alerte : triangle + point d'exclamation + halo. */
export const DriveAlert: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Attention">
    <path d="M12 3 L22 20.5 L2 20.5 Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M12 9.5 L12 14.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="17.4" r="1.3" fill="currentColor" />
    <path d="M8.5 5.8 L12 3.8" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Bouclier : écusson verni + coche + reflet. */
export const DriveShield: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Sécurité">
    <path d="M12 2 L19.5 4.8 L19.5 11 C19.5 16.5 16.2 20.3 12 22 C7.8 20.3 4.5 16.5 4.5 11 L4.5 4.8 Z" fill="currentColor" />
    <path d="M12 2 L19.5 4.8 L19.5 11 C19.5 16.5 16.2 20.3 12 22 C7.8 20.3 4.5 16.5 4.5 11 L4.5 4.8 Z" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
    <path d="M8 6 Q12 4.5 16 6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M8.2 12.2 L11 15 L16.2 9.6" fill="none" stroke="#17112E" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** Bouclier d'alerte : écusson + point d'exclamation. */
export const DriveShieldAlert: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Alerte sécurité">
    <path d="M12 2 L19.5 4.8 L19.5 11 C19.5 16.5 16.2 20.3 12 22 C7.8 20.3 4.5 16.5 4.5 11 L4.5 4.8 Z" fill="currentColor" />
    <path d="M8 6 Q12 4.5 16 6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M12 8.5 L12 13.5" stroke="#17112E" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="16.4" r="1.3" fill="#17112E" />
  </Svg>
);

/** Étoile pleine, facettée : reflet + ombre interne. */
export const DriveStar: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Note">
    <path d="M12 2.5 L14.8 8.6 L21.3 9.4 L16.7 14 L18 20.5 L12 17.3 L6 20.5 L7.3 14 L2.7 9.4 L9.2 8.6 Z" fill="currentColor" />
    <path d="M12 2.5 L14.8 8.6 L21.3 9.4 L16.7 14 L18 20.5 L12 17.3 Z" fill="rgba(255,255,255,0.28)" />
    <path d="M7 5.5 L9.5 8" stroke="rgba(255,255,255,0.65)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/* ---------------------------- Personnes ---------------------------- */

/** Personne : tête + épaules + reflet. */
export const DriveUser: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Passager">
    <circle cx="12" cy="8" r="4.4" fill="currentColor" />
    <path d="M9 5.5 Q10.5 3.8 12.5 4.2" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M4 20.5 Q4 14.5 12 14.5 Q20 14.5 20 20.5 Z" fill="currentColor" />
    <path d="M6.5 16.5 Q9 15 12 15" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Groupe : deux personnes, avant-plan + arrière-plan. */
export const DriveUsers: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Groupe">
    <circle cx="8.5" cy="8.5" r="3.8" fill="currentColor" opacity="0.65" />
    <path d="M2 19.5 Q2 14.8 8.5 14.8 Q10.5 14.8 11.8 15.8 L11.8 19.5 Z" fill="currentColor" opacity="0.65" />
    <circle cx="15.5" cy="8" r="4.2" fill="currentColor" />
    <path d="M13 5.5 Q14.5 3.9 16.3 4.3" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M11 20.5 Q11 14.8 15.5 14.8 Q20.5 14.8 20.5 20.5 Z" fill="currentColor" />
  </Svg>
);

/** Flocon détaillé : 6 branches + ramifications + cœur. */
export const DriveSnowflake: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Climatisation">
    <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M12 2.5 L12 21.5 M3.5 7 L20.5 17 M20.5 7 L3.5 17" />
      <path d="M12 2.5 L10 4.5 M12 2.5 L14 4.5 M12 21.5 L10 19.5 M12 21.5 L14 19.5" strokeWidth="1.3" />
      <path d="M3.5 7 L5.8 7.6 M3.5 7 L4.6 9.2 M20.5 17 L18.2 16.4 M20.5 17 L19.4 14.8" strokeWidth="1.3" />
      <path d="M20.5 7 L18.2 7.6 M20.5 7 L19.4 9.2 M3.5 17 L5.8 16.4 M3.5 17 L4.6 14.8" strokeWidth="1.3" />
    </g>
    <circle cx="12" cy="12" r="2.1" fill="currentColor" />
    <circle cx="12" cy="12" r="0.9" fill="#17112E" />
  </Svg>
);

/* --------------------------- Recherche ----------------------------- */

/** Loupe détaillée : anneau + manche + reflet dans le verre. */
export const DriveSearch: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Rechercher">
    <circle cx="11" cy="11" r="7" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="2" />
    <path d="M7.5 7.5 Q9.5 5.5 12 5.2" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M16.2 16.2 L21.5 21.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M9.5 9.5 L12.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
  </Svg>
);

/* --------------------------- Communication ------------------------- */

/** Téléphone : combiné + ondes + reflet. */
export const DrivePhone: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Téléphone">
    <path d="M5 3.5 Q4 3.5 3.6 4.6 Q2.5 8.5 5.5 13.5 Q8.5 18.5 13 20.5 Q14.5 21.2 15.6 20.5 L18 18.5 Q19 17.7 18.5 16.5 L17 14 Q16.3 13 15.2 13.4 L13.8 14 Q11.5 12.8 10 10.5 L10.6 9.2 Q11 8 10 7.3 L7.6 5.5 Q6.4 4.7 5 3.5 Z" fill="currentColor" />
    <path d="M7 6.5 Q9 5 10.5 6" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Bulle de message : bulle + points + queue. */
export const DriveMessage: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Message">
    <path d="M3.5 4.5 Q3.5 3 5 3 L19 3 Q20.5 3 20.5 4.5 L20.5 15 Q20.5 16.5 19 16.5 L12.5 16.5 L8 21 L8 16.5 L5 16.5 Q3.5 16.5 3.5 15 Z" fill="currentColor" />
    <path d="M6.5 5.5 Q12 4 17.5 5.5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="8.5" cy="10" r="1.3" fill="#17112E" />
    <circle cx="12" cy="10" r="1.3" fill="#17112E" />
    <circle cx="15.5" cy="10" r="1.3" fill="#17112E" />
  </Svg>
);

/** Envoi : avion en papier détaillé. */
export const DriveSend: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Envoyer">
    <path d="M21 3.5 L10.5 14 L21 3.5 Z" fill="currentColor" />
    <path d="M21 3.5 L14 21 L10.5 14 L21 3.5 Z" fill="currentColor" opacity="0.72" />
    <path d="M21 3.5 L10.5 14 L14 21 L21 3.5 Z" fill="rgba(255,255,255,0.3)" />
    <path d="M17 6.5 L12.5 11" stroke="#17112E" strokeWidth="1.1" strokeLinecap="round" opacity="0.5" />
  </Svg>
);

/** Clé (code PIN) : anneau + tige + dents + reflet. */
export const DriveKey: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Code PIN">
    <circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" strokeWidth="2.1" />
    <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    <path d="M11.8 11.8 L20.5 20.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M16.5 16.5 L18.5 14.5 M19 19 L21 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M5 5.5 Q6.5 3.8 8.5 3.6" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/* ----------------------------- Argent ------------------------------ */

/** Portefeuille : rabat + carte + fermoir. */
export const DriveWallet: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Portefeuille">
    <rect x="2.5" y="5.5" width="19" height="14" rx="3" fill="currentColor" />
    <path d="M2.5 8.5 L21.5 8.5" stroke="#17112E" strokeWidth="1.4" opacity="0.4" />
    <rect x="13.5" y="11" width="8" height="5.5" rx="2" fill="#17112E" />
    <circle cx="17.5" cy="13.7" r="1.2" fill="#FF4D8D" />
    <path d="M4.5 6.5 Q12 4.8 19.5 6.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M5 12.5 L10 12.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Billet : billet + cercle central + coins. */
export const DriveCash: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Espèces">
    <rect x="2" y="6" width="20" height="12" rx="2.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="12" cy="12" r="3.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.6" fill="#17112E" />
    <circle cx="5.5" cy="9.5" r="1" fill="currentColor" />
    <circle cx="18.5" cy="14.5" r="1" fill="currentColor" />
    <path d="M4 7.5 Q12 6 20 7.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
  </Svg>
);

/** Téléphone Mobile Money : écran + ondes + pièce. */
export const DriveSmartphone: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Mobile Money">
    <rect x="6.5" y="2.5" width="11" height="19" rx="2.8" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" />
    <rect x="8.5" y="5.5" width="7" height="9" rx="1" fill="currentColor" />
    <path d="M10 8 L13.5 8" stroke="#17112E" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M10 10.5 L12.5 10.5" stroke="#17112E" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    <path d="M10.5 18.5 L13.5 18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M19.5 7.5 Q21 9.5 19.5 11.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
  </Svg>
);

/** Carte bancaire (v2.55) : carte + puce + bande magnétique +
 *  lignes de numéro + reflet diagonal. */
export const DriveCreditCard: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Carte bancaire">
    <rect x="2" y="4.5" width="20" height="15" rx="3" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" />
    <path d="M2 8 L22 8" stroke="currentColor" strokeWidth="2.6" />
    <rect x="4.5" y="11" width="4.5" height="3.6" rx="1" fill="currentColor" />
    <path d="M5.5 12.8 L8 12.8 M6.7 11 L6.7 14.6" stroke="#17112E" strokeWidth="0.9" strokeLinecap="round" />
    <path d="M12 12.5 L16.5 12.5 M13 15.5 L18 15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
    <path d="M4 6 Q12 4.8 20 6" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" strokeLinecap="round" />
  </Svg>
);

/** Cadeau : boîte + ruban + nœud + reflet. */
export const DriveGift: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Cadeau">
    <rect x="4" y="9.5" width="16" height="11" rx="1.8" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.9" />
    <path d="M3 6.5 L21 6.5 L21 9.5 L3 9.5 Z" fill="currentColor" />
    <path d="M10.8 6.5 L13.2 6.5 L13.2 20.5 L10.8 20.5 Z" fill="currentColor" />
    <path d="M12 6.5 Q9 6.5 8.2 4.5 Q7.6 2.8 9.4 2.6 Q11 2.5 12 4.5 Q13 2.5 14.6 2.6 Q16.4 2.8 15.8 4.5 Q15 6.5 12 6.5 Z" fill="currentColor" />
    <path d="M6 12 Q6 11 7.5 11" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/* --------------------------- Sécurité ------------------------------ */

/** SOS : disque rouge verni + croix blanche + anneau pulsant (CSS). */
export const DriveSos: IconFn = ({ size, className }) => {
  const gid = useGid('sos');
  return (
    <Svg size={size} className={className} label="SOS">
      <defs>
        <radialGradient id={gid} cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#FF8A94" />
          <stop offset="55%" stopColor="#E5484D" />
          <stop offset="100%" stopColor="#B91C1C" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill={`url(#${gid})`} />
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
      <path d="M6 6 Q12 3.5 18 6" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 7.5 L12 16.5 M7.5 12 L16.5 12" stroke="#FFFFFF" strokeWidth="3.4" strokeLinecap="round" />
    </Svg>
  );
};

/* ---------------------------- Partage ------------------------------ */

/** Partager : trois points reliés, nœuds lumineux. */
export const DriveShare: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Partager">
    <path d="M8.5 12 L15 7 M8.5 12 L15 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="6" cy="12" r="3" fill="currentColor" />
    <circle cx="18" cy="5.5" r="3" fill="currentColor" />
    <circle cx="18" cy="18.5" r="3" fill="currentColor" />
    <circle cx="6" cy="12" r="1" fill="#17112E" />
    <circle cx="18" cy="5.5" r="1" fill="#17112E" />
    <circle cx="18" cy="18.5" r="1" fill="#17112E" />
  </Svg>
);

/** Copier : deux feuilles superposées + pli. */
export const DriveCopy: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Copier">
    <rect x="8" y="8" width="12" height="12" rx="2.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" />
    <path d="M16 8 L16 5.5 Q16 4 14.5 4 L5.5 4 Q4 4 4 5.5 L4 14.5 Q4 16 5.5 16 L8 16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M11 11.5 L17 11.5 M11 14.5 L15 14.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
  </Svg>
);

/* ----------------------------- Compte ------------------------------ */

/** Historique : horloge + flèche de retour. */
export const DriveHistory: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Historique">
    <path d="M4.5 12 A7.5 7.5 0 1 1 3.2 9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M3.5 4.5 L3.5 9.5 L8 9.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7.5 L12 12 L15.2 13.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
  </Svg>
);

/** Assistance : bouée détaillée, segments + corde. */
export const DriveHelp: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Assistance">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3.4" />
    <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5.8 5.8 L8.6 8.6 M18.2 5.8 L15.4 8.6 M5.8 18.2 L8.6 15.4 M18.2 18.2 L15.4 15.4" stroke="currentColor" strokeWidth="3.4" />
    <path d="M6.5 6.5 Q12 3.5 17.5 6.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
  </Svg>
);

/** Réglages : roue dentée + moyeu + reflet. */
export const DriveSettings: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Paramètres">
    <g fill="currentColor">
      <path d="M12 8.8 A3.2 3.2 0 1 0 12 15.2 A3.2 3.2 0 1 0 12 8.8 Z M12 2.8 L13.4 5.2 L15.2 4.6 L16.8 6.2 L16.2 8 L18.6 9.4 L18.6 12 L18.6 14.6 L16.2 16 L16.8 17.8 L15.2 19.4 L13.4 18.8 L12 21.2 L10.6 18.8 L8.8 19.4 L7.2 17.8 L7.8 16 L5.4 14.6 L5.4 12 L5.4 9.4 L7.8 8 L7.2 6.2 L8.8 4.6 L10.6 5.2 Z" />
    </g>
    <circle cx="12" cy="12" r="3.2" fill="#17112E" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    <path d="M9.5 6.5 Q12 5 14.5 6.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
  </Svg>
);

/** Maison : toit + façade + porte + fenêtres allumées. */
export const DriveHome: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Maison">
    <path d="M3 11 L12 3.5 L21 11 L21 20.5 Q21 21.5 20 21.5 L4 21.5 Q3 21.5 3 20.5 Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M3 11 L12 3.5 L21 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="6" y="13" width="3.4" height="3.4" rx="0.6" fill="#FCD34D" />
    <rect x="14.6" y="13" width="3.4" height="3.4" rx="0.6" fill="#FCD34D" opacity="0.55" />
    <path d="M10.3 21.5 L10.3 16.5 Q10.3 15.3 11.5 15.3 L12.5 15.3 Q13.7 15.3 13.7 16.5 L13.7 21.5 Z" fill="#17112E" />
    <path d="M5 9.5 L12 3.8" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Travail : mallette + poignée + fermoir doré. */
export const DriveBriefcase: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Travail">
    <path d="M9 7 L9 5.5 Q9 4 10.5 4 L13.5 4 Q15 4 15 5.5 L15 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <rect x="3" y="7" width="18" height="13.5" rx="2.5" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.9" />
    <path d="M3 12.5 L21 12.5" stroke="currentColor" strokeWidth="1.6" />
    <rect x="10.5" y="11" width="3" height="3" rx="0.8" fill="#FCD34D" />
    <path d="M5 8.5 Q12 7 19 8.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" strokeLinecap="round" />
  </Svg>
);

/** Globe + épingle sur le Gabon : l'écran hors zone, version Drive. */
export const DriveGlobe: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Globe">
    <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity="0.12" stroke="currentColor" strokeWidth="1.9" />
    <path d="M2.5 12 L21.5 12 M12 2.5 Q15.5 7 15.5 12 Q15.5 17 12 21.5 Q8.5 17 8.5 12 Q8.5 7 12 2.5 Z" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.7" />
    <path d="M12 8.5 L13.6 11 L16.4 11.4 L14.3 13.3 L14.9 16.1 L12 14.7 L9.1 16.1 L9.7 13.3 L7.6 11.4 L10.4 11 Z" fill="#FF4D8D" />
    <circle cx="12" cy="12" r="1.2" fill="#17112E" />
    <path d="M6 5.5 Q9 3.5 12 3.2" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Enveloppe : rabat + lignes + cachet. */
export const DriveMail: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="E-mail">
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" />
    <path d="M3.5 7 L12 13.5 L20.5 7" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 7.5 L12 12" stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="17.5" cy="15.5" r="1.6" fill="#FF4D8D" />
  </Svg>
);

/** Cloche : cloche + battant + ondes. */
export const DriveBell: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Notifications">
    <path d="M12 2.5 Q12 2.5 12 2.5 Q17 3 17.5 8.5 L17.5 12.5 Q17.5 14.5 19 15.5 L19 17 L5 17 L5 15.5 Q6.5 14.5 6.5 12.5 L6.5 8.5 Q7 3 12 2.5 Z" fill="currentColor" />
    <path d="M9 5 Q10.5 3.2 12 3.2" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M10 19.5 Q10 21.5 12 21.5 Q14 21.5 14 19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M19.5 5.5 Q21 7.5 19.5 9.5 M21 3.5 Q23.5 6.5 21 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
  </Svg>
);

/** Appareil photo : boîtier + objectif + flash. */
export const DriveCamera: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Photo">
    <path d="M3.5 8 L6.5 8 L8 5.5 L16 5.5 L17.5 8 L20.5 8 Q21.5 8 21.5 9 L21.5 18.5 Q21.5 20 20 20 L4 20 Q2.5 20 2.5 18.5 L2.5 9 Q2.5 8 3.5 8 Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <circle cx="12" cy="13.5" r="4.2" fill="currentColor" />
    <circle cx="12" cy="13.5" r="2.2" fill="#17112E" />
    <circle cx="12" cy="13.5" r="0.9" fill="#FFFFFF" />
    <circle cx="18" cy="10.5" r="1.1" fill="#FF4D8D" />
    <path d="M5 8.8 Q12 7 19 8.8" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
  </Svg>
);

/** Corbeille : cuve + couvercle + rainures. */
export const DriveTrash: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Supprimer">
    <path d="M4.5 6.5 L19.5 6.5 M9.5 6.5 L9.5 4.5 Q9.5 3.5 10.5 3.5 L13.5 3.5 Q14.5 3.5 14.5 4.5 L14.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M6 6.5 L7 20 Q7.2 21.5 8.7 21.5 L15.3 21.5 Q16.8 21.5 17 20 L18 6.5 Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M10.2 10 L10.2 17.5 M13.8 10 L13.8 17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </Svg>
);

/** Ajouter un contact : personne + plus. */
export const DriveUserPlus: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Ajouter un contact">
    <circle cx="10" cy="8" r="4.2" fill="currentColor" />
    <path d="M2.5 20 Q2.5 14.5 10 14.5 Q13 14.5 14.8 16" fill="currentColor" />
    <circle cx="18" cy="17.5" r="4.5" fill="#FF4D8D" />
    <path d="M18 15 L18 20 M15.5 17.5 L20.5 17.5" stroke="#17112E" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

/** Micro : micro + pied + grille. */
export const DriveMic: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Message vocal">
    <rect x="9" y="2.5" width="6" height="12" rx="3" fill="currentColor" />
    <path d="M10.5 5.5 L13.5 5.5 M10.5 8 L13.5 8 M10.5 10.5 L13.5 10.5" stroke="#17112E" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
    <path d="M5.5 11.5 Q5.5 16.5 12 16.5 Q18.5 16.5 18.5 11.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M12 16.5 L12 20.5 M8.5 20.5 L15.5 20.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </Svg>
);

/** Éclair : éclair + halo. */
export const DriveZap: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Automatique">
    <path d="M13 2 L5.5 13.5 L10.5 13.5 L9.5 22 L18.5 10 L13.5 10 Z" fill="currentColor" />
    <path d="M13 2 L5.5 13.5 L10.5 13.5 L13 9.5 Z" fill="rgba(255,255,255,0.35)" />
    <path d="M10 4.5 L12.5 4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.1" strokeLinecap="round" />
  </Svg>
);

/** Imprimante : boîtier + feuille + boutons. */
export const DrivePrinter: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Imprimer">
    <path d="M7 8 L7 3.5 Q7 2.5 8 2.5 L16 2.5 Q17 2.5 17 3.5 L17 8" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <rect x="3" y="8" width="18" height="8" rx="2.5" fill="currentColor" />
    <circle cx="17.5" cy="12" r="1.1" fill="#17112E" />
    <path d="M7 13.5 L7 19.5 Q7 21 8.5 21 L15.5 21 Q17 21 17 19.5 L17 13.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M9.5 16.5 L14.5 16.5 M9.5 19 L13 19" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
  </Svg>
);

/** Reçu : feuille + lignes + coin plié. */
export const DriveReceipt: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Reçu">
    <path d="M5.5 2.5 L15.5 2.5 L19.5 6.5 L19.5 19.5 Q19.5 21.5 17.5 21.5 L7.5 21.5 Q5.5 21.5 5.5 19.5 Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M15.5 2.5 L15.5 6.5 L19.5 6.5" fill="currentColor" />
    <path d="M8.5 10.5 L16 10.5 M8.5 13.5 L16 13.5 M8.5 16.5 L13.5 16.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="12" cy="7" r="1" fill="#FF4D8D" />
  </Svg>
);

/** Actualiser : flèche circulaire + pointe. */
export const DriveRefresh: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Actualiser">
    <path d="M20.5 12 A8.5 8.5 0 1 1 12 3.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M12 2.5 L12 6.5 L15.5 4.5 Z" fill="currentColor" />
    <path d="M5.5 8 Q8 4.5 12 4" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Calendrier : page + spirales + date. */
export const DriveCalendar: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Calendrier">
    <rect x="3.5" y="5" width="17" height="16" rx="2.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" />
    <path d="M3.5 9.5 L20.5 9.5" stroke="currentColor" strokeWidth="1.8" />
    <path d="M8 3 L8 6.5 M16 3 L16 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <rect x="7" y="12.5" width="4" height="4" rx="1" fill="#FF4D8D" />
    <path d="M13.5 13 L17 13 M13.5 16 L16 16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
  </Svg>
);

/** Tendance : courbe + flèche + points. */
export const DriveTrendingUp: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="En hausse">
    <path d="M3 17.5 L8.5 12 L12.5 15.5 L20 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15.5 7.5 L20 7.5 L20 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="8.5" cy="12" r="1.5" fill="currentColor" />
    <circle cx="20" cy="7.5" r="1.5" fill="#FF4D8D" />
  </Svg>
);

/** Flamme détaillée : flamme + cœur lumineux + braises. */
export const DriveFlame: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Série">
    <path d="M12 2.5 Q12 2.5 12 2.5 Q16.5 7 17.5 10.5 Q19.5 12 19.5 15.5 Q19.5 20.5 12 21.5 Q4.5 20.5 4.5 15.5 Q4.5 13 6 11 Q6.5 13.5 8 14.5 Q7.5 9 12 2.5 Z" fill="currentColor" />
    <path d="M12 12.5 Q14.5 14.5 14.5 17 Q14.5 19.5 12 20 Q9.5 19.5 9.5 17 Q9.5 14.5 12 12.5 Z" fill="#17112E" opacity="0.55" />
    <path d="M12 15.5 Q13.2 16.5 13.2 17.8 Q13.2 19.2 12 19.5 Q10.8 19.2 10.8 17.8 Q10.8 16.5 12 15.5 Z" fill="#FFD9E8" />
    <path d="M8 6 Q9.5 4 12 3.5" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Couronne : couronne + joyaux + bandeau. */
export const DriveCrown: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Palier">
    <path d="M3 8 L5.5 17 Q5.8 19 7.8 19 L16.2 19 Q18.2 19 18.5 17 L21 8 L16.5 11.5 L12 5.5 L7.5 11.5 Z" fill="currentColor" />
    <circle cx="12" cy="5.5" r="1.5" fill="#FFD9E8" />
    <circle cx="3" cy="8" r="1.3" fill="#2FD6C8" />
    <circle cx="21" cy="8" r="1.3" fill="#2FD6C8" />
    <circle cx="8.5" cy="14.5" r="1.2" fill="#17112E" />
    <circle cx="12" cy="14.5" r="1.2" fill="#FFD9E8" />
    <circle cx="15.5" cy="14.5" r="1.2" fill="#17112E" />
    <path d="M6 9.5 L8 8.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.1" strokeLinecap="round" />
  </Svg>
);

/** Trophée : coupe + anses + étoile + socle. */
export const DriveTrophy: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Trophée">
    <path d="M7.5 3.5 L16.5 3.5 L16 10.5 Q15.6 13.8 12 14.8 Q8.4 13.8 8 10.5 Z" fill="currentColor" />
    <path d="M7.5 5 L5 5 Q3.5 5 3.5 6.8 Q3.5 10 7 10.5 M16.5 5 L19 5 Q20.5 5 20.5 6.8 Q20.5 10 17 10.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M12 5.8 L12.6 7.4 L14.3 7.6 L13 8.8 L13.4 10.6 L12 9.6 L10.6 10.6 L11 8.8 L9.7 7.6 L11.4 7.4 Z" fill="#FFFFFF" />
    <path d="M12 14.8 L12 17.5 M8.5 20.5 L15.5 20.5 L15.5 18.5 Q15.5 17.5 14.5 17.5 L9.5 17.5 Q8.5 17.5 8.5 18.5 Z" fill="currentColor" />
    <path d="M8.5 4.8 Q12 3.6 15.5 4.8" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.1" strokeLinecap="round" />
  </Svg>
);

/** Étincelles : étoiles + points lumineux. */
export const DriveSparkles: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Nouveau">
    <path d="M9 3.5 L10.2 7.3 L14 8.5 L10.2 9.7 L9 13.5 L7.8 9.7 L4 8.5 L7.8 7.3 Z" fill="currentColor" />
    <path d="M18.5 11 L19.3 13.2 L21.5 14 L19.3 14.8 L18.5 17 L17.7 14.8 L15.5 14 L17.7 13.2 Z" fill="currentColor" opacity="0.75" />
    <circle cx="17" cy="6" r="1.3" fill="currentColor" />
    <circle cx="5" cy="17.5" r="1.1" fill="currentColor" opacity="0.7" />
    <path d="M9 3.5 L10.2 7.3 L14 8.5" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="0.9" strokeLinecap="round" />
  </Svg>
);

/** Lecture : triangle dans un disque verni. */
export const DrivePlay: IconFn = ({ size, className }) => {
  const gid = useGid('play');
  return (
    <Svg size={size} className={className} label="Voir le tutoriel">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FF7EB0" />
          <stop offset="100%" stopColor="#D6336C" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={`url(#${gid})`} />
      <path d="M6.5 5.5 Q12 3.5 17.5 5.5" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 8.5 L16.5 12 L10 15.5 Z" fill="#17112E" />
    </Svg>
  );
};

/** Info : « i » dans un disque + reflet. */
export const DriveInfo: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Information">
    <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.9" />
    <path d="M12 11 L12 16.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="7.8" r="1.4" fill="currentColor" />
    <path d="M6.5 7 Q9 4.8 12 4.8" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Itinéraire : deux points + route en pointillés. */
export const DriveRoute: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Itinéraire">
    <circle cx="6" cy="19" r="2.6" fill="currentColor" />
    <circle cx="18" cy="5" r="2.6" fill="#FF4D8D" />
    <circle cx="18" cy="5" r="1" fill="#17112E" />
    <path d="M6 16.5 Q6 10 11 10 Q16 10 16 6.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeDasharray="0.1 3.4" strokeLinecap="round" />
    <circle cx="6" cy="19" r="1" fill="#17112E" />
  </Svg>
);

/** Œil : œil + iris + reflet. */
export const DriveEye: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Voir">
    <path d="M2.5 12 Q6 5.5 12 5.5 Q18 5.5 21.5 12 Q18 18.5 12 18.5 Q6 18.5 2.5 12 Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="12" cy="12" r="3.6" fill="currentColor" />
    <circle cx="12" cy="12" r="1.7" fill="#17112E" />
    <circle cx="13.2" cy="10.8" r="0.7" fill="#FFFFFF" />
  </Svg>
);

/** Cadenas : corps + anse + trou de serrure. */
export const DriveLock: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Verrouillé">
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" />
    <path d="M8 10.5 L8 7.5 Q8 4 12 4 Q16 4 16 7.5 L16 10.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <circle cx="12" cy="14.5" r="1.5" fill="#17112E" />
    <path d="M12 15.5 L12 17.5" stroke="#17112E" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M7 12 Q12 10.8 17 12" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
  </Svg>
);

/** Déconnexion : porte + flèche. */
export const DriveLogout: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Déconnexion">
    <path d="M14 3.5 L14 20.5 L4 20.5 L4 3.5 Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M9 12 L20 12 M16 8.5 L20 12 L16 15.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** Interdit : cercle barré. */
export const DriveBan: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Interdit">
    <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="2" />
    <path d="M5.5 5.5 L18.5 18.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 7 Q9 4.8 12 4.8" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Travaux : cône + bandes. */
export const DriveConstruction: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Travaux">
    <path d="M12 3 L17.5 19.5 L6.5 19.5 Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M9.8 11 L14.2 11 M8.8 14.5 L15.2 14.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M5 19.5 L19 19.5 L19 21 Q19 21.8 18.2 21.8 L5.8 21.8 Q5 21.8 5 21 Z" fill="currentColor" />
    <circle cx="12" cy="6.5" r="1" fill="#FF4D8D" />
  </Svg>
);

/* ------------------------- Compléments v2.52 ------------------------ */
/*  Icônes ajoutées pour fermer le balayage : plus aucun import Lucide */
/*  hors admin. Même langage : currentColor + reflets blancs + accents */
/*  fixes (sarcelle #2FD6C8, rose clair #FFD9E8, nuit #17112E).         */

/** Épingle barrée : lieu introuvable / signalement carte. */
export const DrivePinOff: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Épingle indisponible">
    <path d="M12 2 C7 2 3.5 5.8 3.5 10.5 C3.5 16.5 12 22 12 22 C12 22 20.5 16.5 20.5 10.5 C20.5 5.8 17 2 12 2 Z" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="1.9" />
    <path d="M7 6 Q9.5 3.8 12 3.8" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="12" cy="10.5" r="4.2" fill="#17112E" stroke="#2FD6C8" strokeWidth="1.2" />
    <path d="M4.5 4.5 L19.5 19.5" stroke="#FF5F6D" strokeWidth="2.4" strokeLinecap="round" />
  </Svg>
);

/** Chaînon : lien de suivi à copier. */
export const DriveLink: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Lien">
    <path d="M10 13.5 Q8.5 15 6.8 15 Q4 15 4 12.2 Q4 9.5 6.5 8.2 L8.8 7 Q10.5 6.2 11.5 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 10.5 Q15.5 9 17.2 9 Q20 9 20 11.8 Q20 14.5 17.5 15.8 L15.2 17 Q13.5 17.8 12.5 16.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M8.5 12 L15.5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M8.5 12 L15.5 12" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" strokeLinecap="round" />
  </Svg>
);

/** Document vérifié : pièce d'identité / justificatif validé. */
export const DriveFileCheck: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Document vérifié">
    <path d="M6 2.5 L14.5 2.5 L18.5 6.5 L18.5 21.5 L6 21.5 Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M14.5 2.5 L14.5 6.5 L18.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 10.5 L13 10.5 M9 13.5 L12.5 13.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="15.5" cy="16.5" r="4.6" fill="#2FD6C8" stroke="#17112E" strokeWidth="1.2" />
    <path d="M13.4 16.5 L15.1 18.2 L17.8 14.9" fill="none" stroke="#17112E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

/** Envoi vers le haut : téléverser un document. */
export const DriveUpload: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Téléverser">
    <path d="M12 3 L12 14 M7.5 7 L12 2.5 L16.5 7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 3 L12 8" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round" />
    <path d="M4 15.5 L4 19.5 Q4 21 5.5 21 L18.5 21 Q20 21 20 19.5 L20 15.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 17.5 L18 17.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.4" />
  </Svg>
);

/** Mégaphone : signaler un problème de circulation. */
export const DriveMegaphone: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Signaler">
    <path d="M3 10.5 L3 13.5 Q3 15 4.5 15 L7 15 L17.5 20.5 Q19.5 21.5 19.5 19.5 L19.5 4.5 Q19.5 2.5 17.5 3.5 L7 9 L4.5 9 Q3 9 3 10.5 Z" fill="currentColor" />
    <path d="M5 11 Q9 9.5 15 7" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M8.5 15.5 L8.5 20 Q8.5 21.5 10 21.5 L11.5 21.5 Q13 21.5 13 20 L13 17.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M21.5 8.5 Q22.8 10.5 22.8 12 Q22.8 13.5 21.5 15.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </Svg>
);

/** Avion : file d'attente aéroport. */
export const DrivePlane: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Aéroport">
    <path d="M12 2.5 Q13.5 2.5 13.8 4 L14.8 10.5 L21 13.5 Q22 14 21.5 15 Q21 15.8 20 15.5 L15 14.5 L13.5 20.5 Q13.2 21.8 12 21.8 Q10.8 21.8 10.5 20.5 L9 14.5 L4 15.5 Q3 15.8 2.5 15 Q2 14 3 13.5 L9.2 10.5 L10.2 4 Q10.5 2.5 12 2.5 Z" fill="currentColor" />
    <path d="M12 4 L12.6 10.5 L13.5 18" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" strokeLinecap="round" />
    <circle cx="12" cy="8" r="1.3" fill="#17112E" opacity="0.6" />
  </Svg>
);

/** Retour : course sur le chemin du retour. */
export const DriveUndo: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Retour">
    <path d="M8.5 5.5 L4 10 L8.5 14.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 10 L19 10 Q21 10 21 12 Q21 18.5 14.5 18.5 L12 18.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    <path d="M6 12.5 L18 12.5" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeLinecap="round" />
  </Svg>
);

/** Cercle + croix : refuser / rejeter (admin). */
export const DriveXCircle: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Refuser">
    <circle cx="12" cy="12" r="9.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="2" />
    <path d="M8.5 8.5 L15.5 15.5 M15.5 8.5 L8.5 15.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M6.5 7 Q9 4.8 12 4.8" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

/** Bulle d'alerte : message qui signale un problème (admin). */
export const DriveMessageWarning: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Message d'alerte">
    <path d="M4 3.5 L20 3.5 Q21.5 3.5 21.5 5 L21.5 15 Q21.5 16.5 20 16.5 L12.5 16.5 L8 21 L8 16.5 L4 16.5 Q2.5 16.5 2.5 15 L2.5 5 Q2.5 3.5 4 3.5 Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M12 8 L12 12.5" stroke="#FF5F6D" strokeWidth="2.2" strokeLinecap="round" />
    <circle cx="12" cy="15.2" r="1.2" fill="#FF5F6D" />
    <path d="M5 5.5 Q12 4.2 19 5.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.1" strokeLinecap="round" />
  </Svg>
);

/** Pouce levé : recommandation positive (admin). */
export const DriveThumbsUp: IconFn = ({ size, className }) => (
  <Svg size={size} className={className} label="Recommandation">
    <path d="M7 21.5 L7 10.5 L9.5 10.5 L9.5 21.5 Z" fill="currentColor" />
    <path d="M9.5 10.5 L9.5 5.5 Q9.5 3 11 2.2 Q12.5 1.5 13.2 3 L14.5 7.5 L19 7.5 Q21 7.5 21 9.5 L21 10.5 Q21 12 20 13.5 L18.5 17 Q17.5 20.5 14.5 20.5 L10.5 21.5 L9.5 21.5 Z" fill="currentColor" fillOpacity="0.85" />
    <path d="M10.5 10.5 L10.5 20" stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeLinecap="round" />
    <path d="M3.5 10.5 L7 10.5 L7 21.5 L3.5 21.5 Q2.5 21.5 2.5 20.5 L2.5 11.5 Q2.5 10.5 3.5 10.5 Z" fill="currentColor" fillOpacity="0.35" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </Svg>
);

/* ------------------------------------------------------------------ */
/*  Chaînes SVG autonomes — marqueurs de signalement trafic (carte).   */
/*  Remplacent les pictogrammes emoji (voiture, collision, travaux,  */
/*  route barrée) : même objet, même langage que                   */
/*  le formulaire de signalement (qui utilise déjà des icônes).        */
/* ------------------------------------------------------------------ */

export const DRIVE_TRAFFIC_SVG: Record<'embouteillage' | 'accident' | 'travaux' | 'route_fermee', string> = {
  embouteillage: `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"><path d="M3 14 L2.5 12 Q2.5 11 3.5 10.7 L5.5 10 Q7 9.7 8 8.3 L9.2 6.8 Q9.8 6 10.8 6 L15.5 6 Q16.5 6 17.2 6.8 L18.8 8.5 Q19 8.8 19.6 8.9 L21 9.4 Q22 9.7 22 10.8 L22 12 Q22 13 21 13 L19.6 13 A2.4 2.4 0 0 0 14.8 13 L9.2 13 A2.4 2.4 0 0 0 4.4 13 L3.5 13 Q3 13.5 3 14 Z" fill="#17112E"/><path d="M9.4 7.4 L10.6 7 L14.6 7 Q15.4 7 15.8 7.6 L16.8 9 L10 9 Z" fill="#4A3A8C"/><circle cx="7" cy="13" r="2.2" fill="#17112E" stroke="#E8E6F0" stroke-width="0.8"/><circle cx="17" cy="13" r="2.2" fill="#17112E" stroke="#E8E6F0" stroke-width="0.8"/><circle cx="21" cy="11" r="0.9" fill="#FFFFFF"/></svg>`,
  accident: `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"><path d="M12 2.5 L13.5 8.5 L19.5 9.5 L15 13.5 L16.2 19.5 L12 16.5 L7.8 19.5 L9 13.5 L4.5 9.5 L10.5 8.5 Z" fill="#F5A623"/><path d="M12 2.5 L13.5 8.5 L19.5 9.5 L15 13.5 L16.2 19.5 L12 16.5 Z" fill="rgba(255,255,255,0.3)"/><circle cx="12" cy="11.5" r="1.4" fill="#17112E"/></svg>`,
  travaux: `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"><path d="M12 3 L17.5 19.5 L6.5 19.5 Z" fill="#F5A623" fill-opacity="0.25" stroke="#F5A623" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.8 11 L14.2 11 M8.8 14.5 L15.2 14.5" stroke="#17112E" stroke-width="2.2" stroke-linecap="round"/><path d="M5 19.5 L19 19.5 L19 21 Q19 21.8 18.2 21.8 L5.8 21.8 Q5 21.8 5 21 Z" fill="#F5A623"/><circle cx="12" cy="6.5" r="1" fill="#FF4D8D"/></svg>`,
  route_fermee: `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#E5484D" fill-opacity="0.16" stroke="#E5484D" stroke-width="2"/><path d="M5.8 5.8 L18.2 18.2" stroke="#E5484D" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="2" fill="#E5484D"/></svg>`,
};
