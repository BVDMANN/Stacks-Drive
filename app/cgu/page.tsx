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
            usurpé, le compte est suspendu définitivement. Le chauffeur s’engage en outre à
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
            (course privée et directe) ou{' '}
            <strong>Groupe</strong> (course partagée, prix divisé par
            passager, arrêts multiples dans l’ordre) — puis envoie sa
            demande. Une <strong>estimation indicative</strong> du prix est
            affichée avant l’envoi : ce n’est pas le prix de la course.
            Le passager peut aussi proposer directement son prix dans sa
            demande. Les chauffeurs en ligne dans le périmètre reçoivent
            une notification et peuvent faire une proposition (prix, places
            restantes, premier arrêt), valable 60 secondes. Le passager
            accepte, refuse, ou contre-propose un prix sur chaque
            proposition ; le chauffeur peut alors accepter la
            contre-proposition ou proposer un autre prix. L’acceptation
            vaut course confirmée, au prix convenu entre les deux parties,
            figé. Le passager peut annuler sans frais tant qu’aucune
            proposition n’a été acceptée ; après acceptation, l’annulation
            reste possible ; les annulations répétées peuvent entraîner la
            suspension du compte. Le chauffeur qui accepte
            s’engage à effectuer la course ; les annulations répétées côté
            chauffeur entraînent la suspension du compte.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">5. Prix et commission</h2>
          <p>
            Le passager voit une <strong>estimation indicative</strong> avant
            la course, calculée à partir d’une <strong>prise en charge</strong> et
            d’un <strong>prix au kilomètre</strong>, selon le type de course (Solo
            ou Groupe) ; elle est affichée en détail avant la commande.
            Cette estimation n’est pas un prix : Stacks Drive ne définit
            aucun tarif fixe. Le prix final est <strong>convenu entre le
            passager et le chauffeur</strong> — le chauffeur propose son prix,
            le passager peut proposer le sien directement et contre-proposer.
            Une fois la course acceptée, le prix est figé : il ne
            change ni aux heures de pointe ni la nuit, et il n’y a jamais de
            majoration. Stacks Drive prélève une commission sur chaque course
            acceptée :{' '}
            <strong>5 % au lancement (3 mois), puis 8 %</strong>, avec un{' '}
            <strong>plafond garanti de 10 %</strong>. La découpe du tarif
            (part du chauffeur / frais de plateforme) est affichée avant
            l’acceptation et figée dans la course. Quand la course inclut
            un supplément pour route non bitumée (article 6), la
            commission est calculée sur le total, supplément compris.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">6. Quartiers à accès difficile — routes non bitumées</h2>
          <p>
            Certains quartiers de Libreville ne sont pas desservis par une
            route bitumée. Pour une destination située dans un tel quartier,
            la course s’arrête par défaut à un{' '}
            <strong>point de dépôt</strong> situé sur route bitumée, indiqué
            au passager avant la commande. Le passager peut demander que le
            chauffeur continue jusqu’à la destination sur route non
            bitumée, moyennant un{' '}
            <strong>supplément forfaitaire de 800 FCFA</strong> inclus dans le
            prix convenu. Le chauffeur est{' '}
            <strong>libre d’accepter ou de refuser</strong> de prendre la
            route non bitumée : s’il refuse, la course s’arrête au point
            de dépôt et le supplément est retiré du prix. La commission de
            Stacks Drive est calculée sur le total de la course,
            supplément compris.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">7. Paiement, commission et dépôt de garantie</h2>
          <p>
            Le passager paie le chauffeur <strong>directement</strong>, en
            espèces ou par transfert Mobile Money (Airtel Money, Moov Money)
            vers le numéro personnel du chauffeur, selon le moyen choisi à
            la demande. Stacks Drive ne collecte pas l’argent des passagers
            et ne détient aucun fonds de course : la plateforme ne fait que
            compter. La commission prévue à l’article 5 est calculée en silence sur chaque
            course acceptée, sur le total de la course, supplément route
            non bitumée compris, sans rien déduire pendant la course. Le chauffeur
            règle le total de ses commissions <strong>une fois par
            semaine</strong>, en un seul transfert Mobile Money vers le numéro
            de Stacks Drive affiché dans son tableau de bord, qui indique
            aussi le montant dû. À l’inscription, le chauffeur verse un{' '}
            <strong>dépôt de garantie remboursable de 5 000 FCFA</strong>,
            par simple transfert Mobile Money : il couvre la première semaine
            de commissions et est remboursé quand le chauffeur quitte la
            plateforme proprement, après avoir soldé ce qu’il doit. Si le
            montant dû dépasse <strong>5 000 FCFA</strong>, le chauffeur ne
            reçoit plus de nouvelles demandes tant qu’il n’a pas réglé.
          </p>
          <p>
            <strong>Paiement par carte.</strong> Le passager peut aussi
            choisir de payer par carte bancaire. Dans ce cas, une empreinte
            du montant total (prix convenu + frais de paiement, affichés
            avant confirmation) est retenue sur sa carte dès l’acceptation
            de la course — rien n’est débité à ce moment. La course ne
            démarre que lorsque l’empreinte est confirmée. À la fin de la
            course, le prix convenu est débité ; si la course est annulée
            avant, l’empreinte est annulée et rien n’est débité. Les frais
            de paiement par carte sont à la charge du passager et sont
            affichés avant toute confirmation. La commission de la course
            est alors prélevée automatiquement par la plateforme — le
            chauffeur ne la doit plus et reçoit sa part nette en versement
            quotidien. Les paiements par carte sont traités de façon
            sécurisée par Stripe (3-D Secure) : Stacks Drive ne voit, ne
            stocke et ne transmet jamais le numéro de carte.
          </p>
          <p>
            <strong>Caution par carte et remboursement.</strong> Le chauffeur
            peut verser son dépôt de garantie de 5 000 FCFA par carte
            bancaire (frais de paiement à sa charge, affichés avant
            confirmation). Quand il quitte la plateforme proprement, sa
            caution lui est remboursée automatiquement sur sa carte, sous
            5 à 10 jours ouvrés. Le remboursement est intégral, sauf dans
            deux cas : (1) s’il doit encore des commissions, le montant dû
            est déduit du remboursement et le reste lui est remboursé ;
            (2) en cas de fraude confirmée par la plateforme, la caution
            est confisquée. Le chauffeur peut aussi rembourser sa dette de
            commission par carte, à tout moment : le montant payé est
            déduit de sa dette immédiatement.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">8. Comportement, sécurité et signalement</h2>
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
          <h2 className="text-lg font-black text-white">9. Responsabilité</h2>
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
          <h2 className="text-lg font-black text-white">10. Données personnelles et cookies</h2>
          <p>
            Le traitement des données personnelles est décrit dans notre{' '}
            <Link href="/confidentialite" className="text-sarcelle font-bold hover:underline">
              politique de confidentialité
            </Link>{' '}
            et notre{' '}
            <Link href="/cookies" className="text-sarcelle font-bold hover:underline">
              politique cookies
            </Link>
            .
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">11. Suspension et suppression de compte</h2>
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
          <h2 className="text-lg font-black text-white">12. Modifications et droit applicable</h2>
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
          <h2 className="text-lg font-black text-white">13. Contact</h2>
          <p>
            Pour toute question :{' '}
            <a href="mailto:stacks.markett@gmail.com" className="text-sarcelle font-bold hover:underline">
              stacks.markett@gmail.com
            </a>
            .
          </p>
        </section>

        <p className="text-sm text-slate-400">
          Dernière mise à jour : novembre 2026.{' '}
          <Link href="/" className="text-sarcelle font-bold hover:underline">
            Retour à l’accueil
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
