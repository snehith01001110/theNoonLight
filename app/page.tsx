'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';

export default function LandingPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // No-op — we check auth on submit
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const q = encodeURIComponent(query.trim());
    if (user) {
      router.push(`/explore?q=${q}`);
    } else {
      router.push(`/auth/login?q=${q}`);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#08090e] text-slate-200 relative overflow-hidden">
      {/* Animated logo */}
      <div className="relative w-32 h-32 mb-10">
        <div className="logo-ring absolute inset-0 border border-sky-500/40 rounded-full"></div>
        <div className="logo-ring-reverse absolute inset-3 border border-violet-500/30 rounded-full"></div>
        <div className="absolute inset-6 border border-emerald-500/20 rounded-full"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 bg-sky-400 rounded-full shadow-[0_0_12px_rgba(56,189,248,0.8)]"></div>
        </div>
      </div>

      <div className="text-xs uppercase tracking-[0.35em] text-slate-500 mb-3">
        Knowledge Graph
      </div>
      <h1
        className="text-slate-100 text-center mb-8"
        style={{ fontWeight: 200, fontSize: '46px', lineHeight: 1.1 }}
      >
        I want to learn
      </h1>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full max-w-md px-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="quantum computing, jazz theory, neural networks..."
          className="flex-1 bg-transparent border-b border-slate-700 text-slate-100 text-lg py-3 focus:outline-none focus:border-sky-400 placeholder-slate-600 font-light"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-6 py-3 text-sky-400 border border-sky-500/40 rounded hover:bg-sky-500/10 transition disabled:opacity-40 text-sm uppercase tracking-widest"
        >
          {loading ? '...' : 'Go'}
        </button>
      </form>

      <div className="absolute bottom-6 text-xs text-slate-600 uppercase tracking-widest">
        Graphmind · Wikipedia × Claude
      </div>
    </main>
  );
}
