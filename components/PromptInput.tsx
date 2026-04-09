'use client';

import { useState } from 'react';
import { useGraphStore } from '@/lib/store';

export default function PromptInput() {
  const [value, setValue] = useState('');
  const startTopic = useGraphStore((s) => s.startTopic);
  const loading = useGraphStore((s) => s.loading);
  const path = useGraphStore((s) => s.path);

  // Only show at home level
  if (path.length > 0) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() || loading) return;
    const q = value.trim();
    setValue('');
    await startTopic(q);
  }

  return (
    <form
      onSubmit={submit}
      className="fixed top-4 left-3 right-3 md:left-auto md:right-4 z-20 flex items-center gap-2"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a topic or idea…"
        disabled={loading}
        className="bg-slate-900/80 backdrop-blur border border-slate-800 text-slate-200 text-sm px-3 py-2.5 md:py-2 rounded focus:outline-none focus:border-sky-500 flex-1 md:flex-none md:w-56"
      />
      <button
        type="submit"
        disabled={loading || !value.trim()}
        className="px-4 py-2.5 md:py-2 bg-sky-500/20 border border-sky-500/40 text-sky-300 text-sm rounded hover:bg-sky-500/30 disabled:opacity-40 shrink-0"
      >
        {loading ? '...' : '+'}
      </button>
    </form>
  );
}