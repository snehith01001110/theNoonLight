'use client';

import { useState, useRef, useEffect } from 'react';
import { useGraphStore } from '@/lib/store';
import RichSummary from './RichSummary';
import type { ChatMessage } from '@/lib/types';

export default function Sidebar() {
  const currentParent = useGraphStore((s) => s.currentParent);
  const currentNodes = useGraphStore((s) => s.currentNodes);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  // Reset chat when parent changes
  useEffect(() => {
    setMessages([]);
    setInput('');
  }, [currentParent?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!sidebarOpen || !currentParent) return null;

  async function sendMessage() {
    if (!input.trim() || streaming || !currentParent) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setStreaming(true);

    // Add empty assistant message
    setMessages((m) => [...m, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wikiTitle: currentParent.wiki_title,
          summary: currentParent.summary,
          messages: next,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Chat failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: 'assistant',
          content: 'Sorry, something went wrong.',
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

            </div>
  return (
    <>
      <div
        className="fixed inset-0 z-20"
        onClick={() => setSidebarOpen(false)}
        aria-hidden
      />

      <aside
        ref={sidebarRef}
        className="
          fixed z-30 flex flex-col bg-[#0b0d14]/95 backdrop-blur-md border-slate-800
          max-md:inset-x-0 max-md:bottom-0 max-md:h-[55vh] max-md:rounded-t-2xl max-md:border-t
          md:top-0 md:right-0 md:h-full md:w-[420px] md:max-w-[90vw] md:border-l
          animate-slide-in-right
        "
      >
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-600/60" />
        </div>

        <div className="p-4 md:p-5 max-md:pt-2 border-b border-slate-800 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">
              Currently exploring
            </div>
            <h2 className="text-emerald-400 text-xl md:text-2xl font-light leading-tight truncate">
              {currentParent.label}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <div className="text-xs text-slate-500">
                {currentNodes.length} subtopics
              </div>
              {currentParent.wiki_title && (
                <a
                  href={`https://en.wikipedia.org/wiki/${encodeURIComponent(currentParent.wiki_title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3 h-3"
                  >
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Wikipedia
                </a>
              )}
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-500 hover:text-slate-200 text-2xl md:text-xl leading-none p-1 -mr-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4" ref={scrollRef}>
          <section>
            <RichSummary markdown={currentParent.summary ?? ''} />
          </section>

          {messages.length > 0 && (
            <section className="border-t border-slate-800 pt-4 space-y-3">
              <div className="text-xs uppercase tracking-widest text-slate-500">
                Chat
              </div>
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'text-slate-300 bg-slate-800/40 p-3 rounded'
                      : 'text-slate-100'
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">
                    {m.role === 'user' ? 'You' : 'Claude'}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content || '...'}</div>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="p-3 md:p-4 border-t border-slate-800 pb-safe">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${currentParent.label}...`}
              disabled={streaming}
              className="flex-1 bg-slate-900 border border-slate-800 text-slate-200 text-sm px-3 py-2 rounded focus:outline-none focus:border-sky-500"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="px-4 py-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 text-sm rounded hover:bg-sky-500/30 disabled:opacity-40"
            >
              {streaming ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
