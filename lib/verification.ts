/** Vérification chauffeur AUTOMATISÉE (v2.4).
 *
 *  Chaîne de décision (Stacks, 14/11/2026 : « Automatise le max de
 *  trucs » — il ne veut plus approuver manuellement chaque demande) :
 *  le client contrôle les photos (dimensions, visage, OCR de la pièce,
 *  empreintes SHA-256) puis le serveur applique des règles
 *  déterministes et tranche : auto-vérifié, auto-refusé, ou ambigu
 *  (ticket pour l'admin + e-mail).
 *
 *  Frontière de confiance (honnête) : les signaux OCR / visage sont
 *  rapportés par le client ; le serveur re-parse le texte OCR, re-calcule
 *  les empreintes des images depuis les fichiers reçus, et vérifie les
 *  doublons en base — mais il ne refait pas l'OCR lui-même. Les images
 *  sont conservées dans le bucket privé : l'admin peut toujours
 *  re-contrôler un dossier. Une re-vérification OCR 100 % serveur
 *  (ou un service payant type Veriff / Onfido, avec détection de
 *  « photo d'une photo ») reste un durcissement futur, pas un prérequis
 *  au lancement.
 *
 *  Ce module est pur TypeScript (aucun accès réseau / base) : il est
 *  importé côté client (parsing OCR) ET côté serveur (re-parse +
 *  décision). Il ne touche jamais aux tarifs ni aux commissions.
 */

/** Niveaux d'urgence des tickets (du moins au plus urgent). */
export type TicketUrgency = 'basse' | 'moyenne' | 'haute' | 'critique';
export type TicketStatus = 'ouvert' | 'en_cours' | 'resolu';

/** Décision automatique du serveur. */
export type VerificationAutoDecision = 'verifie' | 'refuse' | 'ambigu';

/** Confiance d'un champ lu par OCR. */
export type OcrConfidence = 'forte' | 'moyenne' | 'faible' | 'absente';

/** Résultat de la détection de visage (API native FaceDetector). */
export type FaceCheck = 'detecte' | 'absent' | 'indisponible';

/** Comparaison nom du compte / nom lu sur la pièce. */
export type NameMatch = 'exact' | 'approximatif' | 'aucun' | 'indetermine';

/** Contrôles rapportés par le client (envoyés avec le FormData). */
export interface ClientVerificationChecks {
  /** Visage détecté sur le selfie (API native, Chrome/Android). */
  face: FaceCheck;
  selfieWidth: number;
  selfieHeight: number;
  documentWidth: number;
  documentHeight: number;
  /** Confiance globale Tesseract (0–100, -1 si OCR impossible). */
  ocrConfidence: number;
  /** Texte brut OCR (tronqué à 4 000 caractères). */
  ocrText: string;
  /** Champs extraits de la pièce (MRZ d'abord, texte ensuite). */
  docNumber: string | null;
  docNumberConfidence: OcrConfidence;
  birthDate: string | null; // ISO AAAA-MM-JJ
  birthConfidence: OcrConfidence;
  expiryDate: string | null; // ISO AAAA-MM-JJ
  expiryConfidence: OcrConfidence;
  /** Nom + prénoms lus sur la pièce. */
  nameOnDoc: string | null;
  nameConfidence: OcrConfidence;
  /** SHA-256 hex des images (re-calculés côté serveur). */
  selfieImageHash: string | null;
  documentImageHash: string | null;
  /** SHA-256 hex du numéro de document normalisé (jamais le n° en clair). */
  docNumberHash: string | null;
}

/** Contrôles tels que stockés en base (profiles.verification_checks). */
export interface StoredVerificationChecks {
  client: ClientVerificationChecks;
  server: {
    nameMatch: NameMatch;
    age: number | null;
    isMinor: boolean | null;
    isExpired: boolean | null;
    duplicateDoc: boolean;
    duplicateImage: boolean;
    /** Le hash serveur des images == celui annoncé par le client. */
    imageHashVerified: boolean;
    /** Re-parse serveur du texte OCR (anti-triche basique). */
    ocrReparsed: boolean;
  };
  decision: VerificationAutoDecision;
  /** Codes lisibles expliquant la décision (affichés à l'admin). */
  reasons: string[];
  decidedAt: string; // ISO
}

