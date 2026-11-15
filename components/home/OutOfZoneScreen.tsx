'use client';

import { useState } from 'react';
import { DriveBell, DriveCheckBadge, DriveGlobe, DriveMail, DrivePin } from '@/components/icons/DriveUi';
import { LogoLoader } from '@/components/icons/DriveLogo';

/** Écran hors zone (v2.32) : quand la géolocalisation place
 *  quelqu'un hors de la zone de service (Grand Libreville,
 *  `SERVICE_BOUNDS` dans `lib/geo.ts` — test fait par l'appelant,
 *  jamais ici), l'appli affiche ce message plein écran, langage
 *  visuel de la page d'erreur de marque (`app/error.tsx`, v2.2) :
 *  fond `bg-night-950`, tuile icône or, titre, texte `slate-400`,
 *  bouton principal or en pilule + ligne de contact — avec un fond
 *  animé discret dans le vocabulaire existant (anneaux radar
 *  `radar-ping`, halo `driver-halo`, entrée `rise-in`).
 *
 *  L'écran ne bloque JAMAIS l'appli : « Explorer Libreville »
 *  le ferme et laisse explorer la carte de Libreville quand même
 *  (le propriétaire lui-même, en France, doit pouvoir utiliser
 *  l'appli). Une fois fermé, il ne réapparaît pas avant la fin de
 *  la session (`OUT_OF_ZONE_DISMISSED_KEY`, `sessionStorage` —
 *  géré par l'appelant). Pas de GPS / pas de permission = pas
 *  d'écran du tout (l'appelant ne l'affiche que sur une position
 *  connue, hors zone).
 *
 *  Bilingue FR / EN : la langue suit celle du navigateur
 *  (anglais si elle commence par « en », français sinon), avec
 *  un basculeur FR | EN en haut. Les deux textes sont ceux
 *  demandés : « Nous ne sommes pas encore là-bas, mais ne vous
 *  inquiétez pas, ça arrive. » / « We're not there yet, but don't
 *  worry, we're coming. »
 *
 *  Option « Me prévenir » : e-mail + consentement explicite
 *  (case à cocher obligatoire) envoyés à `POST /api/notify-me` —
 *  ville / pays en best-effort seulement, jamais de coordonnées
 *  précises. */

type Lang = 'fr' | 'en';

const TEXTS = {
  fr: {
    title: 'Nous ne sommes pas encore là-bas, mais ne vous inquiétez pas, ça arrive.',
    subtitle: 'Pour l’instant, Stacks Drive est à Libreville.',
    explore: 'Explorer Libreville',
    notifyTitle: 'Préviens-moi quand Stacks Drive arrive chez moi',
    emailLabel: 'Ton e-mail',
    emailPlaceholder: 'ton@email.com',
    consent: 'J’accepte d’être prévenu(e) par e-mail quand Stacks Drive arrive dans ma zone.',
    submit: 'Me prévenir',
    sending: 'Envoi…',
    success: 'C’est noté — on te préviendra quand Stacks Drive arrive chez toi.',
    already: 'Cet e-mail est déjà inscrit — on te préviendra quand Stacks Drive arrive chez toi.',
    error: 'Envoi impossible pour le moment. Réessaie dans quelques instants.',
    invalidEmail: 'Entre une adresse e-mail valide.',
    consentRequired: 'Coche la case pour accepter d’être prévenu(e) par e-mail.',
    contact: 'Une question ? Écris à Stacks Drive : stacks.markett@gmail.com',
    langLabel: 'Langue',
  },
  en: {
    title: 'We’re not there yet, but don’t worry, we’re coming.',
    subtitle: 'For now, Stacks Drive is in Libreville.',
    explore: 'Explore Libreville',
    notifyTitle: 'Notify me when Stacks Drive comes to my area',
    emailLabel: 'Your email',
    emailPlaceholder: 'you@email.com',
    consent: 'I agree to be notified by email when Stacks Drive comes to my area.',
    submit: 'Notify me',
    sending: 'Sending…',
    success: 'You’re on the list — we’ll let you know when Stacks Drive comes to your area.',
    already: 'This email is already on the list — we’ll let you know when Stacks Drive comes to your area.',
    error: 'Couldn’t send right now. Please try again in a moment.',
    invalidEmail: 'Enter a valid email address.',
    consentRequired: 'Tick the box to agree to be notified by email.',
    contact: 'Any question? Write to Stacks Drive: stacks.markett@gmail.com',
    langLabel: 'Language',
  },
} as const;

