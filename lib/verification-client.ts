/** Contrôles automatiques côté client (v2.4) — VerificationForm.
 *
 *  Ce qui est vérifié AVANT l'envoi, sur le téléphone du chauffeur :
 *  dimensions minimales, visage sur le selfie (API native FaceDetector
 *  quand elle existe — Chrome/Android — sinon « indisponible », jamais
 *  bloquant à elle seule), OCR de la pièce (tesseract.js, chargé en
 *  lazy pour ne pas alourdir le bundle initial, langues fra+eng),
 *  empreintes SHA-256 des deux images (re-calculées côté serveur).
 *
 *  Si un contrôle technique échoue (OCR indisponible, FaceDetector
 *  absent…), on envoie quand même le dossier avec une confiance basse :
 *  c'est le serveur qui tranche, et un ticket est créé si besoin.
 *  Le chauffeur n'est jamais bloqué par un contrôle technique.
 */

import { parseDocumentText, type ClientVerificationChecks } from '@/lib/verification';

/** Étapes affichées au chauffeur pendant les contrôles. */
export type CheckStep = 'photos' | 'visage' | 'lecture' | 'envoi';

export type CheckProgress = {
  step: CheckStep;
  /** Progression OCR 0–100 (-1 = indéterminée). */
  ocrProgress: number;
};

/** Déclaration minimale de l'API native FaceDetector (Chrome/Android,
 *  contexte sécurisé uniquement). Absente sur iOS/Safari/Firefox. */
interface FaceDetectorInstance {
  detect(source: ImageBitmap): Promise<{ boundingBox: unknown }[]>;
}
interface FaceDetectorConstructor {
  new (options?: { fastMode?: boolean }): FaceDetectorInstance;
}
declare global {
  interface Window {
    FaceDetector?: FaceDetectorConstructor;
  }
}

async function sha256Hex(file: File): Promise<string | null> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

async function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dims;
  } catch {
    // Repli : balise <img> (anciens navigateurs).
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ width: 0, height: 0 });
      };
      img.src = url;
    });
  }
}

async function detectFace(file: File): Promise<'detecte' | 'absent' | 'indisponible'> {
  try {
    if (typeof window === 'undefined' || !window.FaceDetector) return 'indisponible';
    const detector = new window.FaceDetector({ fastMode: true });
    const bitmap = await createImageBitmap(file);
    const faces = await detector.detect(bitmap);
    bitmap.close();
    return faces.length > 0 ? 'detecte' : 'absent';
  } catch {
    return 'indisponible';
  }
}

/** OCR de la pièce avec tesseract.js (chargé à la demande).
 *  Timeout de 60 s : au-delà, on renvoie une confiance de -1 et le
 *  dossier part quand même (le serveur tranchera). */
async function ocrDocument(
  file: File,
  onProgress: (pct: number) => void
): Promise<{ text: string; confidence: number }> {
  const timeout = new Promise<{ text: string; confidence: number }>((resolve) => {
    setTimeout(() => resolve({ text: '', confidence: -1 }), 60_000);
  });
  const run = (async (): Promise<{ text: string; confidence: number }> => {
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('fra+eng', undefined, {
        logger: (m: { status?: string; progress?: number }) => {
          if (m.status === 'recognizing text' && typeof m.progress === 'number') {
            onProgress(Math.round(m.progress * 100));
          }
        },
      });
      const {
        data: { text, confidence },
      } = await worker.recognize(file);
      await worker.terminate();
      return { text: (text ?? '').slice(0, 4000), confidence: Math.round(confidence ?? 0) };
    } catch {
      return { text: '', confidence: -1 };
    }
  })();
  return Promise.race([run, timeout]);
}

/** Lance tous les contrôles et renvoie les résultats à envoyer au serveur.
 *  Ne lève jamais d'exception : en cas de panne totale, renvoie des
 *  contrôles « vides » (le serveur créera un ticket). */
export async function runClientVerificationChecks(
  selfie: File,
  document: File,
  accountName: string | null,
  onProgress: (p: CheckProgress) => void
): Promise<ClientVerificationChecks> {
  const empty: ClientVerificationChecks = {
    face: 'indisponible',
    selfieWidth: 0,
    selfieHeight: 0,
    documentWidth: 0,
    documentHeight: 0,
    ocrConfidence: -1,
    ocrText: '',
    docNumber: null,
    docNumberConfidence: 'absente',
    birthDate: null,
    birthConfidence: 'absente',
    expiryDate: null,
    expiryConfidence: 'absente',
    nameOnDoc: null,
    nameConfidence: 'absente',
    selfieImageHash: null,
    documentImageHash: null,
    docNumberHash: null,
  };
  try {
    onProgress({ step: 'photos', ocrProgress: -1 });
    const [selfieDims, docDims, selfieHash, docHash, face] = await Promise.all([
      imageDimensions(selfie),
      imageDimensions(document),
      sha256Hex(selfie),
      sha256Hex(document),
      detectFace(selfie),
    ]);
    const checks: ClientVerificationChecks = {
      ...empty,
      face,
      selfieWidth: selfieDims.width,
      selfieHeight: selfieDims.height,
      documentWidth: docDims.width,
      documentHeight: docDims.height,
      selfieImageHash: selfieHash,
      documentImageHash: docHash,
    };

    onProgress({ step: 'lecture', ocrProgress: 0 });
    const ocr = await ocrDocument(document, (pct) => onProgress({ step: 'lecture', ocrProgress: pct }));
    checks.ocrConfidence = ocr.confidence;
    checks.ocrText = ocr.text;
    if (ocr.text.trim().length > 0) {
      const parsed = parseDocumentText(ocr.text, accountName);
      checks.docNumber = parsed.docNumber;
      checks.docNumberConfidence = parsed.docNumberConfidence;
      checks.birthDate = parsed.birthDate;
      checks.birthConfidence = parsed.birthConfidence;
      checks.expiryDate = parsed.expiryDate;
      checks.expiryConfidence = parsed.expiryConfidence;
      checks.nameOnDoc = parsed.nameOnDoc;
      checks.nameConfidence = parsed.nameConfidence;
      if (parsed.docNumber) {
        const normalized = parsed.docNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
        try {
          const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`doc:${normalized}`)
          );
          checks.docNumberHash = [...new Uint8Array(digest)]
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        } catch {
          checks.docNumberHash = null;
        }
      }
    }
    onProgress({ step: 'envoi', ocrProgress: 100 });
    return checks;
  } catch {
    return empty;
  }
}
