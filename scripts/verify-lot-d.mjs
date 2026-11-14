#!/usr/bin/env node
/** verify-lot-d.mjs — Vérification locale du lot D (v2.26).
 *
 *  Ce que ce script vérifie SANS base de données (Supabase non
 *  configuré en dev) : la logique pure de détection de fraude et
 *  de nettoyage, en relisant les seuils DEPUIS les fichiers livrés
 *  (`lib/fraud.ts`, `lib/data-cleanup.ts`) — jamais recopiés à la
 *  main ici. Les cas simulés rejouent les mêmes règles que le code
 *  (mêmes formules, mêmes seuils extraits) : un seuil modifié dans
 *  `lib/fraud.ts` change les attentes du test, pas l'inverse.
 *
 *  Il vérifie aussi : la validité YAML du workflow CI, la présence
 *  des objets de la migration v2.26, l'enregistrement de la sorte
 *  d'alerte `fraud_detected`, et que `vercel.json` ne contient
 *  toujours que les 2 crons existants (aucun nouveau cron).
 *
 *  Ce qu'il ne peut PAS vérifier ici (dit honnêtement) : le
 *  workflow contre GitHub Actions, ni le comportement en session
 *  connectée réelle (RLS, fonctions SECURITY DEFINER) — test
 *  connecté avec le propriétaire après le push.
 *
 *  Usage : node scripts/verify-lot-d.mjs (sortie 0 = tout passe).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures += 1;
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function numConst(src, name, file) {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([\\d.]+);`));
  if (!m) throw new Error(`constante ${name} introuvable dans ${file}`);
  return Number(m[1]);
}

// --- Seuils relus depuis le code livré ---
const fraud = read('lib/fraud.ts');
const cleanup = read('lib/data-cleanup.ts');
const CANCEL_MIN = numConst(fraud, 'FRAUD_CANCEL_MIN_BY_ME', 'lib/fraud.ts');
const CANCEL_RATE = numConst(fraud, 'FRAUD_CANCEL_MIN_RATE', 'lib/fraud.ts');
const CANCEL_TOTAL = numConst(fraud, 'FRAUD_CANCEL_MIN_TOTAL', 'lib/fraud.ts');
const SPEED_MAX = numConst(fraud, 'FRAUD_SPEED_MAX_KMH', 'lib/fraud.ts');
const SPEED_MIN_DIST = numConst(fraud, 'FRAUD_SPEED_MIN_DISTANCE_KM', 'lib/fraud.ts');
const SPEED_MIN_DUR = numConst(fraud, 'FRAUD_SPEED_MIN_DURATION_MIN', 'lib/fraud.ts');
const PIN_MIN = numConst(fraud, 'FRAUD_PIN_LOCKED_MIN', 'lib/fraud.ts');
const PHONE_ALERT = numConst(fraud, 'FRAUD_SHARED_PHONE_ALERT_MIN', 'lib/fraud.ts');
const PHONE_BLOCK = numConst(fraud, 'FRAUD_SHARED_PHONE_BLOCK_MIN', 'lib/fraud.ts');
const LOC_MAX_H = numConst(cleanup, 'DRIVER_LOCATION_MAX_AGE_HOURS', 'lib/data-cleanup.ts');
const INACTIVE_DAYS = numConst(cleanup, 'INACTIVE_ACCOUNT_DAYS', 'lib/data-cleanup.ts');

console.log('Seuils relus depuis le code :');
console.log(`  annulations fraude : ${CANCEL_MIN}+ et taux > ${CANCEL_RATE} sur ${CANCEL_TOTAL}+ courses (P0a : 3 / 25 %)`);
console.log(`  vitesse : > ${SPEED_MAX} km/h (min ${SPEED_MIN_DIST} km, ${SPEED_MIN_DUR} min)`);
console.log(`  PIN : ${PIN_MIN} courses verrouillées / 30 jours (lot B : 1 course = alerte seule)`);
console.log(`  téléphone partagé : alerte dès ${PHONE_ALERT}, blocage dès ${PHONE_BLOCK}`);
console.log(`  positions chauffeur : max ${LOC_MAX_H} h ; comptes inactifs : ${INACTIVE_DAYS} jours (comptés seulement)`);
console.log('');
console.log('Cas simulés (logique pure) :');

// Mêmes formules que lib/fraud.ts, seuils extraits ci-dessus.
const cancelFraud = (byMe, total) => {
  const rate = total > 0 ? byMe / total : 0;
  return byMe >= CANCEL_MIN && rate > CANCEL_RATE && total >= CANCEL_TOTAL;
};
const speedKmh = (km, min) => (km < SPEED_MIN_DIST || min < SPEED_MIN_DUR ? null : km / (min / 60));
const speedFraud = (km, min) => {
  const s = speedKmh(km, min);
  return s !== null && s > SPEED_MAX;
};
const pinFraud = (locked) => locked >= PIN_MIN;
const phoneFraud = (n) => ({ alert: n >= PHONE_ALERT, block: n >= PHONE_BLOCK });

// Annulations : au-delà du P0a, pas avant.
check('annulations : 3 annul. / 12 courses (25 %) = P0a seulement, pas fraude', !cancelFraud(3, 12));
check('annulations : 5 annul. / 12 courses (42 %) = pas fraude (seuil 6)', !cancelFraud(5, 12));
check('annulations : 6 annul. / 14 courses (43 %) = fraude', cancelFraud(6, 14));
check('annulations : 6 annul. / 20 courses (30 %) = pas fraude (taux)', !cancelFraud(6, 20));
check('annulations : 6 annul. / 8 courses = pas fraude (moins de 10 clôturées)', !cancelFraud(6, 8));

// Vitesse : incohérences manifestes seulement.
check('vitesse : 12 km en 30 min (24 km/h) = normal', !speedFraud(12, 30));
check('vitesse : 25 km en 10 min (150 km/h) = limite, pas fraude', !speedFraud(25, 10));
check('vitesse : 30 km en 10 min (180 km/h) = fraude', speedFraud(30, 10));
check('vitesse : 0,5 km en 1 min = trop court, on ne conclut pas', speedKmh(0.5, 1) === null);
check('vitesse : 5 km en 0 min = durée nulle, on ne conclut pas', speedKmh(5, 0) === null);

// PIN : une course verrouillée = alerte lot B seule.
check('PIN : 1 course verrouillée = pas fraude', !pinFraud(1));
check('PIN : 2 courses verrouillées / 30 j = fraude', pinFraud(2));

// Téléphone partagé : alerte dès 2, blocage dès 3.
check('téléphone : 1 compte = rien', !phoneFraud(1).alert && !phoneFraud(1).block);
check('téléphone : 2 comptes = alerte, pas de blocage', phoneFraud(2).alert && !phoneFraud(2).block);
check('téléphone : 3 comptes = alerte + blocage', phoneFraud(3).alert && phoneFraud(3).block);

// Normalisation téléphone (même règle que lib/fraud.ts).
const normalizePhone = (p) => {
  const digits = (p ?? '').replace(/\D/g, '').replace(/^(00241|241)/, '').replace(/^0/, '');
  return digits.length >= 8 ? digits : null;
};
check(
  'téléphone : +241 06 12 34 56 = 00241 6123456 = 06123456',
  normalizePhone('+241 06 12 34 56') === normalizePhone('00241 6123456') &&
    normalizePhone('00241 6123456') === normalizePhone('06123456')
);
check('téléphone : numéro trop court ignoré', normalizePhone('123') === null);

console.log('');
console.log('Cohérence code / migration / alertes :');
const alerts = read('lib/admin-alerts.ts');
check('alerte fraud_detected enregistrée (lib/admin-alerts.ts)', alerts.includes("'fraud_detected'"));
check('alerte fraud_detected : délai 7 jours', /fraud_detected:\s*7 \* 24/.test(alerts));
check('audit : événements fraud_blocked / fraud_unblocked / data_cleanup', read('lib/audit.ts').includes('fraud_blocked') && read('lib/audit.ts').includes('data_cleanup'));

const migration = read('supabase/migration-v2.26-fraud.sql');
for (const obj of [
  'fraud_cases',
  'data_cleanups',
  'report_fraud_case',
  'resolve_fraud_case',
  'run_data_cleanup',
  'fraud_blocked',
  'fraud_cases_one_open_idx',
]) {
  check(`migration v2.26 : contient ${obj}`, migration.includes(obj));
}
check('migration v2.26 : aucun DROP TABLE', !/drop table/i.test(migration));
check('migration v2.26 : idempotente (IF NOT EXISTS)', migration.includes('if not exists'));

const vercel = JSON.parse(read('vercel.json'));
check(
  'vercel.json : toujours 2 crons, aucun nouveau',
  Array.isArray(vercel.crons) &&
    vercel.crons.length === 2 &&
    vercel.crons.some((c) => c.path === '/api/cron/weekly-report') &&
    vercel.crons.some((c) => c.path === '/api/cron/weekly-settlements')
);

const ci = read('.github/workflows/ci.yml');
check('workflow CI : contient npm run build', ci.includes('npm run build'));
check('workflow CI : contient npm run docs:check', ci.includes('npm run docs:check'));
check('workflow CI : push + pull_request sur main', ci.includes('push:') && ci.includes('pull_request:') && ci.includes('[main]'));
check('workflow CI : aucun secret (pas de ${{ secrets)', !ci.includes('secrets.'));
try {
  execFileSync('python3', ['-c', 'import sys, yaml; yaml.safe_load(open(sys.argv[1]))', path.join(ROOT, '.github/workflows/ci.yml')], { stdio: 'pipe' });
  check('workflow CI : YAML valide (python yaml.safe_load)', true);
} catch {
  check('workflow CI : YAML valide (python yaml.safe_load)', false, 'python3/pyyaml indisponible ou YAML invalide');
}

check('confidentialité §5 : durées de conservation précisées', read('app/confidentialite/page.tsx').includes('24 heures') && read('app/confidentialite/page.tsx').includes('12 mois'));
check('règle fraude : jamais de suppression de compte auto (lib/data-cleanup.ts)', /jamais[\s\S]{0,80}supprim/i.test(cleanup));
check('commission.ts non touchée par ce lot', !read('lib/commission.ts').includes('v2.26'));

console.log('');
if (failures === 0) {
  console.log('Lot D : tous les contrôles passent.');
} else {
  console.log(`Lot D : ${failures} contrôle(s) en échec.`);
  process.exit(1);
}
