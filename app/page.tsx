'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

const EXAMPLE_TOPICS = [
  { label: 'Quantum Computing', icon: '⚛' },
  { label: 'Renaissance Art', icon: '🎨' },
  { label: 'Machine Learning', icon: '🧠' },
  { label: 'Roman Empire', icon: '🏛' },
  { label: 'Black Holes', icon: '🌌' },
  { label: 'Jazz Music', icon: '🎷' },
];

export default function LandingPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const q = encodeURIComponent(query.trim());
    sessionStorage.setItem('pendingQuery', query.trim());
    if (user) {
      router.push(`/explore?q=${q}`);
    } else {
      router.push(`/auth/login?q=${q}`);
    }
  }

  function handleExampleClick(topic: string) {
    setQuery(topic);
    // Submit after state update
    setTimeout(() => {
      const form = document.querySelector('form');
      form?.requestSubmit();
    }, 50);
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#08090e] text-slate-200 relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 600,
          height: 600,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(56,189,248,0.04) 0%, rgba(56,189,248,0) 70%)',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -55%)',
        }}
      />

      {/* Animated logo */}
      <div className="relative w-20 h-20 mb-8 md:w-28 md:h-28 md:mb-12">
        <div className="logo-ring absolute inset-0 border border-slate-600/40 rounded-full" />
        <div className="logo-ring-reverse absolute inset-3 border border-slate-500/25 rounded-full" />
        <div className="absolute inset-6 border border-slate-500/15 rounded-full" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-1.5 h-1.5 bg-sky-400 rounded-full shadow-[0_0_10px_rgba(56,189,248,0.7)]" />
        </div>
      </div>

      <h1
        className="text-slate-100 text-center mb-3 md:mb-4 select-none text-[28px] md:text-[42px]"
        style={{ fontWeight: 200, lineHeight: 1.1, letterSpacing: '-0.01em' }}
      >
        I want to learn
      </h1>

      <p className="text-slate-500 text-sm md:text-base font-light mb-8 md:mb-10 text-center px-6 max-w-md">
        Explore any topic as a 3D knowledge graph. Click nodes to dive deeper.
      </p>

      <form onSubmit={handleSubmit} className="relative w-full max-w-lg px-6">
        <div
          className="relative rounded-xl transition-all duration-300"
          style={{
            background: focused
              ? 'rgba(30, 41, 59, 0.5)'
              : 'rgba(15, 23, 42, 0.4)',
            border: `1px solid ${focused ? 'rgba(56,189,248,0.3)' : 'rgba(71,85,105,0.3)'}`,
            boxShadow: focused
              ? '0 0 30px rgba(56,189,248,0.06), 0 4px 20px rgba(0,0,0,0.3)'
              : '0 4px 20px rgba(0,0,0,0.2)',
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Type a topic..."
            className="w-full bg-transparent text-slate-100 text-base md:text-lg py-3 md:py-4 px-4 md:px-5 pr-16 md:pr-20 focus:outline-none placeholder-slate-500 font-light"
            autoFocus
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-5 py-2 rounded-lg text-sm font-medium tracking-wide transition-all duration-200 disabled:opacity-30 disabled:cursor-default"
            style={{
              background:
                query.trim()
                  ? 'rgba(56,189,248,0.15)'
                  : 'transparent',
              color: query.trim() ? '#7dd3fc' : '#475569',
            }}
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-sky-400/40 border-t-sky-400 rounded-full animate-spin" />
            ) : (
              '→'
            )}
          </button>
        </div>
      </form>

      {/* Example topics */}
      <div
        className="mt-8 md:mt-10 flex flex-wrap justify-center gap-2 px-6 max-w-xl transition-all duration-700"
        style={{ opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(8px)' }}
      >
        {EXAMPLE_TOPICS.map((t) => (
          <button
            key={t.label}
            onClick={() => handleExampleClick(t.label)}
            disabled={loading}
            className="px-3.5 py-1.5 rounded-full text-xs md:text-sm text-slate-400 hover:text-sky-300 border border-slate-800 hover:border-sky-500/30 hover:bg-sky-500/5 transition-all duration-200 disabled:opacity-30"
          >
            <span className="mr-1.5">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* How it works hint */}
      <div
        className="mt-12 md:mt-16 text-center transition-all duration-700 delay-300"
        style={{ opacity: mounted ? 1 : 0 }}
      >
        <div className="flex items-center justify-center gap-6 md:gap-8 text-[11px] md:text-xs text-slate-600 uppercase tracking-[0.15em]">
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-8 h-8 rounded-full border border-slate-800 flex items-center justify-center text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
              </svg>
            </div>
            <span>Search</span>
          </div>
          <div className="text-slate-700">→</div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-8 h-8 rounded-full border border-slate-800 flex items-center justify-center text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.184-.551a1 1 0 01.632-.633l.551-.183a1 1 0 000-1.898l-.551-.184a1 1 0 01-.633-.632l-.183-.551z" />
              </svg>
            </div>
            <span>Explore</span>
          </div>
          <div className="text-slate-700">→</div>
          <div className="flex flex-col items-center gap-1.5">
            <div className="w-8 h-8 rounded-full border border-slate-800 flex items-center justify-center text-slate-500">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M10 2a6 6 0 00-6 6c0 1.887-.454 3.665-1.257 5.234a.75.75 0 00.515 1.076 32.91 32.91 0 003.256.508 3.5 3.5 0 006.972 0 32.903 32.903 0 003.256-.508.75.75 0 00.515-1.076A11.448 11.448 0 0116 8a6 6 0 00-6-6zm0 14.5a2 2 0 01-1.95-1.557 33.54 33.54 0 003.9 0A2 2 0 0110 16.5z" clipRule="evenodd" />
              </svg>
            </div>
            <span>Understand</span>
          </div>
        </div>
      </div>
    </main>
  );
}