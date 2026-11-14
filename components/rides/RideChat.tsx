'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { timeAgo } from '@/lib/dates';
import { cn } from '@/lib/utils';

export interface ChatMessage {
  id: string;
  senderRole: 'passager' | 'chauffeur';
  body: string;
  createdAt: string;
}

/** Messages rapides du passager : « Où êtes-vous ? » est la question
 *  que Randy voulait permettre au client de poser à son chauffeur. */
const QUICK_MESSAGES = ['Où êtes-vous ?', "J'arrive", 'Je suis devant…'];

/** Fil de discussion d'une course (v2.10) : messagerie in-app entre le
 *  passager et le chauffeur, pendant que la course est en cours. Aucun
 *  numéro de téléphone n'est affiché — l'échange passe par l'app.
 *  Sondage court (3 s) : le projet n'utilise pas Supabase Realtime.
 *  Si la migration v2.10 n'est pas appliquée, la messagerie s'affiche
 *  comme non activée — jamais de crash. */
export function RideChat({
  rideId,
  myRole,
  otherName,
}: {
  rideId: string;
  myRole: 'passager' | 'chauffeur';
  otherName: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<'loading' | 'open' | 'closed' | 'unavailable'>('loading');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 403) setState('closed');
        else if (res.status === 503) setState('unavailable');
        return;
      }
      if (data?.unavailable) {
        setState('unavailable');
        return;
      }
      setMessages((data?.messages ?? []) as ChatMessage[]);
      setState('open');
    } catch {
      // Réseau instable : prochain sondage.
    }
  }, [rideId]);

  useEffect(() => {
    fetchMessages();
    const t = window.setInterval(fetchMessages, 3000);
    return () => window.clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function send(body: string) {
    const text = body.trim();
    if (!text || sending || state !== 'open') return;
    setSending(true);
    setError(null);
    // Envoi optimiste : le message apparaît tout de suite.
    const tempId = `tmp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempId, senderRole: myRole, body: text, createdAt: new Date().toISOString() },
    ]);
    setInput('');
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setError(data?.error ?? 'Envoi impossible.');
        return;
      }
      // Le message de la base remplace celui affiché en optimiste.
      if (data?.message) {
        const saved = data.message as ChatMessage;
        setMessages((prev) => prev.map((m) => (m.id === tempId ? saved : m)));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError('Envoi impossible — vérifie ta connexion.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div id="messages" className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4 scroll-mt-24">
      <h2 className="font-black text-lg text-slate-900 flex items-center gap-2">
        <MessageCircle size={20} className="text-stacks-green" />
        Messages — {otherName}
      </h2>

      {state === 'loading' && (
        <p className="text-sm text-slate-500">Chargement des messages…</p>
      )}
      {state === 'closed' && (
        <p className="text-sm text-slate-500">
          La messagerie est fermée pour cette course.
        </p>
      )}
      {state === 'unavailable' && (
        <p className="text-sm text-slate-500">
          La messagerie n’est pas activée pour cette course.
        </p>
      )}

      {state === 'open' && (
        <>
          <div
            className="max-h-80 overflow-y-auto space-y-2 pr-1"
            role="log"
            aria-live="polite"
            aria-label="Messages de la course"
          >
            {messages.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucun message pour l’instant — écris à {myRole === 'passager' ? 'ton chauffeur' : 'ton passager'} ici.
              </p>
            ) : (
              messages.map((m) => {
                const mine = m.senderRole === myRole;
                return (
                  <div key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm',
                        mine
                          ? 'bg-gold text-night-950 font-semibold rounded-br-md'
                          : 'bg-slate-100 text-slate-800 rounded-bl-md'
                      )}
                    >
                      <p className="break-words">{m.body}</p>
                      <p className={cn('text-[11px] mt-1', mine ? 'text-night-950/60' : 'text-slate-400')}>
                        {timeAgo(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Messages rapides (passager) : « Où êtes-vous ? » en un tap. */}
          {myRole === 'passager' && (
            <div className="flex flex-wrap gap-2">
              {QUICK_MESSAGES.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => send(q)}
                  className="px-3 py-1.5 rounded-full text-xs font-black bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition-all disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </p>
          )}

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <label htmlFor={`chat-input-${rideId}`} className="sr-only">
              Écrire un message
            </label>
            <input
              id={`chat-input-${rideId}`}
              type="text"
              value={input}
              maxLength={500}
              disabled={sending}
              onChange={(e) => setInput(e.target.value)}
              placeholder={myRole === 'passager' ? 'Écrire à ton chauffeur…' : 'Écrire à ton passager…'}
              className="flex-1 min-w-0 px-4 py-3 rounded-full bg-slate-50 border border-slate-200 text-sm focus:border-stacks-green focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || input.trim().length === 0}
              aria-label="Envoyer le message"
              className="shrink-0 w-12 h-12 rounded-full bg-stacks-green text-white flex items-center justify-center shadow-md hover:bg-stacks-greenLight active:scale-95 transition-all disabled:opacity-50"
            >
              <Send size={18} />
            </button>
          </form>
          <p className="text-xs text-slate-400">
            Messages visibles uniquement par vous deux, pendant la course.
          </p>
        </>
      )}
    </div>
  );
}
