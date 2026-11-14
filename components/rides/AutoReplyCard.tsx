'use client';

import Link from 'next/link';
import { Check, HelpCircle, Zap } from 'lucide-react';
import type { AutoReply } from '@/lib/auto-replies';
import { FAQ_ITEMS } from '@/lib/faq';

/** Carte de réponse automatique (v2.29) : la plainte standard est
 *  traitée tout de suite, sans attendre un humain. L'utilisateur
 *  voit CLAIREMENT que c'est automatique — et que s'il n'est pas
 *  satisfait, un humain prend le relais (bouton de rejet →
 *  litige). Aucune compensation automatique : l'application ne
 *  touche jamais l'argent, seule une décision humaine peut
 *  ajuster quoi que ce soit. */
export function AutoReplyCard({
  reply,
  onResolved,
  onReject,
}: {
  reply: AutoReply;
  onResolved: () => void;
  onReject: () => void;
}) {
  const faq = reply.faqId ? FAQ_ITEMS.find((f) => f.id === reply.faqId) ?? null : null;
  return (
    <div className="space-y-4">
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4 space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-green-800">
          <Zap size={14} /> Réponse automatique — traitée tout de suite
        </p>
        <p className="font-black text-green-900">{reply.title}</p>
        <p className="text-sm text-green-800 leading-relaxed">{reply.apology}</p>
        <p className="text-sm text-green-800 leading-relaxed">{reply.explanation}</p>
        <p className="text-sm text-green-800 leading-relaxed">
          <strong>Ce qui se passe maintenant :</strong> {reply.whatHappens}
        </p>
        {reply.actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {reply.actions.map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="px-4 py-2 rounded-full text-sm font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors"
              >
                {a.label}
              </Link>
            ))}
          </div>
        )}
        {faq && (
          <p className="text-sm pt-1">
            <Link
              href={`/aide#${faq.id}`}
              className="inline-flex items-center gap-1 font-bold text-green-800 hover:underline"
            >
              <HelpCircle size={15} /> Voir l’aide : « {faq.question} »
            </Link>
          </p>
        )}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Réponse automatique — aucun remboursement, aucune remise, aucun
        crédit automatique : l’application ne touche jamais l’argent.
        Seul un humain peut décider d’un ajustement, en transmettant
        ton litige à Stacks Drive.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onResolved}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors"
        >
          <Check size={15} /> Ça résout mon problème
        </button>
        <button
          type="button"
          onClick={onReject}
          className="px-5 py-2.5 rounded-full text-sm font-black bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Ça ne résout pas mon problème
        </button>
      </div>
    </div>
  );
}