function defaultLang(): Lang {
  try {
    return window.navigator.language.toLowerCase().startsWith('en') ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

export function OutOfZoneScreen({
  place,
  onClose,
}: {
  /** Ville / pays en best-effort (reverse-geocoding, jamais de
   *  coordonnées) — affichés dans le titre de la liste d'attente,
   *  envoyés avec l'e-mail. Null si inconnus. */
  place: { city: string | null; country: string | null } | null;
  /** Ferme l'écran (l'appelant pose aussi le drapeau session). */
  onClose: () => void;
}) {
  const [lang, setLang] = useState<Lang>(defaultLang);
  const t = TEXTS[lang];
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<'ok' | 'already' | null>(null);

  const placeLabel =
    place && (place.city || place.country)
      ? [place.city, place.country].filter(Boolean).join(', ')
      : null;

  async function submitNotify(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setFormError(t.invalidEmail);
      return;
    }
    if (!consent) {
      setFormError(t.consentRequired);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/notify-me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          consent: true,
          city: place?.city ?? null,
          country: place?.country ?? null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(data?.error ?? t.error);
        return;
      }
      setDone(data?.already ? 'already' : 'ok');
    } catch {
      setFormError(t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    // z-[110] : au-dessus du tutoriel passager (z-[100], premier
    // lancement) — le message hors zone est la première chose qu'un
    // visiteur lointain doit voir et pouvoir fermer.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.title}
      data-testid="out-of-zone-screen"
      className="fixed inset-0 z-[110] min-h-dvh bg-night-950 text-slate-100 flex flex-col items-center justify-center px-4 py-10 text-center overflow-y-auto"
    >
      {/* Fond animé discret (vocabulaire existant) : anneaux radar
          sarcelle qui s'étendent derrière la tuile, comme le radar de
          recherche — rien de plus, l'écran reste lisible. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72">
          <span className="radar-ring inset-0" />
          <span className="radar-ring delayed inset-0" />
        </div>
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-rose-500/5 blur-3xl" />
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-sarcelle/5 blur-3xl" />
      </div>

      {/* Basculeur FR | EN */}
      <div
        className="relative inline-flex rounded-full bg-white/10 border border-white/15 p-1 mb-8"
        role="group"
        aria-label={t.langLabel}
      >
        {(['fr', 'en'] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-colors ${
              lang === l ? 'bg-rose-500 text-night-900' : 'text-slate-300 hover:text-white'
            }`}
          >
            {l === 'fr' ? 'Français' : 'English'}
          </button>
        ))}
      </div>

      <div className="relative rise-in flex flex-col items-center max-w-md w-full">
        <div className="out-of-zone-tile w-16 h-16 rounded-2xl bg-rose-500 flex items-center justify-center text-night-900 shadow-lg shadow-rose-500/40">
          <DriveGlobe size={32} />
        </div>
        {placeLabel && (
          <p className="inline-flex items-center gap-1.5 mt-5 text-xs font-black uppercase tracking-widest text-sarcelle">
            <DrivePin size={13} /> {placeLabel}
          </p>
        )}
        <h1 className="font-black text-2xl sm:text-3xl mt-4 tracking-tight leading-tight">
          {t.title}
        </h1>
        <p className="text-slate-400 text-sm sm:text-base mt-2 leading-relaxed">
          {t.subtitle}
        </p>

        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            data-testid="out-of-zone-explore"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-rose-500 text-night-900 font-black shadow-lg shadow-rose-500/30 hover:bg-rose-300 transition-colors"
          >
            <DrivePin size={16} /> {t.explore}
          </button>
        </div>

        {/* « Me prévenir » — e-mail + consentement explicite. */}
        <div className="w-full mt-8 rounded-3xl border border-white/10 bg-white/5 p-5 text-left">
          {done ? (
            <p className="flex items-start gap-2 text-sm font-bold text-slate-100 leading-relaxed">
              <DriveCheckBadge size={18} className="text-rose-300 shrink-0 mt-0.5" />
              {done === 'already' ? t.already : t.success}
            </p>
          ) : (
            <form onSubmit={submitNotify} noValidate>
              <label htmlFor="out-of-zone-email" className="flex items-center gap-2 text-sm font-black text-slate-100">
                <DriveBell size={16} className="text-rose-300" /> {t.notifyTitle}
              </label>
              <div className="flex items-center gap-2 mt-3 rounded-full bg-night-900 border border-white/15 px-4 focus-within:border-rose-500/60">
                <DriveMail size={16} className="text-slate-400 shrink-0" />
                <input
                  id="out-of-zone-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
              </div>
              <label className="flex items-start gap-2.5 mt-3 text-xs text-slate-400 leading-relaxed cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[#FF4D8D]"
                />
                {t.consent}
              </label>
              {formError && (
                <p role="alert" className="text-xs font-bold text-red-400 mt-2">
                  {formError}
                </p>
              )}
              <button
                type="submit"
                disabled={busy}
                data-testid="out-of-zone-notify"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white/10 text-slate-100 font-black hover:bg-white/20 transition-colors disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <LogoLoader size={18} /> {t.sending}
                  </>
                ) : (
                  <>
                    <DriveBell size={16} /> {t.submit}
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-6">{t.contact}</p>
      </div>
    </div>
  );
}
