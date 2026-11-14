import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: ['class'],
  theme: {
    extend: {
      colors: {
        stacks: {
          green: '#0B6E4F',
          greenLight: '#0E8A63',
          navy: '#0B1F3A',
          amber: '#FFB020',
          // Jaune et bleu du drapeau gabonais (bandeau tricolore).
          yellow: '#FCD116',
          blue: '#3A75C4',
          ghost: '#F8F9FA',
          dark: '#0A0A0A',
          darker: '#080808',
        },
        // Identité « Libreville la nuit » — palette B « Or & Cyan »
        // (choix de Stacks, 13/11/2026) : ciel nocturne bleu encre,
        // or (la valeur, l'argent) et cyan (la carte, la ville qui vit).
        // Or remplace l'ancien orange braise, cyan remplace l'ancien
        // vert volt. Le fond nuit et l'or du drapeau gabonais restent.
        night: {
          950: '#070B16',
          900: '#0B1020',
          800: '#12182B',
          700: '#1A2340',
          600: '#232E4D',
        },
        or: {
          DEFAULT: '#FFC700',
          light: '#FFD60A',
          dark: '#B89100',
        },
        cyan: {
          DEFAULT: '#22D3EE',
          dark: '#0891B2',
        },
        gold: {
          DEFAULT: '#FFD60A',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'premium': '1.5rem',
        'card': '1rem',
      },
      boxShadow: {
        'premium': '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.02)',
        'glass': 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
        'card': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        'stagger': 'stagger 0.3s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        stagger: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
