"use client";
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'or';
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
  const variants = {
    primary: 'bg-stacks-green text-white shadow-lg shadow-stacks-green/20',
    or: 'bg-or text-night-900 shadow-lg shadow-or/30',
    secondary: 'bg-stacks-yellow text-stacks-blue shadow-lg shadow-stacks-yellow/20',
    outline: 'bg-white text-stacks-blue border border-gray-200',
    ghost: 'bg-transparent text-gray-500 hover:bg-gray-100',
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
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-stacks-yellow/30',
        'disabled:pointer-events-none disabled:opacity-60',
        variants[variant],
        sizes[size],
        className
      )}
      disabled={isLoading || props.disabled}
      type={props.type ?? 'button'}
    >
      {isLoading ? (
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : (
        children
      )}
    </motion.button>
  );
};