/** Libellés français des raisons (affichage admin / e-mail). */
export const CHECK_REASON_LABELS: Record<string, string> = {
  face_detecte: 'Visage détecté sur le selfie.',
  face_absent: 'Aucun visage détecté sur le selfie.',
  face_indisponible: 'Détection de visage indisponible sur cet appareil (contrôle non bloquant).',
  ocr_fort: 'Pièce bien lisible (OCR fiable).',
  ocr_moyen: 'Pièce partiellement lisible (OCR moyen).',
  ocr_faible: 'Pièce peu lisible (OCR faible).',
  ocr_absent: 'Texte de la pièce illisible (OCR impossible).',
  mrz_valide: 'Zone MRZ de la pièce validée (chiffres de contrôle corrects).',
  mrz_invalide: 'Zone MRZ lue mais chiffres de contrôle incorrects.',
  nom_exact: 'Nom sur la pièce = nom du compte.',
  nom_approximatif: 'Nom sur la pièce partiellement reconnu (prénom ou nom manquant).',
  nom_aucun: 'Nom sur la pièce différent du nom du compte.',
  nom_indetermine: 'Nom sur la pièce non lisible.',
  majeur: 'Majeur (18 ans ou plus).',
  mineur: 'Mineur (moins de 18 ans) d’après la pièce.',
  naissance_incertaine: 'Date de naissance incertaine.',
  piece_valide: 'Pièce en cours de validité.',
  piece_expiree: 'Pièce expirée d’après la date lue.',
  expiration_incertaine: 'Date d’expiration incertaine.',
  doublon_document: 'Ce numéro de pièce est déjà utilisé par un autre compte chauffeur.',
  doublon_image: 'Cette photo de pièce a déjà été envoyée par un autre compte chauffeur.',
  sans_doublon: 'Aucun doublon détecté.',
  hash_incoherent: 'Empreinte des images différente de celle annoncée (dossier à revoir).',
  dimensions_faibles: 'Image trop petite pour être lisible (moins de 400 px).',
};

/** Types de ticket (kind) — la raison principale qui bloque. */
export type TicketKind =
  | 'doublon'
  | 'mineur_possible'
  | 'expiree_possible'
  | 'nom_approximatif'
  | 'ocr_faible'
  | 'visage_non_detecte'
  | 'photo_illisible'
  | 'controles_indisponibles';

export const TICKET_KIND_LABELS: Record<TicketKind, string> = {
  doublon: 'Doublon de pièce détecté',
  mineur_possible: 'Âge incertain (mineur possible)',
  expiree_possible: 'Expiration incertaine (pièce peut-être expirée)',
  nom_approximatif: 'Nom approximatif',
  ocr_faible: 'Pièce peu lisible (OCR faible)',
  visage_non_detecte: 'Visage non détecté sur le selfie',
  photo_illisible: 'Photo illisible',
  controles_indisponibles: 'Contrôles automatiques indisponibles',
};

// ---------------------------------------------------------------------------
// Normalisation et comparaison de noms
// ---------------------------------------------------------------------------

/** « Dupont, Jean-Marc » → ['dupont', 'jean', 'marc']. */
export function normalizeNameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

export function matchName(accountName: string | null, docName: string | null): NameMatch {
  if (!accountName || !docName) return 'indetermine';
  const account = new Set(normalizeNameTokens(accountName));
  const doc = new Set(normalizeNameTokens(docName));
  if (account.size === 0 || doc.size === 0) return 'indetermine';
  const common = [...account].filter((t) => doc.has(t));
  if (common.length === 0) return 'aucun';
  // Exact si chaque token du plus petit des deux ensembles est dans l'autre
  // (tolère un 2e prénom présent d'un seul côté).
  const smaller = account.size <= doc.size ? account : doc;
  const bigger = account.size <= doc.size ? doc : account;
  const allSmallerInBigger = [...smaller].every((t) => bigger.has(t));
  if (allSmallerInBigger) return 'exact';
  return 'approximatif';
}

