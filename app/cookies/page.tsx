import Link from 'next/link';
import { PageShell } from '@/components/shared/PageShell';

export const metadata = {
  title: 'Politique cookies — Stacks Drive',
  description: 'Politique cookies de la plateforme Stacks Drive (Libreville, Gabon).',
};

export default function CookiesPage() {
  return (
    <PageShell dark title="Politique cookies" subtitle="Ce que Stacks Drive stocke dans ton navigateur — et ce qu’elle ne stocke pas.">
      <div className="bg-night-800/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-slate-300 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">1. Ce qu’est un cookie</h2>
          <p>
            Un cookie est un petit fichier déposé dans ton navigateur quand tu
            visites un site. Il permet au site de te reconnaître, de garder
            ta session ouverte ou de mémoriser un réglage. Stacks Drive
            n’utilise que le strict minimum : aucun cookie publicitaire,
            aucun suivi à des fins de publicité, aucune revente de données de
            navigation.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">2. Cookies utilisés</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-white/10 rounded-2xl overflow-hidden">
              <thead>
                <tr className="bg-night-700 text-left">
                  <th className="px-4 py-3 font-black text-white">Nom</th>
                  <th className="px-4 py-3 font-black text-white">Rôle</th>
                  <th className="px-4 py-3 font-black text-white">Durée</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/10">
                  <td className="px-4 py-3 font-bold text-white">Session (Supabase Auth)</td>
                  <td className="px-4 py-3">Garder ta connexion ouverte quand tu es connecté(e).</td>
                  <td className="px-4 py-3">Session (supprimé à la déconnexion ou à l’expiration).</td>
                </tr>
                <tr className="border-t border-white/10">
                  <td className="px-4 py-3 font-bold text-white">Préférences (stockage local)</td>
                  <td className="px-4 py-3">Mémoriser ton brouillon de course et tes derniers choix (départ, destination, type Solo ou Groupe).</td>
                  <td className="px-4 py-3">Conservé sur ton appareil jusqu’à effacement manuel.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            La carte (Leaflet / OpenStreetMap) affiche des tuiles d’images
            publiques ; elle ne dépose pas de cookie de suivi. Aucun outil
            de mesure d’audience ni de publicité n’est installé à ce jour :
            si un jour nous en ajoutons un, cette page sera mise à jour et
            ton consentement sera demandé.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">3. Gérer les cookies</h2>
          <p>
            Tu peux refuser ou supprimer les cookies depuis les réglages de
            ton navigateur (Chrome, Safari, Firefox…). Attention : sans le
            cookie de session, la connexion à ton compte ne fonctionne pas —
            tu pourras consulter la carte et les tarifs, mais pas commander
            ni te mettre en ligne. Les préférences stockées localement
            peuvent être effacées à tout moment depuis ton navigateur sans
            conséquence sur ton compte.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black text-white">4. Contact et mise à jour</h2>
          <p>
            Pour toute question sur les cookies et tes données, écris à{' '}
            <a href="mailto:boulinguirandy12@gmail.com" className="text-volt font-bold hover:underline">
              boulinguirandy12@gmail.com
            </a>
            . Voir aussi notre{' '}
            <Link href="/confidentialite" className="text-volt font-bold hover:underline">
              politique de confidentialité
            </Link>
            . Cette page est mise à jour en même temps que nos pratiques.
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
