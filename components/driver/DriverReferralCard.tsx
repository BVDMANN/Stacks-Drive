'use client';

import { useCallback, useEffect, useState } from 'react';
import { DriveCheck, DriveCopy, DriveGift, DriveUsers } from '@/components/icons/DriveUi';

/** Carte parrainage chauffeurs (v2.25, lot C) — SILENCIEUSE : visible
 *  uniquement ici (tableau de bord chauffeur) et côté admin, jamais
 *  sur les pages publiques.
 *
 *  Chaque chauffeur vérifié a un code unique. Quand son filleul est
 *  vérifié ET a terminé 5 courses : 1 000 points au parrain, 500 au
 *  filleul (système existant : 100 points/course, 10 000 points =
 *  5 courses sans commission). Les bonus sont crédités par le cron
 *  hebdo — jamais depuis le client. */
interface Referral {
  refereeName: string | null;
  verified: boolean;
  completedRides: number;
  rewarded: boolean;
  createdAt: string;
}

interface ReferralData {
  code: string;
  verified: boolean;
  hasReferrer: boolean;
  milestoneRides: number;
  referrerBonusPoints: number;
  refereeBonusPoints: number;
  referrals: Referral[];
}

export function DriverReferralCard() {
  const [data, setData] = useState<ReferralData | null>(null);
  const [copied, setCopied] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [recordState, setRecordState] = useState<{ ok: boolean; message: string } | null>(null);
  const [recording, setRecording] = useState(false);

  const fetchReferral = useCallback(async () => {
    try {
      const res = await fetch('/api/driver/referral');
      const json = await res.json().catch(() => null);
      if (json?.ok) setData(json as ReferralData);
    } catch {
      // Sans Supabase : carte masquée (le tableau de bord reste utilisable).
    }
  }, []);

  useEffect(() => {
    fetchReferral();
  }, [fetchReferral]);

  if (!data) return null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data?.code ?? '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Presse-papiers indisponible : le code reste sélectionnable.
    }
  }

  async function recordReferral() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setRecording(true);
    setRecordState(null);
    try {
      const res = await fetch('/api/driver/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRecordState({ ok: false, message: json?.error ?? 'Parrainage impossible.' });
      } else {
        setRecordState({ ok: true, message: 'Parrain enregistré — ses bonus se débloquent quand ton filleul a terminé 5 courses.' });
        setCodeInput('');
        fetchReferral();
      }
    } catch {
      setRecordState({ ok: false, message: 'Parrainage impossible pour le moment.' });
    } finally {
      setRecording(false);
    }
  }

  const rewardedCount = data.referrals.filter((r) => r.rewarded).length;

  return (
    <section className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
      <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
        <DriveUsers size={20} className="text-stacks-green" /> Parrainage chauffeurs
      </h2>
      {!data.verified ? (
        <p className="text-sm text-slate-500">
          Ton code de parrainage s’active quand ton compte est vérifié — tu pourras
          alors parrainer d’autres chauffeurs : 1 000 points pour toi et 500 points
          pour ton filleul quand il est vérifié et a terminé 5 courses.
        </p>
      ) : (
        <>
          <p className="text-sm text-slate-500">
            Partage ton code à un chauffeur : quand il est vérifié et a terminé{' '}
            {data.milestoneRides} courses, tu gagnes{' '}
            <strong className="text-slate-900">
              {data.referrerBonusPoints.toLocaleString('fr-FR')} points
            </strong>{' '}
            et il gagne{' '}
            <strong className="text-slate-900">
              {data.refereeBonusPoints.toLocaleString('fr-FR')} points
            </strong>{' '}
            (10 000 points = 5 courses sans commission).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 font-black text-lg tracking-wider text-slate-900 select-all">
              {data.code}
            </code>
            <button
              type="button"
              onClick={copyCode}
              className="inline-flex items-center gap-1.5 px-4 py-3 rounded-full text-sm font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
            >
              {copied ? <DriveCheck size={16} /> : <DriveCopy size={16} />}
              {copied ? 'Copié !' : 'Copier'}
            </button>
          </div>
        </>
      )}

      {data.referrals.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-slate-900">
            Tes filleuls ({data.referrals.length}) — {rewardedCount} bonus versé
            {rewardedCount > 1 ? 's' : ''}
          </p>
          <ul className="divide-y divide-slate-100">
            {data.referrals.map((r, i) => (
              <li key={`${r.createdAt}-${i}`} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900">
                  {r.refereeName ?? 'Chauffeur parrainé'}
                </span>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {r.rewarded
                    ? 'Bonus versé ✓'
                    : r.verified
                      ? `${r.completedRides}/${data.milestoneRides} courses`
                      : 'En attente de vérification'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!data.hasReferrer && (
        <div className="border-t border-slate-100 pt-4 space-y-2">
          <p className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <DriveGift size={16} className="text-stacks-green" />
            Tu as été parrainé ?
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              placeholder="Code du parrain (SD-…)"
              aria-label="Code de parrainage du parrain"
              className="flex-1 min-w-[180px] px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-bold focus:border-stacks-green focus:outline-none"
            />
            <button
              type="button"
              disabled={recording || !codeInput.trim()}
              onClick={recordReferral}
              className="px-4 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors disabled:opacity-50"
            >
              {recording ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
          {recordState && (
            <p className={`text-sm ${recordState.ok ? 'text-green-700' : 'text-red-700'}`}>
              {recordState.message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