// ---------------------------------------------------------------------------
// Dates MRZ (AAMMJJ) et âge
// ---------------------------------------------------------------------------

/** AAMMJJ → ISO. Pivot 30 : 31–99 = 19xx, 00–30 = 20xx (conducteurs de
 *  18 à 95 ans). Retourne null si la date est invalide. */
export function mrzDateToIso(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  const dd = Number(yymmdd.slice(4, 6));
  const year = yy > 30 ? 1900 + yy : 2000 + yy;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const d = new Date(Date.UTC(year, mm - 1, dd));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== dd) return null;
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** Âge révolu aujourd'hui (fuseau Libreville, UTC+1 — on compare des
 *  dates, pas des heures). */
export function ageOn(isoDate: string, todayIso?: string): number | null {
  const birth = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = todayIso ?? new Date().toISOString().slice(0, 10);
  const [y, m, d] = today.split('-').map(Number);
  let age = y - birth.getUTCFullYear();
  const monthDiff = m - 1 - birth.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && d < birth.getUTCDate())) age -= 1;
  return age;
}

// ---------------------------------------------------------------------------
// Chiffres de contrôle MRZ
// ---------------------------------------------------------------------------

const MRZ_VALUES: Record<string, number> = {};
'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => {
  MRZ_VALUES[c] = i < 10 ? i : i - 10 + 10;
});

export function mrzCheckDigit(field: string): number {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < field.length; i += 1) {
    const v = MRZ_VALUES[field[i]] ?? 0;
    sum += v * weights[i % 3];
  }
  return sum % 10;
}

function checkOk(field: string, digit: string): boolean {
  return /^\d$/.test(digit) && mrzCheckDigit(field) === Number(digit);
}

// ---------------------------------------------------------------------------
// Parsing MRZ (passeport TD3 2×44, CNI TD1 3×30, permis / CNI TD2 2×36)
// ---------------------------------------------------------------------------

export interface ParsedDocument {
  docNumber: string | null;
  docNumberConfidence: OcrConfidence;
  birthDate: string | null;
  birthConfidence: OcrConfidence;
  expiryDate: string | null;
  expiryConfidence: OcrConfidence;
  nameOnDoc: string | null;
  nameConfidence: OcrConfidence;
  mrzFound: boolean;
  mrzValid: boolean;
}

const EMPTY_PARSED: ParsedDocument = {
  docNumber: null,
  docNumberConfidence: 'absente',
  birthDate: null,
  birthConfidence: 'absente',
  expiryDate: null,
  expiryConfidence: 'absente',
  nameOnDoc: null,
  nameConfidence: 'absente',
  mrzFound: false,
  mrzValid: false,
};

/** Nom MRZ « NOM<<PRENOM<DEUXIEME » → « Nom Prenom Deuxieme ». */
function mrzNameToDisplay(raw: string): string | null {
  const cleaned = raw.replace(/<+/g, ' ').trim();
  if (cleaned.length < 2) return null;
  return cleaned
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Lignes candidates MRZ : uniquement A-Z, 0-9 et '<', longueur ≥ 28. */
function mrzLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.toUpperCase().replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 28);
}

