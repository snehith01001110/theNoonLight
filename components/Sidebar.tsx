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
  const summaryStatus = useGraphStore((s) => s.summaryStatus);

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
          fixed z-30 flex flex-col bg-[#0a0c13]/95 backdrop-blur-xl border-slate-700/50
          max-md:inset-x-0 max-md:bottom-0 max-md:h-[70vh] max-md:rounded-t-2xl max-md:border-t
          md:top-0 md:right-0 md:h-full md:w-[420px] md:max-w-[90vw] md:border-l
          max-md:animate-slide-in-bottom md:animate-slide-in-right
        "
      >
        {/* Mobile drag handle */}
        <div className="md:hidden flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-slate-600/60" />
        </div>

        {/* Top gradient accent bar */}
        <div className="h-[2px] bg-gradient-to-r from-emerald-500/60 via-sky-500/50 to-violet-500/40" />

        {/* Header */}
        <div className="px-5 pt-4 pb-4 max-md:px-4 max-md:pt-3 max-md:pb-3 flex items-start justify-between">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2 font-medium">
              Currently exploring
            </div>
            <h2 className="text-[22px] max-md:text-xl font-light leading-tight truncate text-emerald-400">
              {currentParent.label}
            </h2>
            <div className="flex items-center gap-2.5 mt-2.5">
              <span className="text-[11px] text-slate-400 bg-slate-800/60 rounded-full px-2.5 py-0.5 border border-slate-700/50">
                {currentNodes.length} subtopics
              </span>
              {currentParent.wiki_title && (
                <a
                  href={`https://en.wikipedia.org/wiki/${encodeURIComponent(currentParent.wiki_title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-sky-400/80 hover:text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 rounded-full px-2.5 py-0.5 border border-sky-500/20 flex items-center gap-1.5 transition-all"
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
            className="text-slate-600 hover:text-slate-300 text-lg leading-none p-1.5 -mr-1 rounded-lg hover:bg-slate-800/50 transition-all"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Subtle divider */}
        <div className="mx-5 max-md:mx-4 h-px bg-gradient-to-r from-slate-700/60 via-slate-700/30 to-transparent" />

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 max-md:px-4 max-md:py-3 space-y-4 max-md:space-y-3" ref={scrollRef}>
          <section>
            {summaryStatus === 'loading' && !currentParent.summary ? (
              <div className="space-y-4 animate-pulse">
                {/* Skeleton section header */}
                <div className="flex items-center gap-2.5">
                  <div className="w-0.5 h-4 rounded-full bg-emerald-500/20" />
                  <div className="h-3 w-20 bg-slate-700/50 rounded" />
                </div>
                <div className="space-y-2 pl-1">
                  <div className="h-2.5 w-full bg-slate-800/60 rounded" />
                  <div className="h-2.5 w-5/6 bg-slate-800/60 rounded" />
                </div>
                {/* Skeleton section header */}
                <div className="flex items-center gap-2.5 mt-2">
                  <div className="w-0.5 h-4 rounded-full bg-emerald-500/20" />
                  <div className="h-3 w-24 bg-slate-700/50 rounded" />
                </div>
                <div className="space-y-2 pl-1">
                  <div className="h-2.5 w-full bg-slate-800/60 rounded" />
                  <div className="h-2.5 w-4/6 bg-slate-800/60 rounded" />
                  <div className="h-2.5 w-5/6 bg-slate-800/60 rounded" />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="w-1.5 h-1.5 bg-sky-400/50 rounded-full animate-[pulse_1.4s_ease-in-out_infinite]" />
                  <span className="text-[11px] text-slate-500">Generating summary...</span>
                </div>
              </div>
            ) : summaryStatus === 'error' && !currentParent.summary ? (
              <div className="text-slate-500 text-sm flex items-center gap-2.5 bg-amber-500/5 border border-amber-500/15 rounded-lg p-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500/70 shrink-0">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                Couldn&apos;t load summary. Try diving in again.
              </div>
            ) : (
              <RichSummary markdown={currentParent.summary ?? ''} />
            )}
          </section>

          {/* Chat messages */}
          {messages.length > 0 && (
            <section className="pt-4 space-y-3">
              <div className="h-px bg-gradient-to-r from-slate-700/60 via-slate-700/30 to-transparent mb-4" />
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-0.5 h-4 rounded-full bg-gradient-to-b from-sky-400 to-sky-400/20" />
                <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-slate-400">
                  Chat
                </span>
              </div>
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`text-sm max-md:text-xs leading-relaxed rounded-lg p-3 ${
                    m.role === 'user'
                      ? 'text-slate-300 bg-slate-800/40 border-l-2 border-slate-600/50'
                      : 'text-slate-200 bg-sky-500/5 border-l-2 border-sky-500/30'
                  }`}
                >
                  <div className={`text-[10px] uppercase tracking-[0.15em] font-semibold mb-1.5 ${
                    m.role === 'user' ? 'text-slate-500' : 'text-sky-400/70'
                  }`}>
                    {m.role === 'user' ? 'You' : 'Claude'}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content || '...'}</div>
                </div>
              ))}
            </section>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 py-3 md:px-5 md:py-4 border-t border-slate-700/40 pb-safe">
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
              className="flex-1 bg-slate-900/80 border border-slate-700/50 text-slate-200 text-sm px-3.5 py-2.5 rounded-lg focus:outline-none focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20 placeholder:text-slate-600 transition-all"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className="px-4 py-2.5 bg-gradient-to-r from-sky-500/25 to-sky-600/20 border border-sky-500/30 text-sky-300 text-sm rounded-lg hover:from-sky-500/35 hover:to-sky-600/30 hover:border-sky-500/50 disabled:opacity-30 disabled:hover:from-sky-500/25 transition-all"
            >
              {streaming ? '...' : 'Send'}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
