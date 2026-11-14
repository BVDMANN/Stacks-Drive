'use client';

import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { MAX_TRUSTED_CONTACTS, type TrustedContact } from '@/lib/trusted-contacts';

/** Contacts de confiance (v2.23) : le passager les définit dans son
 *  compte (nom + téléphone, e-mail optionnel, max 5). Au départ de
 *  chaque course, le lien de suivi part automatiquement vers ceux
 *  qui ont une adresse e-mail ; les autres sont joints en 1 tap
 *  (WhatsApp / SMS) depuis l'écran de course. */
export function TrustedContactsForm() {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch('/api/trusted-contacts').catch(() => null);
    const data = await res?.json().catch(() => null);
    setLoading(false);
    if (!res?.ok) {
      if (data?.unavailable) setUnavailable(true);
      else setError(data?.error ?? 'Chargement impossible.');
      return;
    }
    setContacts((data?.contacts ?? []) as TrustedContact[]);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    const res = await fetch('/api/trusted-contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() || null }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? 'Ajout impossible.');
      return;
    }
    setContacts((prev) => [...prev, data.contact as TrustedContact]);
    setName('');
    setPhone('');
    setEmail('');
    setSaved(true);
  }

  async function remove(id: string) {
    setError(null);
    await fetch('/api/trusted-contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => undefined);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-500 inline-flex items-center gap-2">
        <Loader2 size={15} className="animate-spin" /> Chargement de tes contacts de confiance…
      </p>
    );
  }

  if (unavailable) {
    return (
      <p className="text-sm text-slate-500">
        Les contacts de confiance seront activés quand la migration v2.23 sera appliquée dans
        Supabase.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 leading-relaxed">
        Au départ de chaque course, ton lien de suivi en direct est envoyé automatiquement à tes
        contacts de confiance (par e-mail quand une adresse est renseignée, sinon en 1 tap
        WhatsApp / SMS depuis l’écran de course). Ils voient ton trajet, ton chauffeur et sa
        plaque — jamais ton numéro, jamais celui du chauffeur.
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
          Contact ajouté — il recevra ton lien de suivi au départ de tes prochaines courses.
        </p>
      )}

      {contacts.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {contacts.map((c) => (
            <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-stacks-green" /> {c.name}
                </p>
                <p className="text-slate-500">
                  {c.phone}
                  {c.email ? ` · ${c.email} (envoi auto par e-mail)` : ' · envoi en 1 tap (WhatsApp / SMS)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => remove(c.id)}
                className="inline-flex items-center gap-1 text-sm font-bold text-red-600 hover:underline"
                aria-label={`Retirer ${c.name} de tes contacts de confiance`}
              >
                <Trash2 size={15} /> Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      {contacts.length === 0 && (
        <p className="text-sm text-slate-500">Aucun contact de confiance pour le moment.</p>
      )}

      {contacts.length < MAX_TRUSTED_CONTACTS ? (
        <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-3">
          <input
            type="text"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du contact (ex. : Maman)"
            aria-label="Nom du contact de confiance"
            className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none"
          />
          <input
            type="tel"
            required
            minLength={8}
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Téléphone (ex. : 077 00 00 00)"
            aria-label="Téléphone du contact de confiance"
            className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none"
          />
          <input
            type="email"
            maxLength={120}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mail (optionnel — pour l’envoi automatique)"
            aria-label="E-mail du contact de confiance (optionnel)"
            className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-stacks-green focus:outline-none sm:col-span-2"
          />
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-black bg-stacks-green text-white hover:bg-stacks-greenLight transition-colors disabled:opacity-50 sm:col-span-2"
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            <UserPlus size={16} /> {busy ? 'Ajout…' : 'Ajouter ce contact'}
          </button>
        </form>
      ) : (
        <p className="text-sm text-slate-500">
          Maximum {MAX_TRUSTED_CONTACTS} contacts de confiance — retire-en un pour en ajouter un autre.
        </p>
      )}
    </div>
  );
}