function parseMrzPair(line1: string, line2: string): ParsedDocument | null {
  // TD3 (passeport, 2×44), TD2 (2×36) ou TD1 (CNI, 3×30 — on parse la
  // 2e ligne) : même disposition des champs sur la 2e ligne.
  const len = line2.length;
  if (len !== 44 && len !== 36 && len !== 30) return null;
  const docNumber = line2.slice(0, 9).replace(/</g, '').trim();
  const birth = mrzDateToIso(line2.slice(13, 19));
  const expiry = mrzDateToIso(line2.slice(21, 27));
  if (!docNumber && !birth && !expiry) return null;
  const checks = [
    checkOk(line2.slice(0, 9), line2[9]),
    birth ? checkOk(line2.slice(13, 19), line2[19]) : false,
    expiry ? checkOk(line2.slice(21, 27), line2[27]) : false,
  ];
  const validCount = checks.filter(Boolean).length;
  const totalChecked = (docNumber ? 1 : 0) + (birth ? 1 : 0) + (expiry ? 1 : 0);
  const mrzValid = totalChecked > 0 && validCount === totalChecked;
  const conf: OcrConfidence = mrzValid ? 'forte' : 'moyenne';
  return {
    docNumber: docNumber || null,
    docNumberConfidence: docNumber ? conf : 'absente',
    birthDate: birth,
    birthConfidence: birth ? conf : 'absente',
    expiryDate: expiry,
    expiryConfidence: expiry ? conf : 'absente',
    nameOnDoc: mrzNameToDisplay(line1.slice(5)),
    nameConfidence: mrzNameToDisplay(line1.slice(5)) ? conf : 'absente',
    mrzFound: true,
    mrzValid,
  };
}

