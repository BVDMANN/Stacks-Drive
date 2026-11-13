import Link from 'next/link';
import { PageShell } from '@/components/shared/PageShell';
import { getSessionUser } from '@/lib/supabase/server';

export const metadata = {
  title: 'Mentions légales — Stacks Drive',
  description: 'Mentions légales de la plateforme Stacks Drive.',
};

export default async function MentionsLegalesPage() {
  const sessionUser = await getSessionUser();
  return (
    <PageShell dark title="Mentions légales" subtitle="Informations sur l’éditeur et l’hébergement de Stacks Drive." user={sessionUser ? { id: sessionUser.id, email: sessionUser.email } : null}>
      <div className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-300 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">Éditeur du site</h2>
          <p>
            Le site Stacks Drive est édité par <strong>Stacks</strong>, entreprise
            individuelle immatriculée au Registre National des Entreprises (RNE),
            SIREN <strong>104 314 687</strong>, dont le siège est situé au{' '}
            <strong>5 allée Xavier Bichat, 77420 Champs-sur-Marne, France</strong>.
          </p>
          <p>
            Contact :{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-cyan font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>
          </p>
          <p>
            Directeur de la publication : Gilchrist Randy Boulingui.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">Hébergement</h2>
          <p>
            Le site est hébergé par Vercel Inc., 340 S Lemon Ave #4133, Walnut,
            CA 91789, États-Unis.
          </p>
          <p>
            Les données (comptes, demandes, propositions) sont hébergées par
            Supabase Inc. (base de données PostgreSQL et authentification),
            région Europe — Francfort (eu-central-1).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">Propriété intellectuelle</h2>
          <p>
            L’ensemble du contenu du site Stacks Drive (textes, design, logo) est la
            propriété exclusive de Stacks, sauf mention contraire.
            Toute reproduction, même partielle, est interdite sans autorisation
            écrite préalable.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">Chauffeurs affichés</h2>
          <p>
            Les chauffeurs affichés sur la carte au lancement sont des{' '}
            <strong>profils de démonstration fictifs</strong> destinés à
            présenter la plateforme ; ils ne correspondent à aucun chauffeur
            réel et seront retirés avant le lancement commercial. Les demandes
            et propositions des chauffeurs réels le sont sous leur seule
            responsabilité. Stacks Drive ne garantit ni l’exactitude des
            annonces, ni la réalisation d’un trajet.
          </p>
        </section>

        <p className="text-sm text-slate-400">
          Dernière mise à jour : novembre 2026.{' '}
          <Link href="/" className="text-cyan font-bold hover:underline">
            Retour à l’accueil
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
