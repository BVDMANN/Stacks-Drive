'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  SELECTABLE_NEIGHBORHOODS,
  matchesNeighborhoodQuery,
  type Neighborhood,
} from '@/lib/neighborhoods';
import { cn } from '@/lib/utils';

/** Sélecteur de quartier avec recherche (v2.22) — remplace le `<select>`
 *  natif pour les listes de quartiers (départ / destination).
 *
 *  - Liste triée par ordre alphabétique (SELECTABLE_NEIGHBORHOODS).
 *  - Recherche instantanée en tapant le nom : insensible aux accents,
 *    à la casse et aux séparateurs (« aeroport » → Aéroport Léon-Mba,
 *    « nzeng ayong » → Nzeng-Ayong, « mont bouet » → Mont-Bouët).
 *  - Clavier : flèches pour naviguer, Entrée pour choisir, Échap pour
 *    fermer. La liste s'ouvre dans le flux (elle pousse le contenu
 *    vers le bas) : pas de débordement coupé par la feuille.
 *  - Un quartier déjà choisi s'affiche dans le champ ; la croix
 *    l'efface. Si la recherche ne donne rien, un message clair
 *    l'indique au lieu d'une liste vide.
 *
 *  Style « Nuit dorée » (feuille d'accueil) : à n'utiliser que sur
 *  fond sombre. Les autres listes de quartiers (accueil chauffeur,
 *  tableau de bord, profil) gardent leur `<select>` natif, avec la
 *  même liste triée — la recherche n'y est pas demandée. */
export function NeighborhoodSelect({
  id,
  label,
  value,
  onChange,
  placeholder,
  icon,
  action,
}: {
  id: string;
  label: string;
  value: Neighborhood | '';
  onChange: (value: Neighborhood | '') => void;
  placeholder: string;
  /** Icône à gauche du champ (départ : navigation, destination : épingle). */
  icon?: React.ReactNode;
  /** Bouton à droite du champ (départ : « Me localiser »). */
  action?: React.ReactNode;
}) {
  const [query, setQuery] = useState<string>(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  // Dernière valeur choisie (ref, pas state) : le `setTimeout` du blur
  // se déclenche après la sélection — sans ref, il relirait la valeur
  // d'avant le choix et effacerait le champ qu'on vient de remplir.
  const valueRef = useRef(value);
  valueRef.current = value;

  // Le choix peut changer de l'extérieur (raccourci d'itinéraire,
  // « Me localiser », lieu sur la carte) : le champ suit.
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(
    () => SELECTABLE_NEIGHBORHOODS.filter((n) => matchesNeighborhoodQuery(n, query)),
    [query]
  );

  function choose(n: Neighborhood) {
    onChange(n);
    setQuery(n);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.blur();
  }

  function clear() {
    onChange('');
    setQuery('');
    setOpen(true);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }

  // Fermeture : on revient à la valeur choisie (ou vide) si la
  // recherche tapée ne correspond à rien de sélectionné. La valeur
  // est lue dans la ref (voir ci-dessus) : la fermeture qui suit une
  // sélection ne doit pas réafficher l'ancienne valeur.
  function close() {
    setOpen(false);
    setActiveIdx(-1);
    setQuery(valueRef.current);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      if (open && activeIdx >= 0 && filtered[activeIdx]) {
        e.preventDefault();
        choose(filtered[activeIdx]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
      inputRef.current?.blur();
    }
  }

  const listboxId = `${id}-quartiers`;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-3">
        {icon}
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
            {label}
          </span>
          <span className="relative flex items-center">
            <input
              ref={inputRef}
              id={id}
              type="text"
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls={listboxId}
              aria-activedescendant={
                open && activeIdx >= 0 && filtered[activeIdx]
                  ? `${listboxId}-${activeIdx}`
                  : undefined
              }
              aria-label={label}
              value={query}
              placeholder={placeholder}
              onFocus={(e) => {
                setOpen(true);
                // Tout sélectionner : la première frappe remplace le
                // nom affiché au lieu de s'y ajouter.
                e.target.select();
              }}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
                setActiveIdx(-1);
              }}
              onKeyDown={onKeyDown}
              onBlur={() => {
                // Délai : laisser le clic sur une option aboutir avant
                // de refermer (le mousedown de l'option l'empêche
                // déjà, la marge couvre le clavier tactile).
                window.setTimeout(() => {
                  if (document.activeElement !== inputRef.current) close();
                }, 120);
              }}
              className="w-full bg-transparent font-bold text-white placeholder:text-slate-500 placeholder:font-normal focus:outline-none py-0.5 pr-6"
            />
            {value !== '' ? (
              <button
                type="button"
                onClick={clear}
                aria-label={`Effacer ${label.toLowerCase()}`}
                className="absolute right-0 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 active:scale-90 transition-all"
              >
                <X size={14} />
              </button>
            ) : (
              <ChevronDown
                size={15}
                className={cn(
                  'absolute right-0 text-slate-400 pointer-events-none transition-transform',
                  open && 'rotate-180'
                )}
              />
            )}
          </span>
        </span>
        {action}
      </div>

      {open && (
        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          <p className="flex items-center gap-1.5 px-1 pb-1 text-[11px] font-bold text-slate-400">
            <Search size={12} className="shrink-0" />
            {query.trim() === ''
              ? `${filtered.length} quartiers — touche pour choisir, ou tape un nom`
              : `${filtered.length} quartier${filtered.length > 1 ? 's' : ''} pour « ${query.trim()} »`}
          </p>
          {filtered.length === 0 ? (
            <p className="px-1 py-2 text-sm font-bold text-slate-400">
              Aucun quartier trouvé pour « {query.trim()} » — vérifie l’orthographe.
            </p>
          ) : (
            <ul
              role="listbox"
              id={listboxId}
              aria-label={`Quartiers — ${label.toLowerCase()}`}
              className="max-h-56 overflow-y-auto overscroll-contain -mx-1 px-1"
            >
              {filtered.map((n, i) => (
                <li key={n} role="option" id={`${listboxId}-${i}`} aria-selected={n === value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(n)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={cn(
                      'w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-left text-sm font-bold transition-colors',
                      i === activeIdx ? 'bg-cyan/15 text-cyan' : 'text-white hover:bg-white/5',
                      n === value && 'text-cyan'
                    )}
                  >
                    {n}
                    {n === value && <Check size={15} className="shrink-0" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