/** Parse la pièce depuis le texte OCR : MRZ d'abord, texte ensuite. */
export function parseDocumentText(text: string, accountName: string | null): ParsedDocument {
  const lines = mrzLines(text);
  // TD1 (CNI nouveau format, 3×30) : ligne 2 = n° + naissance + expiration,
  // ligne 3 = nom. On la traite comme une paire (ligne 2, ligne 3 inversée
  // pour le nom) — les positions des dates sont les mêmes que TD2/TD3.
  for (let i = 0; i + 1 < lines.length; i += 1) {
    const pair = parseMrzPair(lines[i], lines[i + 1]);
    if (pair) {
      // TD1 : le nom est sur la 3e ligne, pas sur la 1re.
      if (lines[i + 1].length === 30 && i + 2 < lines.length && lines[i + 2].length === 30) {
        const td1Name = mrzNameToDisplay(lines[i + 2]);
        if (td1Name) {
          pair.nameOnDoc = td1Name;
          pair.nameConfidence = pair.mrzValid ? 'forte' : 'moyenne';
        }
      }
      return pair;
    }
  }

  // Pas de MRZ exploitable : repli sur le texte brut (confiance faible).
  const out: ParsedDocument = { ...EMPTY_PARSED };
  const flat = text.replace(/\s+/g, ' ');

  // Dates JJ/MM/AAAA ou JJ-MM-AAAA ou AAAA-MM-JJ.
  const dateMatches = [...flat.matchAll(/(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{4})/g)]
    .map((m) => {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    })
    .filter((x): x is string => x !== null);
  const isoMatches = [...flat.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)]
    .map((m) => m[0])
    .filter((iso) => {
      const y = Number(iso.slice(0, 4));
      return y >= 1900 && y <= 2100;
    });
  const allDates = [...new Set([...dateMatches, ...isoMatches])].sort();
  const today = new Date().toISOString().slice(0, 10);
  // Naissance : la plus ancienne date plausible (âge 16–100 ans).
  const birth = allDates.find((iso) => {
    const age = ageOn(iso, today);
    return age !== null && age >= 16 && age <= 100;
  });
  if (birth) {
    out.birthDate = birth;
    out.birthConfidence = 'faible';
  }
  // Expiration : une date future proche d'un mot-clé d'expiration, sinon
  // la plus récente date future.
  const expiryKeyword = /expir|valable jusqu|valid until|date d'expiration/i.test(flat);
  const future = allDates.filter((iso) => iso > today);
  if (future.length > 0) {
    out.expiryDate = future[future.length - 1];
    out.expiryConfidence = expiryKeyword ? 'moyenne' : 'faible';
  }
  // Numéro de document : suite de 8 à 12 caractères alphanumériques près
  // d'un mot-clé — trop fragile pour servir seule : on ne le retient que
  // si le texte contient un marqueur explicite.
  const numMatch = flat.match(/(?:N°|Nº|No|Num[eé]ro|Document)\s*:?\s*([A-Z0-9]{8,12})/i);
  if (numMatch) {
    out.docNumber = numMatch[1].toUpperCase();
    out.docNumberConfidence = 'faible';
  }
  // Nom : tokens du nom du compte retrouvés dans le texte.
  if (accountName) {
    const tokens = normalizeNameTokens(accountName);
    const haystack = ` ${text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z]+/g, ' ')} `;
    const found = tokens.filter((t) => haystack.includes(` ${t} `));
    if (found.length >= 2) {
      out.nameOnDoc = found
        .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
        .join(' ');
      out.nameConfidence = 'moyenne';
    } else if (found.length === 1) {
      out.nameOnDoc = found[0].charAt(0).toUpperCase() + found[0].slice(1);
      out.nameConfidence = 'faible';
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Moteur de décision serveur
// ---------------------------------------------------------------------------

export interface DecisionInput {
  checks: ClientVerificationChecks | null;
  /** Nom complet du compte chauffeur. */
  accountName: string | null;
  /** Doublon vérifié côté serveur (base). */
  duplicateDoc: boolean;
  duplicateImage: boolean;
  /** Empreintes serveur == empreintes annoncées par le client. */
  imageHashVerified: boolean;
}

export interface Decision {
  decision: VerificationAutoDecision;
  reasons: string[];
  /** Motif affiché au chauffeur en cas de refus (ton « vous »). */
  note: string | null;
  /** Ticket à créer (null = aucun ticket nécessaire). */
  ticket: { kind: TicketKind; urgency: TicketUrgency; summary: string } | null;
  stored: Omit<StoredVerificationChecks, 'client'> & { client: ClientVerificationChecks | null };
}

const REFUSAL_NOTES: Record<string, string> = {
  mineur:
    'Votre pièce indique que vous avez moins de 18 ans. La conduite sur Stacks Drive est réservée aux personnes majeures.',
  expiree:
    'Votre pièce d’identité est expirée. Merci de renvoyer une pièce en cours de validité, bien lisible.',
  doublon:
    'Cette pièce d’identité est déjà utilisée par un autre compte chauffeur. Si vous pensez qu’il s’agit d’une erreur, contactez l’équipe Stacks Drive.',
  illisible:
    'Votre selfie et votre pièce ne sont pas lisibles. Reprenez un selfie bien éclairé, visage visible, et photographiez votre pièce bien à plat, tous les textes lisibles.',
};

/** Applique les règles de décision aux contrôles + vérifications serveur.
 *
 *  Revue de sécurité — invariant : la décision `verifie` / `refuse`
 *  n'est jamais prise sur la seule parole du client. Le serveur re-parse
 *  le texte OCR brut (le client peut se tromper ou mentir sur les champs
 *  extraits), re-calcule les empreintes d'images, et vérifie les
 *  doublons en base ; un désaccord ou un signal manquant bascule en
 *  `ambigu` (ticket admin), jamais en `verifie` par défaut. Cas limite :
 *  sans aucun contrôle client, la fonction ne tranche rien — ticket.
 *  Le trigger anti-escalade exige en plus que la décision automatique
 *  écrite en base soit cohérente avec la charge utile stockée
 *  (`verification_auto_payload_consistent`, migration v2.4). */
export function decideVerification(input: DecisionInput): Decision {
  const { checks, accountName, duplicateDoc, duplicateImage, imageHashVerified } = input;
  const reasons: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const stored: Decision['stored'] = {
    client: checks,
    server: {
      nameMatch: 'indetermine',
      age: null,
      isMinor: null,
      isExpired: null,
      duplicateDoc,
      duplicateImage,
      imageHashVerified,
      ocrReparsed: false,
    },
    decision: 'ambigu',
    reasons,
    decidedAt: new Date().toISOString(),
  };

  // Aucun contrôle client : on ne peut rien trancher — ticket, file admin.
  if (!checks) {
    reasons.push('ocr_absent');
    return {
      decision: 'ambigu',
      reasons,
      note: null,
      ticket: {
        kind: 'controles_indisponibles',
        urgency: 'moyenne',
        summary: 'Contrôles automatiques indisponibles : le dossier doit être vérifié à la main.',
      },
      stored,
    };
  }

  // Re-parse serveur du texte OCR (le client peut se tromper ou mentir
  // sur les champs ; le texte brut, lui, est re-lu ici).
  const reparsed = parseDocumentText(checks.ocrText, accountName);
  const birthDate = reparsed.birthDate ?? checks.birthDate;
  const birthConf =
    reparsed.birthDate && reparsed.birthConfidence !== 'absente'
      ? reparsed.birthConfidence
      : checks.birthConfidence;
  const expiryDate = reparsed.expiryDate ?? checks.expiryDate;
  const expiryConf =
    reparsed.expiryDate && reparsed.expiryConfidence !== 'absente'
      ? reparsed.expiryConfidence
      : checks.expiryConfidence;
  const docName = reparsed.nameOnDoc ?? checks.nameOnDoc;
  const nameMatch = matchName(accountName, docName);
  stored.server.nameMatch = nameMatch;
  stored.server.ocrReparsed = reparsed.mrzFound || reparsed.birthDate !== null;

  const age = birthDate ? ageOn(birthDate, today) : null;
  const isMinor = age !== null ? age < 18 : null;
  const isExpired = expiryDate ? expiryDate < today : null;
  stored.server.age = age;
  stored.server.isMinor = isMinor;
  stored.server.isExpired = isExpired;

  // --- Raisons (pour l'admin) ---
  if (checks.face === 'detecte') reasons.push('face_detecte');
  else if (checks.face === 'absent') reasons.push('face_absent');
  else reasons.push('face_indisponible');
  if (checks.ocrConfidence >= 70) reasons.push('ocr_fort');
  else if (checks.ocrConfidence >= 30) reasons.push('ocr_moyen');
  else if (checks.ocrConfidence >= 0) reasons.push('ocr_faible');
  else reasons.push('ocr_absent');
  if (reparsed.mrzFound) reasons.push(reparsed.mrzValid ? 'mrz_valide' : 'mrz_invalide');
  if (nameMatch === 'exact') reasons.push('nom_exact');
  else if (nameMatch === 'approximatif') reasons.push('nom_approximatif');
  else if (nameMatch === 'aucun') reasons.push('nom_aucun');
  else reasons.push('nom_indetermine');
  if (isMinor === true) reasons.push('mineur');
  else if (isMinor === false) reasons.push('majeur');
  else reasons.push('naissance_incertaine');
  if (isExpired === true) reasons.push('piece_expiree');
  else if (isExpired === false) reasons.push('piece_valide');
  else reasons.push('expiration_incertaine');
  if (duplicateDoc) reasons.push('doublon_document');
  if (duplicateImage) reasons.push('doublon_image');
  if (!duplicateDoc && !duplicateImage) reasons.push('sans_doublon');
  if (!imageHashVerified) reasons.push('hash_incoherent');
  if (checks.selfieWidth < 400 || checks.selfieHeight < 400 || checks.documentWidth < 400 || checks.documentHeight < 400) {
    reasons.push('dimensions_faibles');
  }

  const ocrStrong = checks.ocrConfidence >= 70 || reparsed.mrzValid;
  const faceOk = checks.face === 'detecte' || (checks.face === 'indisponible' && ocrStrong);
  const fieldsOk =
    birthDate !== null &&
    birthConf !== 'faible' &&
    birthConf !== 'absente' &&
    expiryDate !== null &&
    expiryConf !== 'faible' &&
    expiryConf !== 'absente' &&
    docName !== null;

  // --- 1. AUTO-REFUS : échec CLAIR, confiance forte ---
  if (duplicateDoc || duplicateImage) {
    stored.decision = 'refuse';
    return {
      decision: 'refuse',
      reasons,
      note: REFUSAL_NOTES.doublon,
      // Un doublon peut être une fraude ou un 2e compte : on alerte
      // l'admin même si le refus est automatique.
      ticket: {
        kind: 'doublon',
        urgency: 'critique',
        summary: duplicateDoc
          ? 'Doublon : ce numéro de pièce est déjà utilisé par un autre compte chauffeur.'
          : 'Doublon : cette photo de pièce a déjà été envoyée par un autre compte chauffeur.',
      },
      stored,
    };
  }
  if (isMinor === true && birthConf === 'forte') {
    stored.decision = 'refuse';
    return { decision: 'refuse', reasons, note: REFUSAL_NOTES.mineur, ticket: null, stored };
  }
  if (isExpired === true && expiryConf === 'forte') {
    stored.decision = 'refuse';
    return { decision: 'refuse', reasons, note: REFUSAL_NOTES.expiree, ticket: null, stored };
  }
  const ocrUnreadable = checks.ocrConfidence >= 0 && checks.ocrConfidence < 30 && !birthDate && !expiryDate && !docName;
  if (checks.face === 'absent' && ocrUnreadable) {
    stored.decision = 'refuse';
    return { decision: 'refuse', reasons, note: REFUSAL_NOTES.illisible, ticket: null, stored };
  }

  // --- 2. AUTO-VÉRIFIÉ : tout passe ---
  if (faceOk && fieldsOk && isMinor === false && isExpired === false && nameMatch === 'exact' && !duplicateDoc && !duplicateImage) {
    stored.decision = 'verifie';
    return { decision: 'verifie', reasons, note: null, ticket: null, stored };
  }

  // --- 3. AMBIGU : ticket pour l'admin ---
  let kind: TicketKind = 'ocr_faible';
  let urgency: TicketUrgency = 'moyenne';
  let summary = 'Dossier à revoir : les contrôles automatiques ne permettent pas de trancher.';
  if (isMinor === true) {
    kind = 'mineur_possible';
    urgency = 'haute';
    summary = 'Âge incertain : la date de naissance lue suggère un chauffeur mineur, mais la lecture est incertaine.';
  } else if (isExpired === true) {
    kind = 'expiree_possible';
    urgency = 'haute';
    summary = 'Expiration incertaine : la pièce semble expirée, mais la date lue est incertaine.';
  } else if (checks.face === 'absent') {
    kind = 'visage_non_detecte';
    urgency = 'moyenne';
    summary = 'Aucun visage détecté sur le selfie — à vérifier à la main.';
  } else if (nameMatch === 'approximatif' || nameMatch === 'aucun') {
    kind = 'nom_approximatif';
    urgency = 'moyenne';
    summary =
      nameMatch === 'approximatif'
        ? 'Nom partiellement reconnu : le nom sur la pièce ne correspond qu’en partie au nom du compte.'
        : 'Nom différent : le nom lu sur la pièce ne correspond pas au nom du compte.';
  } else if (ocrUnreadable || checks.ocrConfidence < 0) {
    kind = 'photo_illisible';
    urgency = 'basse';
    summary = 'Pièce illisible : le texte n’a pas pu être lu automatiquement.';
  } else if (!imageHashVerified) {
    kind = 'controles_indisponibles';
    urgency = 'moyenne';
    summary = 'Empreinte des images incohérente : le dossier doit être vérifié à la main.';
  }
  stored.decision = 'ambigu';
  return { decision: 'ambigu', reasons, note: null, ticket: { kind, urgency, summary }, stored };
}

/** Rang d'urgence (tri admin : critique d'abord). */
export const URGENCY_RANK: Record<TicketUrgency, number> = {
  critique: 0,
  haute: 1,
  moyenne: 2,
  basse: 3,
};

export const URGENCY_LABELS: Record<TicketUrgency, string> = {
  critique: 'Critique',
  haute: 'Haute',
  moyenne: 'Moyenne',
  basse: 'Basse',
};
