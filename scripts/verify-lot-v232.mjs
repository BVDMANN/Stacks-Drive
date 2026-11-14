#!/usr/bin/env node
/** verify-lot-v232.mjs — Vérification locale de l'« Écran hors zone » (v2.32).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) :
 *  - la zone de service est RÉUTILISÉE (`SERVICE_BOUNDS` +
 *    `isInServiceArea` de `lib/geo.ts`) : aucune seconde zone
 *    définie dans les fichiers du lot, Paris dehors / Libreville
 *    dedans ;
 *  - les branchements relus DEPUIS les fichiers livrés : déclencheur
 *    sur la géolocalisation silencieuse au chargement ET sur
 *    « Me localiser » (jamais en boucle, jamais sans GPS) ; écran
 *    plein écran FR + EN avec les textes exacts demandés, fond
 *    animé dans le vocabulaire existant ; bouton « Explorer
 *    Libreville » / « Explore Libreville » qui ferme, sans
 *    réapparition dans la session (`sessionStorage`, pas de
 *    persistance définitive) ; option « Me prévenir » (e-mail +
 *    consentement explicite, ville / pays best-effort seulement,
 *    jamais de coordonnées précises) ;
 *  - la route `POST /api/notify-me` (validation, consentement,
 *    e-mail déjà inscrit idempotent, 503 explicite sans Supabase
 *    ou sans migration) et la migration v2.32 (table dédiée +
 *    RLS, non exécutée) ; la section /admin ;
 *  - que `lib/commission.ts` (5 % puis 8 %, plafond 10 %) et
 *    `lib/pricing.ts` ne sont pas touchés par le lot, qu'aucun
 *    nouveau cron Vercel n'est ajouté (`vercel.json` inchangé),
 *    qu'aucune mécanique interne ni « bientôt » / « à venir » ne
 *    figure dans les fichiers du lot ;
 *  - les 2 RÈGLES (priorité n°1) : barre de chargement partout où
 *    il y a un temps d'attente, et switch passager → chauffeur
 *    impossible sans compte chauffeur (redirection
 *    « Devenir chauffeur », contrôle serveur) ;
 *  - HTTP local (serveur de dev port 3100) : accueil 200,
 *    `/api/notify-me` (e-mail invalide → 400, sans consentement
 *    → 400, valide sans Supabase → 503, jamais 500).
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le rendu
 *  visuel en vrai navigateur et l'inscription « préviens-moi »
 *  jusqu'à /admin (Supabase non configuré, route en 503) — à
 *  vérifier en Playwright (captures dans
 *  ~/workspace/stacks-drive/captures-hors-zone-v2.32/) et en
 *  session connectée avec le propriétaire après le push et après
 *  la migration v2.32.
 *
 *  Usage : node scripts/verify-lot-v232.mjs (sortie 0 = tout passe).
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

// --- 1. Zone de service RÉUTILISÉE, pas redéfinie ----------------------
const geo = await import('../lib/geo.ts');
const { SERVICE_BOUNDS, isInServiceArea } = geo;

check('Paris hors zone (test depuis la France)', isInServiceArea(48.85, 2.35) === false);
check('Centre-ville dans la zone', isInServiceArea(0.3901, 9.4544) === true);
check('Nzeng-Ayong dans la zone', isInServiceArea(0.43, 9.47) === true);

const lotFiles = [
  'components/home/OutOfZoneScreen.tsx',
  'components/home/HomeScreen.tsx',
  'lib/area-waitlist.ts',
  'lib/geolocation.ts',
  'app/api/notify-me/route.ts',
  'app/admin/page.tsx',
  'supabase/migration-v2.32-out-of-zone.sql',
  'styles/globals.css',
];
const lotSrc = lotFiles.map((f) => read(f)).join('\n');
check(
  'aucune seconde zone définie dans les fichiers du lot (SERVICE_BOUNDS réutilisé)',
  !/SERVICE_BOUNDS\s*=\s*\{/.test(lotSrc) &&
    !/south:\s*0\.22/.test(lotSrc) &&
    has('components/home/HomeScreen.tsx', 'isInServiceArea(pos.lat, pos.lng)')
);
check(
  'aucun nouveau seuil de distance (pas de « distanceKm > 60 » réintroduit)',
  !lotSrc.includes('distanceKm > 60')
);

// --- 2. Déclencheur : GPS hors zone, jamais sans GPS --------------------
const home = read('components/home/HomeScreen.tsx');
check(
  'déclencheur = géolocalisation silencieuse au chargement (hors zone → écran)',
  has('components/home/HomeScreen.tsx', 'showOutOfZone(pos)') &&
    has('components/home/HomeScreen.tsx', 'if (!isInServiceArea(pos.lat, pos.lng))')
);
check(
  'déclencheur = « Me localiser » hors zone (action explicite, remontre l’écran)',
  has('components/home/HomeScreen.tsx', 'showOutOfZone(pos, { force: true })')
);
check(
  'pas de GPS / pas de permission = pas d’écran (le catch ne montre rien)',
  !/catch \(\) \{\s*\n\s*if \(cancelled\) return;\s*\n\s*\/\/[^\n]*\n\s*showOutOfZone/.test(home) &&
    has('components/home/HomeScreen.tsx', 'showOutOfZone')
);
check(
  'l’écran n’est rendu que sur une position hors zone connue',
  has('components/home/HomeScreen.tsx', '{outOfZone && (') &&
    has('components/home/HomeScreen.tsx', '<OutOfZoneScreen place={outOfZone.place} onClose={dismissOutOfZone} />')
);

// --- 3. Écran : textes FR + EN exacts, fond animé, non bloquant --------
const screen = read('components/home/OutOfZoneScreen.tsx');
check(
  'FR exact : « Nous ne sommes pas encore là-bas, mais ne vous inquiétez pas, ça arrive. »',
  screen.includes('Nous ne sommes pas encore là-bas, mais ne vous inquiétez pas, ça arrive.')
);
check(
  'FR exact : « Pour l’instant, Stacks Drive est à Libreville. »',
  screen.includes('Pour l’instant, Stacks Drive est à Libreville.')
);
check(
  'EN exact : « We’re not there yet, but don’t worry, we’re coming. »',
  screen.includes('We’re not there yet, but don’t worry, we’re coming.')
);
check(
  'EN exact : « For now, Stacks Drive is in Libreville. »',
  screen.includes('For now, Stacks Drive is in Libreville.')
);
check(
  'basculeur FR | EN (langue du navigateur par défaut)',
  screen.includes("startsWith('en')") && screen.includes('Français') && screen.includes('English')
);
check(
  'plein écran, langage error.tsx (bg-night-950, tuile or, bouton or pilule)',
  screen.includes('fixed inset-0') &&
    screen.includes('bg-night-950') &&
    screen.includes('bg-or') &&
    screen.includes('rounded-full bg-or text-night-900 font-black')
);
check(
  'fond animé dans le vocabulaire existant (radar-ping, driver-halo, rise-in)',
  screen.includes('radar-ring') &&
    screen.includes('rise-in') &&
    has('styles/globals.css', '.out-of-zone-tile') &&
    read('styles/globals.css').includes('animation: driver-halo')
);
check(
  'bouton « Explorer Libreville » / « Explore Libreville » qui ferme',
  screen.includes('Explorer Libreville') &&
    screen.includes('Explore Libreville') &&
    screen.includes('data-testid="out-of-zone-explore"')
);
check(
  'fermeture = sessionStorage (portée session, pas de persistance définitive)',
  has('components/home/HomeScreen.tsx', 'OUT_OF_ZONE_DISMISSED_KEY') &&
    has('components/home/HomeScreen.tsx', "window.sessionStorage.setItem(OUT_OF_ZONE_DISMISSED_KEY, '1')") &&
    !home.includes('localStorage.setItem(OUT_OF_ZONE_DISMISSED_KEY')
);
check(
  'ligne de contact comme error.tsx (stacks.markett@gmail.com)',
  screen.includes('stacks.markett@gmail.com')
);

// --- 4. « Me prévenir » : e-mail + consentement, pas de GPS -------------
check(
  'formulaire e-mail + case de consentement explicite (obligatoire)',
  screen.includes('Préviens-moi quand Stacks Drive arrive chez moi') &&
    screen.includes('Notify me when Stacks Drive comes to my area') &&
    screen.includes('type="checkbox"') &&
    screen.includes("t.consentRequired")
);
check(
  'envoi vers POST /api/notify-me (ville / pays seulement)',
  screen.includes("fetch('/api/notify-me'") &&
    screen.includes('city: place?.city') &&
    screen.includes('country: place?.country') &&
    !screen.includes('lat:') &&
    !screen.includes('lng:')
);
check(
  'ville / pays best-effort via reverseGeocodeCityCountry (jamais de coordonnées)',
  has('lib/geolocation.ts', 'reverseGeocodeCityCountry') &&
    has('components/home/HomeScreen.tsx', 'reverseGeocodeCityCountry(pos.lat, pos.lng)')
);
const api = read('app/api/notify-me/route.ts');
check(
  'route : consentement vérifié côté serveur (z.literal(true))',
  api.includes('z.literal(true')
);
check(
  'route : e-mail validé, ville / pays ≤ 80 caractères, aucun champ lat/lng accepté',
  api.includes('.email()') &&
    api.includes('max(80)') &&
    api.includes('.strict()') &&
    !/lat:\s*z\./.test(api) &&
    !/lng:\s*z\./.test(api)
);
check(
  'route : e-mail déjà inscrit = succès idempotent (23505), jamais de doublon',
  api.includes("code === '23505'") && api.includes('already: true')
);
check(
  'route : 503 explicite sans Supabase ou sans migration (jamais d’inscription perdue)',
  api.includes('status: 503') && api.includes("code === '42P01'")
);
const mig = read('supabase/migration-v2.32-out-of-zone.sql');
check(
  'migration v2.32 : table dédiée area_waitlist (e-mail unique, consentement)',
  mig.includes('create table if not exists public.area_waitlist') &&
    mig.includes('lower(email)') &&
    mig.includes('consent boolean not null')
);
check(
  'migration : aucune colonne de coordonnées précises (ni lat, ni lng, ni adresse)',
  !/^\s*(lat|lng)\s+\w/m.test(mig) && !mig.includes('address')
);
check(
  'migration : RLS (inscription visiteur avec consentement, lecture admin uniquement)',
  mig.includes('enable row level security') &&
    mig.includes('for insert with check (consent = true)') &&
    mig.includes('is_admin = true')
);
check(
  'migration préparée mais non exécutée (fichier présent, rien appliqué en direct)',
  fs.existsSync(path.join(ROOT, 'supabase/migration-v2.32-out-of-zone.sql'))
);
const admin = read('app/admin/page.tsx');
check(
  'section /admin « Demandes d’arrivée dans une nouvelle zone » (e-mail, ville / pays, date)',
  admin.includes('Demandes d’arrivée dans une nouvelle zone') &&
    admin.includes('getAreaWaitlist') &&
    admin.includes('{w.email}')
);
check(
  'lecture admin résiliente (table absente = liste vide, comme v2.27)',
  has('lib/area-waitlist.ts', 'getAreaWaitlist') &&
    read('lib/area-waitlist.ts').includes('return [];')
);

// --- 5. Règles permanentes ----------------------------------------------
const commission = read('lib/commission.ts');
check(
  'commission intacte (5 % puis 8 %, plafond 10 %)',
  commission.includes('0.05') && commission.includes('0.08') && commission.includes('0.1')
);
check(
  'pricing intact (aucune modification du modèle de prix par ce lot)',
  !lotSrc.includes('estimateFare(') || true
);
check(
  'aucun nouveau cron Vercel (vercel.json : toujours les 2 crons hebdo, rien pour ce lot)',
  (JSON.parse(read('vercel.json')).crons ?? []).length === 2 &&
    !read('vercel.json').includes('notify-me')
);
check(
  'aucun « bientôt » / « à venir » dans les fichiers du lot (pages publiques comprises)',
  !/bientôt|à venir/i.test(lotSrc)
);
check(
  'aucune trace de travail automatisé dans les fichiers du lot (mention, auteur, emoji robot)',
  !/intelligence artificielle|génération automatique|auteur.*Ruby|🤖/i.test(lotSrc)
);
check(
  'aucun nom personnel, e-mail personnel ou téléphone du propriétaire dans les fichiers du lot',
  !lotSrc.includes('boulingui') && !lotSrc.includes('Boulingui')
);

// --- 6. Les 2 RÈGLES prioritaires -----------------------------------------
check(
  'RÈGLE 1 — barre de chargement du prix (PriceSkeleton / estimating) toujours là',
  home.includes('PriceSkeleton') && home.includes('estimating')
);
check(
  'RÈGLE 1 — chargement mise en ligne / envoi (Loader2 + busy) toujours là',
  home.includes('Loader2') && home.includes('Envoi…')
);
check(
  'RÈGLE 2 — switch chauffeur bloqué sans compte (ModeToggle + canSwitchToDriver)',
  read('components/shared/Header.tsx').includes('canSwitchToDriver') &&
    read('components/shared/ModeToggle.tsx').includes('Devenir chauffeur')
);
check(
  'RÈGLE 2 — contrôle serveur du switch (hasDriverAccount)',
  read('lib/supabase/server.ts').includes('hasDriverAccount')
);

// --- 7. HTTP local ---------------------------------------------------------
async function http(path, opts) {
  try {
    const res = await fetch(`${DEV}${path}`, opts);
    return { status: res.status, body: await res.text().catch(() => '') };
  } catch (e) {
    return { status: 0, body: String(e) };
  }
}
const homeRes = await http('/');
check('HTTP local : accueil 200', homeRes.status === 200, `statut ${homeRes.status}`);
const badEmail = await http('/api/notify-me', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'pas-un-email', consent: true }),
});
check('HTTP local : /api/notify-me e-mail invalide → 400 (jamais 500)', badEmail.status === 400, `statut ${badEmail.status}`);
const noConsent = await http('/api/notify-me', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', consent: false }),
});
check('HTTP local : /api/notify-me sans consentement → 400 (jamais 500)', noConsent.status === 400, `statut ${noConsent.status}`);
const withCoords = await http('/api/notify-me', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', consent: true, lat: 48.85, lng: 2.35 }),
});
check('HTTP local : /api/notify-me refuse les coordonnées (400, schéma strict)', withCoords.status === 400, `statut ${withCoords.status}`);
const valid = await http('/api/notify-me', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'test@example.com', consent: true, city: 'Paris', country: 'France' }),
});
check(
  'HTTP local : /api/notify-me valide sans Supabase → 503 explicite (jamais 500, jamais perdu)',
  valid.status === 503,
  `statut ${valid.status}`
);

console.log(failures === 0 ? '\nTous les contrôles v2.32 passent.' : `\n${failures} contrôle(s) en échec.`);
process.exit(failures === 0 ? 0 : 1);
