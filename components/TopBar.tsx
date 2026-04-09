'use client';

import { useGraphStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import { useRouter } from 'next/navigation';

export default function TopBar() {
  const reset = useGraphStore((s) => s.reset);
  const path = useGraphStore((s) => s.path);
  const rootNodes = useGraphStore((s) => s.rootNodes);
  const goBack = useGraphStore((s) => s.goBack);
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
  }

  async function handleReset() {
    if (confirm('Delete your entire knowledge graph? This cannot be undone.')) {
      await reset();
    }
  }

  return (
    <div className="fixed bottom-4 left-3 right-3 md:left-4 md:right-auto z-20 flex items-center gap-2 md:gap-3 text-xs flex-wrap">
      <div className="px-3 py-2.5 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-400">
        <span className="text-slate-500">Topics:</span>{' '}
        <span className="text-slate-200">{rootNodes.length}</span>
      </div>
      {path.length > 0 && (
        <button
          onClick={goBack}
          className="px-3 py-2.5 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-300 hover:text-sky-300"
        >
          ← Back
        </button>
      )}
      <button
        onClick={handleReset}
        className="px-3 py-2.5 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-400 hover:text-rose-400"
      >
        Reset
      </button>
      <button
        onClick={handleSignOut}
        className="px-3 py-2.5 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-400 hover:text-slate-200"
      >
        Sign out
      </button>
    </div>
  );
}
