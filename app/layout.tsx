import '@/styles/globals.css';
import { BottomNav } from '@/components/shared/BottomNav';

export const metadata = {
  title: 'Stacks Drive | Courses à Libreville — prix figé une fois accepté',
  description:
    'Stacks Drive, la solution du peuple pour se déplacer à Libreville : estimation indicative avant la course, prix figé une fois accepté, chauffeurs vérifiés, paiement en espèces ou Mobile Money.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
