import Link from 'next/link';
import { PageShell } from '@/components/shared/PageShell';

export const metadata = {
  title: 'Politique de confidentialité — Stacks Drive',
  description: 'Politique de confidentialité de la plateforme Stacks Drive (Libreville, Gabon).',
};

export default function ConfidentialitePage() {
  return (
    <PageShell dark title="Politique de confidentialité" subtitle="Comment Stacks Drive collecte, utilise et protège tes données.">
      <div className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-300 leading-relaxed">
        <p className="text-sm bg-gold/10 border border-gold/30 text-gold rounded-2xl px-4 py-3">
          Document rédigé en novembre 2026. Il sera relu par un juriste avant
          le lancement commercial de la plateforme.
        </p>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">1. Responsable du traitement</h2>
          <p>
            Stacks, entreprise individuelle, SIREN 104 314 687, 5 allée Xavier
            Bichat, 77420 Champs-sur-Marne, France — contact :{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-volt font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>
            . Le service Stacks Drive est opéré à Libreville, au Gabon.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">2. Données collectées</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Compte :</strong> e-mail, nom complet, téléphone, rôle (passager / chauffeur), informations du véhicule pour les chauffeurs (type, marque, modèle, couleur, plaque, places).</li>
            <li><strong>Vérification chauffeur :</strong> selfie de vérification et pièce d’identité (carte nationale d’identité ou passeport) ou permis de conduire. Ces documents sont sensibles : ils sont stockés dans un espace privé, accessibles uniquement à l’administrateur chargé du contrôle, et ne sont jamais montrés aux passagers (seul le badge « Vérifié » s’affiche).</li>
            <li><strong>Géolocalisation :</strong> ta position, uniquement quand tu appuies sur « Me localiser » pour définir ton point de départ. La position n’est jamais suivie en continu et n’est jamais conservée après la course.</li>
            <li><strong>Courses :</strong> demandes (départ, destination, type Solo ou Groupe, places, prix estimé), propositions des chauffeurs (prix, places restantes, premier arrêt), statut et historique des courses, notes entre passagers et chauffeurs.</li>
            <li><strong>Solde chauffeur :</strong> montant du solde, recharges et commissions prélevées. Stacks Drive ne conserve aucune donnée bancaire : les recharges passent par Mobile Money (Airtel Money, Moov Money).</li>
            <li><strong>Technique :</strong> cookies de session indispensables à la connexion (voir notre{' '}
              <Link href="/cookies" className="text-volt font-bold hover:underline">
                politique cookies
              </Link>
              ). Aucun cookie publicitaire, aucun suivi à des fins de publicité.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">3. Finalités et base légale</h2>
          <p>
            Les données servent uniquement à faire fonctionner la plateforme :
            créer et sécuriser ton compte, te mettre en relation avec un
            chauffeur ou un passager, afficher le prix et le suivi de la
            course, vérifier l’identité des chauffeurs pour la sécurité de
            tous, gérer le solde et les commissions, et t’envoyer les e-mails
            indispensables (vérification d’inscription, réinitialisation de
            mot de passe). Base légale : exécution du service demandé ;
            vérification et sécurité relevant de l’intérêt légitime ;
            consentement pour la géolocalisation (tu peux toujours saisir ton
            départ à la main).
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">4. Destinataires</h2>
          <p>
            Tes données ne sont jamais vendues. Elles sont visibles uniquement
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
            Tes données sont conservées tant que ton compte est actif. Les
            documents de vérification sont conservés tant que le chauffeur
            est actif sur la plateforme, puis supprimés. Tu peux demander la
            suppression de ton compte et de tes données à tout moment en
            écrivant à{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-volt font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>{' '}
            ; la suppression est effectuée sous 30 jours, sauf obligation
            légale de conservation.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">6. Tes droits</h2>
          <p>
            Tu disposes d’un droit d’accès, de rectification, d’effacement,
            de limitation et de portabilité de tes données, ainsi que d’un
            droit d’opposition. Pour exercer ces droits, écris à{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-volt font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>
            . Tu peux également introduire une réclamation auprès de la CNIL
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
          <Link href="/" className="text-volt font-bold hover:underline">
            Retour à l’accueil
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
