'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DriveAlert, DriveChevronDown, DriveHelp, DriveSearch } from '@/components/icons/DriveUi';
import { FAQ_ITEMS, answerFaq } from '@/lib/faq';
import { cn } from '@/lib/utils';

/** Adresse publique de contact de l'administrateur — la même que
 *  l'adresse ADMIN_EMAIL par défaut côté serveur (`lib/email.ts`).
 *  Importer `lib/email` ici entraînerait le client Resend dans le
 *  paquet navigateur : on garde la valeur publique en clair. */

/** FAQ in-app (v2.24) : les questions courantes sont répondues
 *  ici, sans remonter à l'administrateur. Recherche libre +
 *  liste complète en accordéon. Quand aucune réponse ne
 *  correspond (cas ambigu), l'écran renvoie vers l'ouverture
 *  d'un litige (depuis la course concernée) ou un message à
 *  l'administrateur — jamais d'e-mail direct au propriétaire
 *  pour une question courante, et jamais de réponse inventée. */
export function Faq() {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  // Ancre directe (`/aide#retard`, utilisée par les réponses auto
  // aux plaintes, v2.29) : ouvre la question visée au chargement.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash && FAQ_ITEMS.some((f) => f.id === hash)) setOpenId(hash);
  }, []);

  const match = useMemo(() => (query.trim() ? answerFaq(query) : null), [query]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.includes(q) || q.includes(k))
    );
  }, [query]);

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="faq-search" className="sr-only">
          Pose ta question
        </label>
        <div className="relative">
          <DriveSearch size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="faq-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pose ta question… (ex. « comment payer ? »)"
            className="w-full pl-11 pr-4 py-3.5 rounded-full bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none"
          />
        </div>
      </div>

      {/* Réponse directe quand la recherche correspond à une question. */}
      {query.trim() !== '' && match && (
        <div className="bg-green-50 border border-green-200 rounded-3xl p-5 space-y-2">
          <p className="font-black text-green-900 flex items-center gap-2">
            <DriveHelp size={18} /> {match.question}
          </p>
          <p className="text-sm text-green-800 leading-relaxed">{match.answer}</p>
        </div>
      )}

      {/* Cas ambigu : aucune question courante ne correspond — on
          renvoie vers le litige ou l'administrateur, sans inventer. */}
      {query.trim() !== '' && !match && (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-5 space-y-3">
          <p className="font-black text-amber-800 flex items-center gap-2">
            <DriveAlert size={18} /> Pas de réponse automatique pour cette question
          </p>
          <p className="text-sm text-amber-700 leading-relaxed">
            Ta question ne fait pas partie des questions courantes. Si elle
            concerne une course, ouvre un litige depuis cette course : un
            humain tranchera. Sinon, écris à l&apos;administrateur.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/activite"
              className="px-5 py-2.5 rounded-full text-sm font-black bg-stacks-green text-white shadow-md hover:bg-stacks-greenLight transition-colors"
            >
              Ouvrir un litige depuis ma course
            </Link>
            <a
              href={`mailto:stacks.markett@gmail.com?subject=${encodeURIComponent('[Stacks Drive] Question')}`}
              className="px-5 py-2.5 rounded-full text-sm font-black bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Écrire à l&apos;administrateur
            </a>
          </div>
        </div>
      )}

      {/* Liste complète des questions courantes. */}
      <div className="space-y-2.5">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Questions courantes
        </p>
        {visible.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune question courante ne contient ces mots — vois l&apos;encadré ci-dessus.
          </p>
        ) : (
          visible.map((item) => {
            const open = openId === item.id;
            return (
              <div
                key={item.id}
                id={item.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden scroll-mt-24"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                >
                  <span className="text-sm font-black text-slate-900">{item.question}</span>
                  <DriveChevronDown
                    size={18}
                    className={cn('text-slate-400 shrink-0 transition-transform', open && 'rotate-180')}
                  />
                </button>
                {open && (
                  <p className="px-4 pb-4 text-sm text-slate-600 leading-relaxed">{item.answer}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
