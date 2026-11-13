import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // v2 : application dynamique hébergée sur Vercel (plus d'export statique).
  // L'ancienne démo statique GitHub Pages (dossier docs/) reste en place
  // jusqu'à la bascule, mais n'est plus générée depuis ce code.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
