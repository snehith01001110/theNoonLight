'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function LandingPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const q = encodeURIComponent(query.trim());
      // Persist query so it survives the login redirect chain
      try { sessionStorage.setItem('pendingQuery', query.trim()); } catch {}
      if (user) {
        router.push(`/explore?q=${q}`);
      } else {
        router.push(`/auth/login?q=${q}`);
      }
    } catch {
      // Auth check failed — skip straight to login with query preserved
      const q = encodeURIComponent(query.trim());
      router.push(`/auth/login?q=${q}`);
    }
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
        className="text-slate-100 text-center mb-8 md:mb-10 select-none text-[28px] md:text-[42px]"
        style={{ fontWeight: 200, lineHeight: 1.1, letterSpacing: '-0.01em' }}
      >
        I want to learn
      </h1>

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
    </main>
  );
}