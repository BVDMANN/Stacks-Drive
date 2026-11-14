/** Enregistrement audio du trajet (v2.34, lot « Au-delà »).
 *
 *  Principe : l'audio est enregistré pendant la course, CHIFFRÉ
 *  sur l'appareil (WebCrypto AES-GCM, clé aléatoire par course),
 *  et n'est envoyé au serveur QU'EN CAS DE LITIGE — jamais écouté
 *  sans litige ouvert sur la course. Suppression automatique après
 *  TRIP_AUDIO_RETENTION_DAYS jours sans litige. Aucun service
 *  payant, aucune donnée envoyée à un tiers : l'enregistrement ne
 *  quitte jamais l'appareil tant qu'aucun litige n'est ouvert.
 *  Les deux parties sont informées visiblement : indicateur pendant
 *  la course + mention sur la page de course.
 *
 *  LIMITE HONNÊTE (pas d'escrow complet de clé dans ce lot) : la
 *  clé de chiffrement vit uniquement sur l'appareil (en mémoire
 *  pendant la course). Si l'application est fermée avant
 *  l'ouverture d'un litige, l'enregistrement chiffré conservé
 *  localement ne peut plus être déchiffré et l'envoi devient
 *  impossible — l'audio est alors perdu, jamais récupérable côté
 *  serveur. L'envoi au moment de l'ouverture du litige transmet
 *  la clé avec le chiffré, uniquement parce qu'un litige est
 *  ouvert : sans litige, le serveur ne reçoit ni audio ni clé.
 *  Un escrow complet (clé scindée, conservation serveur chiffrée)
 *  reste à trancher avec le propriétaire avant toute évolution.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

/** Conservation de l'audio après une course sans litige (jours). */
export const TRIP_AUDIO_RETENTION_DAYS = 7;
/** Durée maximale d'un enregistrement conservé (minutes) — borne de prudence. */
export const TRIP_AUDIO_MAX_MINUTES = 120;

export interface TripAudioRecord {
  rideId: string;
  /** Chiffré AES-GCM (base64) — présent seulement après envoi en cas de litige. */
  encryptedBlobB64: string | null;
  /** Clé AES brute (base64) — transmise UNIQUEMENT avec un litige ouvert. */
  keyB64: string | null;
  disputeId: string | null;
  uploadedAt: string | null;
  expiresAt: string | null;
}

/** --- Côté client (navigateur uniquement) ------------------------------ */

/** Génère une clé AES-GCM 256 aléatoire par course. */
export async function generateTripAudioKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function exportTripAudioKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToB64(raw);
}

export function bufferToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

/** Chiffre un morceau audio (AES-GCM, IV aléatoire préfixé au chiffré). */
export async function encryptAudioChunk(key: CryptoKey, chunk: ArrayBuffer): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, chunk);
  const out = new Uint8Array(iv.length + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), iv.length);
  return bufferToB64(out.buffer);
}

/** Enregistreur audio de trajet : MediaRecorder → morceaux chiffrés
 *  gardés en mémoire sur l'appareil. `onChunk` reçoit chaque morceau
 *  chiffré (base64) ; rien n'est envoyé tant que `uploadOnDispute`
 *  n'est pas appelé explicitement. */
export class TripAudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private key: CryptoKey | null = null;
  private chunks: string[] = [];
  private stream: MediaStream | null = null;
  recording = false;

  async start(): Promise<{ ok: boolean; error?: string }> {
    if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      return { ok: false, error: 'Enregistrement audio non disponible sur cet appareil.' };
    }
    try {
      this.key = await generateTripAudioKey();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(this.stream);
      this.mediaRecorder = recorder;
      this.chunks = [];
      recorder.ondataavailable = async (e: BlobEvent) => {
        if (!e.data || e.data.size === 0 || !this.key) return;
        const buf = await e.data.arrayBuffer();
        this.chunks.push(await encryptAudioChunk(this.key, buf));
      };
      recorder.start(10000); // un morceau chiffré toutes les 10 s
      this.recording = true;
      return { ok: true };
    } catch {
      this.stopTracks();
      return { ok: false, error: 'Microphone refusé ou indisponible — la course continue sans enregistrement.' };
    }
  }

  stop(): void {
    try {
      this.mediaRecorder?.stop();
    } catch {
      /* déjà arrêté */
    }
    this.stopTracks();
    this.recording = false;
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  /** Nombre de morceaux chiffrés conservés sur l'appareil. */
  get chunkCount(): number {
    return this.chunks.length;
  }

  /** Prépare l'envoi en cas de litige : chiffré concaténé + clé.
   *  À n'appeler QUE quand un litige est ouvert sur la course. */
  async prepareDisputeUpload(): Promise<{ encryptedBlobB64: string; keyB64: string } | null> {
    if (!this.key || this.chunks.length === 0) return null;
    return { encryptedBlobB64: this.chunks.join(''), keyB64: await exportTripAudioKey(this.key) };
  }
}

/** Enregistreur partagé de la session (un seul par page) : la page
 *  de course le démarre pendant le trajet, le formulaire de litige
 *  l'envoie à l'ouverture d'un litige. La clé ne quitte jamais
 *  l'appareil avant ce moment. */
export const tripAudioRecorder = new TripAudioRecorder();

/** Envoie l'enregistrement au serveur à l'ouverture d'un litige.
 *  Ne fait rien s'il n'y a pas d'enregistrement en cours ou terminé
 *  dans cette session (voir la limite honnête en en-tête). */
export async function uploadTripAudioOnDispute(
  rideId: string,
  disputeId: string
): Promise<{ uploaded: boolean }> {
  const payload = await tripAudioRecorder.prepareDisputeUpload();
  if (!payload) return { uploaded: false };
  try {
    const res = await fetch(`/api/rides/${rideId}/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, disputeId }),
    });
    return { uploaded: res.ok };
  } catch {
    return { uploaded: false };
  }
}

/** Supprime les enregistrements expirés (sans litige, au-delà de la
 *  rétention). Appelée en meilleur effort (cron existant ou route
 *  admin) ; silencieuse si la table n'existe pas encore. */
export async function purgeExpiredTripAudio(
  supabase: SupabaseClient
): Promise<{ deleted: number }> {
  const { data, error } = await supabase
    .from('trip_audio')
    .delete()
    .is('dispute_id', null)
    .lt('expires_at', new Date().toISOString())
    .select('ride_id');
  if (error) return { deleted: 0 };
  return { deleted: (data ?? []).length };
}
