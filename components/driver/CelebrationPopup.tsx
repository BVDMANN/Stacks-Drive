'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Flame, PartyPopper, Sparkles, Trophy, X } from 'lucide-react';

/** Données renvoyées par l'API à la clôture d'une course. Les bonus
 *  sont en POINTS depuis la v2.3 (plus d'argent direct). */
export interface CelebrationData {
  fare: number;
  fareLabel: string;
  kept: number;
  keptLabel: string;
  commission: number;
  commissionLabel: string;
  keptPct: number;
  isDoubleRide: boolean;
  loyaltyFree: boolean;
  questBonus: number;
  questDone: number;
  questTarget: number;
  questBonusAmount: number;
  pointsEarned: number;
  streakDays: number;
  tier: string;
  completedRides: number;
}

const CONFETTI_COLORS = ['#FF4D8D', '#2FD6C8', '#FF5F6D', '#FFFFFF', '#F5A623', '#FF7EB0'];

/** Popup de célébration après chaque course terminée (v2.2, points
 *  en v2.3) : confettis, flash rose, montant gardé en gros, % gardé,
 *  points gagnés, progression de la quête.
 *  Les chiffres sont VRAIS (montants de la base) — on met en scène des
 *  gains réels, on n'invente rien. */
export function CelebrationPopup({
  celebration,
  onClose,
}: {
  celebration: CelebrationData;
  onClose: () => void;
}) {
  const confetti = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
        round: Math.random() > 0.5,
      })),
    []
  );

  const questPct = Math.min(
    100,
    Math.round((celebration.questDone / Math.max(1, celebration.questTarget)) * 100)
  );
  const questDone = celebration.questDone >= celebration.questTarget;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-night-950/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Course terminée — tes gains"
      onClick={onClose}
    >
      {/* Flash rose */}
      <motion.div
        className="pointer-events-none absolute inset-0"
        initial={{ opacity: 0.9 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(255, 77, 141, 0.55) 0%, rgba(255, 77, 141, 0.25) 35%, transparent 70%)',
        }}
      />
      {/* Confettis */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {confetti.map((c) => (
          <motion.span
            key={c.id}
            className="absolute top-0"
            style={{
              left: `${c.left}%`,
              width: c.size,
              height: c.size * (c.round ? 1 : 0.5),
              backgroundColor: c.color,
              borderRadius: c.round ? '50%' : 2,
            }}
            initial={{ y: -30, opacity: 1, rotate: 0 }}
            animate={{ y: '110vh', opacity: [1, 1, 0.6], rotate: c.rotate + 720 }}
            transition={{ duration: c.duration, delay: c.delay, ease: 'easeIn' }}
          />
        ))}
      </div>

      <motion.div
        className="relative w-full max-w-md bg-night-900 border border-white/10 rounded-[2rem] p-6 sm:p-8 text-center shadow-2xl shadow-black/60 text-slate-100"
        initial={{ scale: 0.85, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-slate-300 hover:bg-white/20"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>

        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 15 }}
          className="mx-auto w-16 h-16 rounded-full bg-corail flex items-center justify-center text-night-950 shadow-lg shadow-corail/40"
        >
          {celebration.isDoubleRide ? <PartyPopper size={30} /> : <Trophy size={30} />}
        </motion.div>

        <h2 className="font-black text-2xl mt-4 tracking-tight">
          {celebration.isDoubleRide
            ? 'COURSE DOUBLE !'
            : celebration.loyaltyFree
              ? 'Course offerte — tu touches tout !'
              : 'Course terminée !'}
        </h2>
        <p className="text-sm text-slate-400 mt-1">
          {celebration.isDoubleRide
            ? 'Points doublés sur cette course — 200 points au lieu de 100.'
            : `Tu gardes ${celebration.keptPct} % de cette course.`}
        </p>

        <motion.p
          className="font-black text-5xl text-sarcelle mt-4 tracking-tight"
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 14 }}
        >
          +{celebration.keptLabel}
        </motion.p>
        <p className="text-sm text-slate-400 mt-1">
          sur {celebration.fareLabel}
          {celebration.commission > 0
            ? ` · commission ${celebration.commissionLabel}`
            : ' · 0 FCFA de commission'}
        </p>

        {celebration.pointsEarned > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-black text-corail bg-corail/10 border border-corail/30 rounded-full px-4 py-2">
            <Sparkles size={15} /> +{celebration.pointsEarned} points gagnés !
          </p>
        )}

        {celebration.questBonus > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-black text-corail bg-corail/10 border border-corail/30 rounded-full px-4 py-2">
            <Sparkles size={15} /> Bonus de quête : +{celebration.questBonus} points !
          </p>
        )}

        {/* Quête du jour */}
        <div className="mt-5 bg-white/5 border border-white/10 rounded-2xl p-4 text-left space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black">
              Quête du jour : {celebration.questDone} / {celebration.questTarget} courses
            </p>
            <span className="text-xs font-black text-corail">
              +{celebration.questBonusAmount} points
            </span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-rose-500 via-corail to-sarcelle"
              initial={{ width: 0 }}
              animate={{ width: `${questPct}%` }}
              transition={{ delay: 0.4, duration: 0.8, ease: 'easeOut' }}
            />
          </div>
          <p className="text-xs text-slate-400">
            {questDone
              ? 'Quête validée — 1 000 points versés !'
              : `Plus que ${celebration.questTarget - celebration.questDone} course${celebration.questTarget - celebration.questDone > 1 ? 's' : ''} pour ton bonus de ${celebration.questBonusAmount} points.`}
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 mt-4 text-sm text-slate-300">
          {celebration.streakDays > 1 && (
            <span className="inline-flex items-center gap-1 font-bold">
              <Flame size={16} className="text-rose-300" /> Série : {celebration.streakDays} jours
            </span>
          )}
          <span className="font-bold">Niveau {celebration.tier}</span>
          <span className="font-bold">{celebration.completedRides} courses</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full py-4 rounded-full bg-rose-500 text-night-900 font-black shadow-lg shadow-rose-500/30 hover:bg-rose-300 transition-colors"
        >
          Continuer — prochaine course
        </button>
      </motion.div>
    </div>
  );
}
