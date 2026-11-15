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
        // Identité « Libreville la nuit » — palette « Nuit violette »
        // (v2.44, d'après la capture de référence du propriétaire) :
        // fond violet-nuit mesuré #191432, rose vif #FF4D8D (accent :
        // boutons, ligne d'itinéraire, marqueurs), corail #FF5F6D
        // (emphase, badges forts), sarcelle #2FD6C8 (secondaire, carte
        // et liens) et orange coucher de soleil #F5A623 (attention).
        // Texte blanc sur fond sombre (contraste 17,7:1) ; texte sombre
        // #17112E sur rose #FF4D8D (5,8:1) pour les boutons.
        // Les tuiles Plan restent l'OSM CLAIRE (v2.41) : la palette ne
        // touche que l'interface et les surcouches de la carte.
        night: {
          950: '#191432',
          900: '#201646',
          800: '#2A1D55',
          700: '#352463',
          600: '#42307A',
        },
        rose: {
          100: '#FFD9E8',
          300: '#FF7EB0',
          500: '#FF4D8D',
          600: '#E8357A',
          700: '#D6336C',
        },
        corail: {
          DEFAULT: '#FF5F6D',
          light: '#FF8A94',
          dark: '#E5484D',
        },
        sarcelle: {
          DEFAULT: '#2FD6C8',
          light: '#7FE8DD',
          dark: '#0E9F94',
        },
        sunset: {
          DEFAULT: '#F5A623',
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
