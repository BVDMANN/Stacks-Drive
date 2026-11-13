import '@/styles/globals.css';

export const metadata = {
  title: 'Stacks Drive | Courses à Libreville — prix fixe, jamais de surge',
  description:
    'Stacks Drive, la solution du peuple pour se déplacer à Libreville : prix fixe affiché avant la course, chauffeurs vérifiés, paiement en espèces ou Mobile Money.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
