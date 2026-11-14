'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, Share2 } from 'lucide-react';
import {
  buildTrustedShareText,
  smsShareLink,
  waShareLink,
  type TrustedContact,
} from '@/lib/trusted-contacts';

/** Partage automatique du suivi (v2.23) : pendant la course, le
 *  passager voit à qui le lien de suivi a été envoyé automatiquement
 *  (e-mail, au départ) et peut le renvoyer en 1 tap (WhatsApp / SMS)
 *  à ses contacts sans adresse e-mail. Le lien de suivi lui-même est
 *  passé en prop par la page serveur (jamais deviné côté client). */
export function TrustedSharePanel({
  shareUrl,
  pickup,
  destination,
  driverName,
  plate,
  priceLabel,
}: {
  shareUrl: string;
  pickup: string;
  destination: string;
  driverName: string | null;
  plate: string | null;
  priceLabel: string;
}) {
  const [contacts, setContacts] = useState<TrustedContact[] | null>(null);

  useEffect(() => {
    fetch('/api/trusted-contacts')
      .then((r) => r.json())
      .then((d) => setContacts((d?.contacts ?? []) as TrustedContact[]))
      .catch(() => setContacts([]));
  }, []);

  if (contacts === null || contacts.length === 0) return null;

  const absoluteUrl =
    typeof window !== 'undefined' && shareUrl.startsWith('/')
      ? `${window.location.origin}${shareUrl}`
      : shareUrl;
  const text = buildTrustedShareText({
    shareUrl: absoluteUrl,
    pickup,
    destination,
    driverName,
    plate,
    price: priceLabel,
  });
  const emailed = contacts.filter((c) => c.email);

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-3">
      <h2 className="font-black text-slate-900 flex items-center gap-1.5">
        <Share2 size={18} className="text-stacks-green" /> Suivi partagé avec tes proches
      </h2>
      <p className="text-sm text-slate-600">
        {emailed.length > 0
          ? `Lien de suivi envoyé automatiquement par e-mail au départ à ${emailed.map((c) => c.name).join(', ')}.`
          : 'Aucun envoi automatique par e-mail — tes contacts n’ont pas d’adresse renseignée.'}{' '}
        Tu peux aussi le renvoyer en 1 tap :
      </p>
      <ul className="space-y-2">
        {contacts.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-bold text-slate-900">
              {c.name} <span className="font-normal text-slate-500">· {c.phone}</span>
            </span>
            <span className="flex gap-2">
              <a
                href={waShareLink(c.phone, text)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                <MessageCircle size={13} /> WhatsApp
              </a>
              <a
                href={smsShareLink(c.phone, text)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              >
                SMS
              </a>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
