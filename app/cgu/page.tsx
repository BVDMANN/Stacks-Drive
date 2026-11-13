import Link from 'next/link';
import { PageShell } from '@/components/shared/PageShell';

export const metadata = {
  title: 'Conditions Générales d’Utilisation — Stacks Drive',
  description: 'Conditions Générales d’Utilisation de la plateforme Stacks Drive.',
};

export default function CguPage() {
  return (
    <PageShell title="Conditions Générales d’Utilisation" subtitle="Règles d’utilisation de la plateforme Stacks Drive.">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-600 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">1. Objet</h2>
          <p>
            Stacks Drive est une plateforme de mise en relation entre des
            passagers et des chauffeurs à Libreville, au Gabon. Les chauffeurs
            publient des courses avec un prix fixe affiché avant la course ; les
            passagers réservent des places. Stacks Drive n’est pas partie aux
            trajets effectués entre passagers et chauffeurs, et ne fournit pas
            elle-même de service de transport.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">2. Comptes</h2>
          <p>
            L’inscription est gratuite et nécessite une adresse e-mail valide,
            vérifiée par un lien envoyé par e-mail. Chaque utilisateur choisit
            un rôle : <strong>Passager</strong> (réserver des courses) ou{' '}
            <strong>Chauffeur</strong> (publier des courses avec son propre
            véhicule). L’utilisateur est responsable de la confidentialité de
            son mot de passe et de l’exactitude des informations fournies.
            Les chauffeurs renseignent leur véhicule (type, places, plaque) dans
            leur compte ; le badge « Vérifié » est attribué par Stacks Drive
            après contrôle des pièces.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">3. Réservations</h2>
          <p>
            Un passager ne peut réserver qu’une seule fois une même course. Sa
            réservation (nom, téléphone, nombre de places, moyen de paiement,
            message) est transmise au chauffeur, qui peut en changer le statut
            (en attente, confirmée, annulée, terminée). Le passager peut
            annuler sa réservation tant que la course n’a pas eu lieu : la ou
            les places sont alors libérées. Stacks Drive ne garantit aucune
            disponibilité ni aucun départ.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">4. Publication de courses</h2>
          <p>
            Le chauffeur s’engage à publier des courses réelles, licites et
            sincères (départ, destination, date et heure, places, prix fixe,
            véhicule). Il peut modifier, fermer ou republier ses courses à tout
            moment. Le prix affiché est fixe : il ne change pas aux heures de
            pointe ni la nuit. Stacks Drive se réserve le droit de retirer
            toute course illicite, trompeuse ou contraire aux présentes
            conditions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">5. Commission et paiement</h2>
          <p>
            Stacks Drive prélève une commission sur chaque course réservée :{' '}
            <strong>5 % au lancement (3 mois), puis 8 %</strong>, avec un{' '}
            <strong>plafond garanti de 10 %</strong>. La découpe du tarif (part
            du chauffeur / frais de plateforme) est affichée avant chaque
            réservation et figée dans la réservation. Le paiement de la course
            se fait directement entre le passager et le chauffeur, en espèces
            ou par Mobile Money (Airtel Money, Moov Money) selon les moyens
            acceptés sur la course. Stacks Drive ne traite aucun paiement et
            ne détient aucun fonds.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">6. Contenus interdits</h2>
          <p>
            Sont interdits : les courses illégales, les contenus
            discriminatoires, trompeurs ou portant atteinte à la dignité des
            personnes, ainsi que toute utilisation de la plateforme à des fins
            de démarchage sans rapport avec le transport. Tout manquement peut
            entraîner la suspension du compte.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">7. Responsabilité</h2>
          <p>
            Stacks Drive met en relation passagers et chauffeurs mais
            n’intervient pas dans l’exécution des trajets, les paiements
            (effectués directement entre les parties) ni les litiges éventuels.
            Chaque chauffeur est seul responsable de son véhicule, de son
            assurance et du respect des règles de circulation. La
            responsabilité de Stacks Drive ne saurait être engagée au-delà de
            la mise à disposition de la plateforme.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">8. Données personnelles</h2>
          <p>
            Le traitement des données personnelles est décrit dans notre{' '}
            <Link href="/confidentialite" className="text-stacks-green font-bold hover:underline">
              politique de confidentialité
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">9. Contact</h2>
          <p>
            Pour toute question :{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-stacks-green font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>
            .{' '}
            <span className="text-amber-700 bg-amber-50 px-1 rounded">[à compléter : adresse postale de contact si différente du siège, numéro de téléphone]</span>
          </p>
        </section>

        <p className="text-sm text-slate-400">
          Dernière mise à jour : novembre 2026.{' '}
          <Link href="/" className="text-stacks-green font-bold hover:underline">
            Retour à l’accueil
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
