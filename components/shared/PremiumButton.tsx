"use client";
import { motion, type HTMLMotionProps } from 'framer-motion';
import { LogoLoader } from '@/components/icons/DriveLogo';
import { cn } from '@/lib/utils';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'rose';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const PremiumButton = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading,
  className,
  ...props
}: ButtonProps) => {
  // v2.52 — palette « Nuit violette » + violet du logo officiel
  //  (#A134F5, couleur de marque principale) : le bouton principal
  //  est violet verni (dégradé + liseré clair en haut), le rose
  //  #FF4D8D reste l'accent secondaire (prix, itinéraire). Le
  //  secondaire est sarcelle, le contour verre nuit. Le chargement
  //  du bouton est le S qui se remplit (LogoLoader).
  const variants = {
    primary: 'bg-gradient-to-br from-brand-300 via-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/40 ring-1 ring-inset ring-white/40',
    rose: 'bg-gradient-to-br from-brand-300 via-brand-500 to-brand-600 text-white shadow-lg shadow-brand-500/40 ring-1 ring-inset ring-white/40',
    secondary: 'bg-gradient-to-br from-sarcelle-light via-sarcelle to-sarcelle-dark text-night-950 shadow-lg shadow-sarcelle/30 ring-1 ring-inset ring-white/40',
    outline: 'bg-white/5 text-slate-100 border border-white/20 shadow-lg shadow-black/30',
    ghost: 'bg-transparent text-slate-300 hover:bg-white/10',
  };

  const sizes = {
    sm: 'py-2 px-4 text-sm',
    md: 'py-4 px-6 text-base',
    lg: 'py-5 px-8 text-lg',
  };

  return (
    <motion.button
      {...props}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className={cn(
        'rounded-full font-semibold transition-all duration-300 flex items-center justify-center gap-2',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/40',
        'disabled:pointer-events-none disabled:opacity-60',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={isLoading || props.disabled}
      type={props.type ?? 'button'}
    >
      {isLoading ? (
        <LogoLoader size={20} />
      ) : (
        children
      )}
    </motion.button>
  );
};
