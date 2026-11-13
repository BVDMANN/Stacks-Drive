import Link from 'next/link';
import { PageShell } from '@/components/shared/PageShell';

export const metadata = {
  title: 'Conditions Générales d’Utilisation — Stacks Drive',
  description: 'Conditions Générales d’Utilisation de la plateforme Stacks Drive (Libreville, Gabon).',
};

export default function CguPage() {
  return (
    <PageShell dark title="Conditions Générales d’Utilisation" subtitle="Règles d’utilisation de la plateforme Stacks Drive, à Libreville.">
      <div className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-300 leading-relaxed">
        <p className="text-sm bg-gold/10 border border-gold/30 text-gold rounded-2xl px-4 py-3">
          Document rédigé en novembre 2026. Il sera relu par un juriste avant
          le lancement commercial de la plateforme.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">1. Objet</h2>
          <p>
            Stacks Drive est une plateforme de mise en relation entre des
            passagers et des chauffeurs à Libreville, au Gabon. Le passager
            demande une course (départ, destination, type Solo ou Groupe) ;
            les chauffeurs en ligne à proximité reçoivent la demande et
            peuvent proposer un prix, leurs places restantes et un premier
            arrêt ; le passager accepte ou refuse la proposition. Stacks Drive
            est un simple intermédiaire technique : elle ne fournit pas
            elle-même de service de transport, n’est pas partie au trajet
            effectué entre le passager et le chauffeur, et ne garantit ni la
            disponibilité d’un chauffeur ni la réalisation d’une course.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">2. Comptes</h2>
          <p>
            L’inscription est gratuite et réservée aux personnes majeures
            (18 ans et plus). Elle nécessite une adresse e-mail valide,
            vérifiée par un lien envoyé par e-mail, un nom complet et un
            numéro de téléphone. Chaque utilisateur choisit un rôle :{' '}
            <strong>Passager</strong> (demander des courses) ou{' '}
            <strong>Chauffeur</strong> (recevoir des demandes et proposer ses
            prix, avec son propre véhicule). La bascule d’un rôle à l’autre
            est possible depuis le compte. L’utilisateur est responsable de la
            confidentialité de son mot de passe et de l’exactitude des
            informations fournies. Tout compte contenant des informations
            fausses ou usurpées peut être suspendu.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">3. Vérification des chauffeurs — obligatoire dès l’inscription</h2>
          <p>
            Un chauffeur ne peut ni se mettre en ligne ni recevoir de
            demandes tant que sa vérification n’est pas validée. La
            vérification exige : un <strong>selfie</strong> de vérification
            et une <strong>pièce d’identité</strong> (carte nationale
            d’identité ou passeport) <strong>ou un permis de conduire</strong>{' '}
            en cours de validité. Les documents sont contrôlés par Stacks
            Drive ; le chauffeur reçoit le badge « Vérifié » une fois le
            contrôle réussi. En cas de document faux, illisible ou
            usurpé, le compte est suspendu définitivement. Cette vérification
            est mise en place dès le lancement : elle ne sera pas imposée
            après coup aux chauffeurs déjà inscrits, elle fait partie des
            règles du premier jour. Le chauffeur s’engage en outre à
            disposer d’un permis de conduire valide, d’un véhicule en bon
            état et d’une assurance en cours de validité, et à respecter le
            code de la route.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">4. Demandes, propositions et courses</h2>
          <p>
            Le passager saisit son départ (il peut aussi se géolocaliser) et
            sa destination, choisit le type de course — <strong>Solo</strong>{' '}
            (course privée et directe, prix plein) ou{' '}
            <strong>Groupe</strong> (course partagée, prix divisé par
            passager, arrêts multiples dans l’ordre) — puis envoie sa
            demande. Le prix estimé, fixe et garanti sans majoration
            (« jamais de surge »), est affiché avant l’envoi. Les chauffeurs
            en ligne dans le périmètre reçoivent une notification et peuvent
            faire une proposition (prix, places restantes, premier arrêt),
            valable 60 secondes. Le passager accepte ou refuse chaque
            proposition. L’acceptation vaut course confirmée, au prix
            accepté, figé. Le passager peut annuler sans frais tant qu’aucune
            proposition n’a été acceptée ; après acceptation, l’annulation
            reste possible mais peut entraîner une pénalité de fiabilité sur
            le compte (annulations répétées). Le chauffeur qui accepte
            s’engage à effectuer la course ; les annulations répétées côté
            chauffeur entraînent la suspension du compte.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">5. Prix, commission et fidélité</h2>
          <p>
            Les prix sont fixes et affichés avant la course : ils ne changent
            ni aux heures de pointe ni la nuit. Stacks Drive prélève une
            commission sur chaque course acceptée :{' '}
            <strong>5 % au lancement (3 mois), puis 8 %</strong>, avec un{' '}
            <strong>plafond garanti de 10 %</strong>. La découpe du tarif
            (part du chauffeur / frais de plateforme) est affichée avant
            l’acceptation et figée dans la course. Programme de fidélité :
            la <strong>10e course est offerte</strong> au passager, la
            plateforme prenant en charge l’intégralité du tarif, le chauffeur
            étant payé normalement.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">6. Paiement et solde chauffeur</h2>
          <p>
            Le passager paie le chauffeur <strong>directement</strong>, en
            espèces ou par Mobile Money (Airtel Money, Moov Money), selon le
            moyen choisi à la demande. Stacks Drive ne collecte pas l’argent
            des passagers et ne détient aucun fonds de course. La commission
            est prélevée <strong>automatiquement sur le solde du
            chauffeur</strong> : le chauffeur recharge son solde par Mobile
            Money (comme il recharge du crédit téléphonique), et chaque
            course acceptée déduit la commission de son solde. Le solde et le
            nombre de courses qu’il couvre sont affichés clairement dans son
            tableau de bord. Si le solde est insuffisant pour couvrir la
            commission d’une course, le chauffeur ne reçoit plus de nouvelles
            demandes tant qu’il n’a pas rechargé. Aucune recharge n’est
            remboursable, sauf erreur technique avérée.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">7. Comportement, sécurité et signalement</h2>
          <p>
            Passagers et chauffeurs s’engagent à se comporter avec respect, à
            ne pas discriminer, et à ne pas utiliser la plateforme à des fins
            de démarchage sans rapport avec le transport. La photo, le nom,
            la note et la plaque du chauffeur sont affichés au passager avant
            la montée. Pendant la course, le passager dispose d’un bouton SOS
            et du partage de course en direct avec un proche. Tout
            comportement dangereux, frauduleux ou irrespectueux peut être
            signalé depuis la plateforme et entraîner la suspension du compte
            concerné. Après chaque course, passagers et chauffeurs peuvent se
            noter mutuellement.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">8. Responsabilité</h2>
          <p>
            Stacks Drive met en relation passagers et chauffeurs mais
            n’intervient pas dans l’exécution des trajets, les paiements
            (effectués directement entre les parties) ni les litiges
            éventuels entre un passager et un chauffeur — une médiation par
            le support reste possible. Chaque chauffeur est seul responsable
            de son véhicule, de son assurance, de son permis et du respect
            des règles de circulation. La responsabilité de Stacks Drive ne
            saurait être engagée au-delà de la mise à disposition de la
            plateforme et de ses outils de vérification et de sécurité.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">9. Données personnelles et cookies</h2>
          <p>
            Le traitement des données personnelles est décrit dans notre{' '}
            <Link href="/confidentialite" className="text-volt font-bold hover:underline">
              politique de confidentialité
            </Link>{' '}
            et notre{' '}
            <Link href="/cookies" className="text-volt font-bold hover:underline">
              politique cookies
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">10. Suspension et suppression de compte</h2>
          <p>
            L’utilisateur peut supprimer son compte à tout moment depuis son
            compte ou en écrivant au support ; ses données sont alors
            supprimées sous 30 jours, sauf obligation légale de
            conservation. Stacks Drive peut suspendre ou supprimer un compte
            en cas de manquement grave aux présentes conditions (faux
            documents, fraude, comportement dangereux, annulations répétées).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">11. Modifications et droit applicable</h2>
          <p>
            Stacks Drive peut modifier les présentes conditions ; les
            utilisateurs en sont informés sur la plateforme, et la poursuite
            de l’utilisation vaut acceptation. Le service est opéré à
            Libreville, au Gabon : les présentes conditions sont régies par
            le droit gabonais. En cas de litige, les parties recherchent
            d’abord un règlement amiable, puis les juridictions compétentes
            de Libreville sont saisies.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">12. Contact</h2>
          <p>
            Pour toute question :{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-volt font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>
            .
          </p>
        </section>

        <p className="text-sm text-slate-400">
          Dernière mise à jour : novembre 2026.{' '}
          <Link href="/" className="text-volt font-bold hover:underline">
            Retour à l’accueil
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
