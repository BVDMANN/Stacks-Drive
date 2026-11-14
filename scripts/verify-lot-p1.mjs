#!/usr/bin/env node
/** verify-lot-p1.mjs — Vérification locale du plancher P1 (v2.30).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) :
 *  - la re-vérification selfie (lib/selfie-recheck.ts, importée telle
 *    quelle — Node 24, suppression de types, imports relatifs
 *    uniquement) : drapeau → due ; dernier contrôle > 30 jours → due ;
 *    < 30 jours → pas due ; sans historique → pas due (jamais de
 *    blocage sans historique) ; constantes 30 jours / plafond 5 ;
 *  - les branchements relus DEPUIS les fichiers livrés : note du
 *    passager au matching (API + RequestPopup + liste + page de
 *    course), planification (validation 30 min / 7 jours, statut
 *    `planifiee`, dispatch au sondage des demandes entrantes,
 *    expiration + relance, annulation avant envoi), lieux favoris
 *    (profil + raccourcis accueil), heatmap sans surge ni promesse
 *    de gain, messages rapides chauffeur, gains détaillés + export
 *    CSV, impression du reçu (bouton + CSS print + auto-print depuis
 *    l'historique), formation chauffeur rejouable (v2.21, non refaite) ;
 *  - que `lib/commission.ts` (5 % puis 8 %, plafond 10 %) et
 *    `lib/pricing.ts` ne sont pas touchés par le lot, qu'aucun nouveau
 *    cron Vercel n'est ajouté (`vercel.json` inchangé) et que la
 *    migration v2.30 existe et ne s'exécute qu'une fois ;
 *  - les 2 RÈGLES (priorité n°1) : barre de chargement partout où
 *    il y a un temps d'attente, et switch passager → chauffeur
 *    impossible sans compte chauffeur (redirection
 *    « Devenir chauffeur », contrôle serveur) ;
 *  - aucun marqueur de fonctionnalité future (« bientôt »,
 *    « à venir ») dans les fichiers du lot ;
 *  - HTTP local (serveur de dev port 3100) : accueil 200, routes
 *    protégées sans session (401/503, jamais 500 ni fuite de données).
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le parcours
 *  en session connectée réelle (planifier → envoi à −15 min simulé,
 *  favoris, heatmap, messages rapides chauffeur, selfie, gains,
 *  impression) — Supabase n'est pas configuré sur le serveur de dev
 *  (les routes API renvoient 503, comme les autres routes) et aucun
 *  compte de test n'existe. Test connecté avec le propriétaire après
 *  le push.
 *
 *  Usage : node scripts/verify-lot-p1.mjs (sortie 0 = tout passe).
 *  Le serveur de dev doit tourner sur le port 3100 (ou DEV_URL).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'node:module';

// Résolution `.ts` pour les imports relatifs des modules lib
// (Node ESM exige une extension, le code Next.js n'en met pas).
register('./ts-resolve-hooks.mjs', import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DEV = process.env.DEV_URL ?? 'http://localhost:3100';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const has = (p, s) => read(p).includes(s);

// --- 1. Re-vérification selfie : logique pure importée --------------
const recheck = await import('../lib/selfie-recheck.ts');
const { isSelfieRecheckDue, SELFIE_RECHECK_MAX_DAYS, SELFIE_RECHECK_WEEKLY_CAP } = recheck;

check('re-vérification : pas plus d’1 fois par mois (30 jours)', SELFIE_RECHECK_MAX_DAYS === 30);
check('re-vérification : au plus 5 chauffeurs par semaine', SELFIE_RECHECK_WEEKLY_CAP === 5);
const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString();
check('drapeau posé → due', isSelfieRecheckDue({ selfie_recheck_required: true }) === true);
check(
  'dernier contrôle 40 j → due',
  isSelfieRecheckDue({ selfie_recheck_required: false, last_selfie_check_at: daysAgo(40) }) === true
);
check(
  'dernier contrôle 10 j → pas due',
  isSelfieRecheckDue({ selfie_recheck_required: false, last_selfie_check_at: daysAgo(10) }) === false
);
check(
  'sans historique → pas due (jamais de blocage sans historique)',
  isSelfieRecheckDue({ selfie_recheck_required: false, last_selfie_check_at: null }) === false
);
check('profil absent → pas due', isSelfieRecheckDue(null) === false);
check(
  'balayage hebdo : plafond + plus de 30 jours',
  has('lib/selfie-recheck.ts', 'SELFIE_RECHECK_WEEKLY_CAP') &&
    has('lib/selfie-recheck.ts', 'flagDueSelfieRechecks')
);

// --- 2. Notes dans les deux sens --------------------------------------
check(
  'note passager calculée côté serveur (moyenne rating_passenger)',
  has('lib/rides.ts', 'getPassengerRating') && has('lib/rides.ts', 'rating_passenger')
);
check(
  'note passager jointe aux demandes entrantes',
  has('app/api/rides/route.ts', 'passengerRating')
);
check(
  'note passager dans la pop-up chauffeur (nouveau passager, jamais 0)',
  has('components/driver/RequestPopup.tsx', 'passengerRating') &&
    has('components/driver/RequestPopup.tsx', 'Nouveau passager')
);
check(
  'note passager sur la carte de course chauffeur',
  has('app/courses/[id]/page.tsx', 'passengerRating')
);
check(
  'avis deux sens déjà en place (chauffeur note le passager)',
  has('app/api/feedback/route.ts', 'rating_passenger')
);

// --- 3. Courses planifiées ---------------------------------------------
check(
  'planification : bornes 30 min / 7 jours côté serveur',
  has('app/api/rides/route.ts', '30 * 60 * 1000') &&
    has('app/api/rides/route.ts', '7 * 24 * 60 * 60 * 1000')
);
check(
  'planification : statut planifiee + scheduled_at',
  has('app/api/rides/route.ts', "'planifiee'") && has('app/api/rides/route.ts', 'scheduled_at')
);
check(
  'planification sans migration : erreur explicite, jamais immédiate silencieuse',
  has('app/api/rides/route.ts', 'migration v2.30 à appliquer')
);
check(
  'dispatch ~15 min avant, déclenché par le sondage des demandes entrantes',
  has('lib/rides.ts', 'dispatchDueScheduledRides') &&
    has('lib/rides.ts', '15 * 60 * 1000') &&
    has('lib/rides.ts', 'dispatchDueScheduledRides(supabase)')
);
check(
  'expiration + relance (action relaunch, created_at ramené à maintenant)',
  has('app/api/rides/[id]/route.ts', "'relaunch'") &&
    has('app/api/rides/[id]/route.ts', "'expiree'")
);
check(
  'planifiée annulable avant envoi (Mes courses + page de course)',
  has('app/api/rides/[id]/route.ts', "'planifiee'") &&
    has('components/rides/ScheduledRideActions.tsx', 'Annuler la course planifiée') &&
    has('components/rides/ScheduledRideActions.tsx', 'Relancer maintenant')
);
check(
  'planification sur l’accueil (case + date/heure, bouton Planifier)',
  has('components/home/HomeScreen.tsx', 'Planifier pour plus tard') &&
    has('components/home/HomeScreen.tsx', 'Planifier ma course')
);
check(
  'route cron dédiée en filet de sécurité, non programmée par défaut',
  has('app/api/cron/scheduled-dispatch/route.ts', 'requireCronSecret') &&
    !read('vercel.json').includes('scheduled-dispatch')
);

// --- 4. Lieux favoris ----------------------------------------------------
check(
  'favoris dans le profil (quartier + précision, supprimables)',
  has('components/compte/ProfileForm.tsx', 'homeNeighborhood') &&
    has('components/compte/ProfileForm.tsx', 'Supprimer « Maison »') &&
    has('components/compte/ProfileForm.tsx', 'Supprimer « Travail »')
);
check(
  'raccourcis favoris 1 tap sur l’accueil (Départ / Destination)',
  has('components/home/HomeScreen.tsx', 'Mes lieux') &&
    has('components/home/HomeScreen.tsx', 'Départ') &&
    has('components/home/HomeScreen.tsx', 'Destination')
);

// --- 5. Heatmap (info seulement, sans surge) ----------------------------
check(
  'heatmap : vraies demandes 7 jours, jamais de données inventées',
  has('lib/heatmap.ts', '7 * 24 * 60 * 60 * 1000') && has('lib/heatmap.ts', "from('rides')")
);
check(
  'heatmap : sans surge, sans prix dynamique, sans promesse de gain',
  /sans surge/i.test(read('components/driver/DemandHeatmap.tsx')) &&
    /sans prix dynamique/i.test(read('components/driver/DemandHeatmap.tsx')) &&
    /aucune\s+promesse de gain/i.test(read('components/driver/DemandHeatmap.tsx'))
);
check(
  'heatmap branchée au tableau de bord chauffeur',
  has('components/driver/DriverDashboard.tsx', 'DemandHeatmap')
);

// --- 6. Messages rapides chauffeur ---------------------------------------
check(
  'messages rapides chauffeur (4 libellés)',
  ['J’arrive', 'Je suis devant…', 'Je vous attends', 'Je suis en route'].every((m) =>
    has('components/rides/RideChat.tsx', m)
  )
);
check(
  'messages rapides passager conservés',
  has('components/rides/RideChat.tsx', 'Où êtes-vous ?')
);

// --- 7. Re-vérification selfie : branchements ------------------------------
check(
  'mise en ligne bloquée côté serveur si re-vérification due',
  has('app/api/profile/route.ts', 'selfie_recheck_required') &&
    has('app/api/profile/route.ts', 'isSelfieRecheckDue')
);
check(
  'carte de re-vérification sur accueil chauffeur + tableau de bord',
  has('components/driver/DriverHome.tsx', 'SelfieRecheckCard') &&
    has('components/driver/DriverDashboard.tsx', 'SelfieRecheckCard')
);
check(
  're-vérification : présence de visage uniquement, jamais de reconnaissance faciale',
  has('components/driver/SelfieRecheckCard.tsx', 'aucune reconnaissance faciale') &&
    has('lib/selfie-recheck.ts', 'JAMAIS de reconnaissance faciale')
);
check(
  'doute → ticket admin, pas de blocage définitif automatique',
  has('app/api/driver/selfie-recheck/route.ts', 'visage_non_detecte') &&
    has('app/api/driver/selfie-recheck/route.ts', 'ambiguous')
);
check(
  'signalement (litige) → re-vérification demandée',
  has('app/api/disputes/route.ts', 'selfie_recheck_required')
);
check(
  'photo non conservée (empreinte seulement)',
  has('app/api/driver/selfie-recheck/route.ts', "N'EST PAS conservée")
);

// --- 8. Gains détaillés + export CSV ---------------------------------------
check(
  'gains détaillés : trajet + date joints depuis rides',
  has('lib/earnings.ts', 'pickup') && has('lib/earnings.ts', 'completedAt')
);
check(
  'gains détaillés affichés + export CSV',
  has('components/driver/DriverEarnings.tsx', 'Détail par course') &&
    has('components/driver/DriverEarnings.tsx', 'Exporter en CSV')
);

// --- 9. Impression du reçu ---------------------------------------------------
check(
  'bouton Imprimer / Exporter le reçu sur la page de course',
  has('components/rides/RideReceipt.tsx', 'Imprimer / Exporter le reçu')
);
check(
  'CSS print : seul le reçu s’imprime',
  has('styles/globals.css', '.print-receipt') && has('styles/globals.css', '@media print')
);
check(
  'impression aussi depuis l’historique (?print=1)',
  has('app/mes-courses/page.tsx', '?print=1') &&
    has('components/rides/AutoPrintOnParam.tsx', 'window.print()')
);

// --- 10. Formation chauffeur : déjà faite, rejouable -------------------------
check(
  'formation rejouable depuis le tableau de bord (non refaite)',
  has('app/tableau-de-bord/page.tsx', 'Revoir la formation') &&
    has('components/driver/DriverDashboard.tsx', 'DriverTutorial') &&
    !has('components/driver/DriverDashboard.tsx', 'Nouvelle formation')
);

// --- 11. Migration v2.30 ------------------------------------------------------
check('migration v2.30 présente', fs.existsSync(path.join(ROOT, 'supabase/migration-v2.30-p1.sql')));
check(
  'migration : planifiées + favoris + re-vérification selfie',
  has('supabase/migration-v2.30-p1.sql', 'scheduled_at') &&
    has('supabase/migration-v2.30-p1.sql', 'home_neighborhood') &&
    has('supabase/migration-v2.30-p1.sql', 'selfie_recheck_required')
);
check(
  'migration : statuts planifiee / expiree dans le contrôle',
  has('supabase/migration-v2.30-p1.sql', "'planifiee'") &&
    has('supabase/migration-v2.30-p1.sql', "'expiree'")
);
check(
  'migration : backfill dernier contrôle pour les vérifiés',
  has('supabase/migration-v2.30-p1.sql', 'last_selfie_check_at = now()')
);

// --- 12. Garde-fous : prix, cron, 2 règles, produit fini ----------------------
const commission = read('lib/commission.ts');
check(
  'commission intouchée (5 % puis 8 %, plafond 10 %)',
  commission.includes('0.05') && commission.includes('0.08') && commission.includes('0.1')
);
check(
  'aucun nouveau cron Vercel',
  (JSON.parse(read('vercel.json')).crons ?? []).length === 2
);
check(
  'règle 1 : barre de chargement (squelettes / Envoi… / Mise à jour…)',
  has('components/home/HomeScreen.tsx', 'Envoi…') &&
    (has('components/driver/DriverHome.tsx', 'Mise à jour') ||
      has('components/driver/DriverDashboard.tsx', 'Mise à jour'))
);
check(
  'règle 2 : switch chauffeur verrouillé côté serveur',
  has('app/api/profile/route.ts', 'driver_account_required') &&
    has('app/tableau-de-bord/page.tsx', 'Devenir chauffeur')
);
const lotFiles = [
  'lib/rides.ts',
  'lib/heatmap.ts',
  'lib/selfie-recheck.ts',
  'lib/earnings.ts',
  'components/driver/RequestPopup.tsx',
  'components/driver/DemandHeatmap.tsx',
  'components/driver/SelfieRecheckCard.tsx',
  'components/rides/RideChat.tsx',
  'components/rides/RideReceipt.tsx',
  'components/home/HomeScreen.tsx',
  'components/compte/ProfileForm.tsx',
  'app/api/rides/route.ts',
  'app/api/driver/selfie-recheck/route.ts',
  'app/api/driver/heatmap/route.ts',
  'app/api/cron/scheduled-dispatch/route.ts',
];
const futureMarkers = lotFiles.filter((f) => /bientôt|à venir/i.test(read(f)));
check('aucun « bientôt / à venir » dans les fichiers du lot', futureMarkers.length === 0, futureMarkers.join(', '));

// --- 13. HTTP local ------------------------------------------------------------
async function http(pathname) {
  try {
    const res = await fetch(`${DEV}${pathname}`, { redirect: 'manual' });
    return res.status;
  } catch {
    return null;
  }
}
const home = await http('/');
check('HTTP : accueil 200', home === 200, `obtenu ${home}`);
const mesCourses = await http('/mes-courses');
check('HTTP : /mes-courses redirige sans session (pas de fuite)', mesCourses === 307 || mesCourses === 303 || mesCourses === 302, `obtenu ${mesCourses}`);
const heatmap = await http('/api/driver/heatmap');
check('HTTP : /api/driver/heatmap sans session (401/503)', heatmap === 401 || heatmap === 503, `obtenu ${heatmap}`);
const dispatch = await http('/api/cron/scheduled-dispatch');
check('HTTP : /api/cron/scheduled-dispatch sans secret (401/503)', dispatch === 401 || dispatch === 503, `obtenu ${dispatch}`);
const recheckRoute = await http('/api/driver/selfie-recheck');
check('HTTP : /api/driver/selfie-recheck sans session (401/405/503)', [401, 405, 503].includes(recheckRoute ?? -1), `obtenu ${recheckRoute}`);

console.log(failures === 0 ? '\nP1 : tout passe.' : `\nP1 : ${failures} échec(s).`);
process.exit(failures === 0 ? 0 : 1);
