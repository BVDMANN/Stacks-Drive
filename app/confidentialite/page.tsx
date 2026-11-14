import Link from 'next/link';
import { PageShell } from '@/components/shared/PageShell';

export const metadata = {
  title: 'Politique de confidentialité — Stacks Drive',
  description: 'Politique de confidentialité de la plateforme Stacks Drive (Libreville, Gabon).',
};

export default function ConfidentialitePage() {
  return (
    <PageShell dark title="Politique de confidentialité" subtitle="Comment Stacks Drive collecte, utilise et protège vos données.">
      <div className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-300 leading-relaxed">

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">1. Responsable du traitement</h2>
          <p>
            Stacks, entreprise individuelle, SIREN 104 314 687 — contact :{' '}
            <a href="mailto:stacks.markett@gmail.com" className="text-cyan font-bold hover:underline">
              stacks.markett@gmail.com
            </a>
            . Le service Stacks Drive est opéré à Libreville, au Gabon.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">2. Données collectées</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Compte :</strong> e-mail, nom complet, téléphone, rôle (passager / chauffeur), informations du véhicule pour les chauffeurs (type, marque, modèle, couleur, plaque, places).</li>
            <li><strong>Vérification chauffeur :</strong> selfie de vérification et pièce d’identité (carte nationale d’identité ou passeport) ou permis de conduire. Ces documents sont sensibles : ils sont stockés dans un espace privé et contrôlés automatiquement par la plateforme (détection du visage, lecture de la pièce), puis, en cas de dossier ambigu, par l’administrateur chargé du contrôle ; ils ne sont jamais montrés aux passagers (seul le badge « Vérifié » s’affiche).</li>
            <li><strong>Géolocalisation :</strong> votre position, uniquement lorsque vous appuyez sur « Me localiser » pour définir votre point de départ. La position n’est jamais suivie en continu et n’est jamais conservée après la course.</li>
            <li><strong>Courses :</strong> demandes (départ, destination, type Solo ou Groupe, places, estimation indicative, prix proposé par le passager le cas échéant), propositions des chauffeurs (prix, places restantes, premier arrêt), statut et historique des courses, notes entre passagers et chauffeurs.</li>
            <li><strong>Commission et dépôt chauffeur :</strong> dépôt de garantie versé, commissions dues par course et règlements hebdomadaires (montants et références de transfert). Stacks Drive ne conserve aucune donnée bancaire : tous les paiements sont des transferts directs de personne à personne par Mobile Money (Airtel Money, Moov Money).</li>
            <li><strong>Technique :</strong> cookies de session indispensables à la connexion (voir notre{' '}
              <Link href="/cookies" className="text-cyan font-bold hover:underline">
                politique cookies
              </Link>
              ). Aucun cookie publicitaire, aucun suivi à des fins de publicité.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">3. Finalités et base légale</h2>
          <p>
            Les données servent uniquement à faire fonctionner la plateforme :
            créer et sécuriser votre compte, vous mettre en relation avec un
            chauffeur ou un passager, afficher le prix et le suivi de la
            course, vérifier l’identité des chauffeurs pour la sécurité de
            tous, gérer le dépôt, les commissions dues et leur règlement, et vous envoyer les e-mails
            indispensables (vérification d’inscription, réinitialisation de
            mot de passe). Base légale : exécution du service demandé ;
            vérification et sécurité relevant de l’intérêt légitime ;
            consentement pour la géolocalisation (vous pouvez toujours saisir votre
            départ à la main).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">4. Destinataires</h2>
          <p>
            Vos données ne sont jamais vendues. Elles sont visibles uniquement
            par les personnes concernées : un chauffeur voit les demandes des
            passagers de son périmètre (départ, destination, places) ; un
            passager voit le nom, la photo, la note, le véhicule et la plaque
            du chauffeur qui a accepté sa course ; l’administrateur voit les
            documents de vérification pour les contrôler. Nos sous-traitants
            techniques (Supabase pour la base de données et
            l’authentification, hébergée à Francfort en Europe ; Vercel pour
            l’hébergement du site) n’y accèdent que pour faire fonctionner le
            service. Les documents de vérification ne sont jamais transmis à
            des tiers.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">5. Conservation</h2>
          <p>
            Vos données sont conservées tant que votre compte est actif. Les
            documents de vérification sont conservés tant que le chauffeur
            est actif sur la plateforme, puis supprimés. Vous pouvez demander la
            suppression de votre compte et de vos données à tout moment en
            écrivant à{' '}
            <a href="mailto:stacks.markett@gmail.com" className="text-cyan font-bold hover:underline">
              stacks.markett@gmail.com
            </a>{' '}
            ; la suppression est effectuée sous 30 jours, sauf obligation
            légale de conservation.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">6. Vos droits</h2>
          <p>
            Vous disposez d’un droit d’accès, de rectification, d’effacement,
            de limitation et de portabilité de vos données, ainsi que d’un
            droit d’opposition. Pour exercer ces droits, écrivez à{' '}
            <a href="mailto:stacks.markett@gmail.com" className="text-cyan font-bold hover:underline">
              stacks.markett@gmail.com
            </a>
            . Vous pouvez également introduire une réclamation auprès de la CNIL
            (France, au titre du RGPD) et auprès de l’APDPVP, l’autorité
            gabonaise de protection des données personnelles (loi
            n°001/2011 relative à la protection des données à caractère
            personnel).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">7. Sécurité</h2>
          <p>
            Les mots de passe sont chiffrés par notre prestataire
            d’authentification et ne sont jamais stockés en clair. L’accès
            aux données est protégé par des règles d’accès strictes (chaque
            utilisateur ne voit que ses propres données et celles qui le
            concernent). Les documents de vérification sont stockés dans un
            espace privé, avec des liens d’accès temporaires réservés à
            l’administrateur.
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
