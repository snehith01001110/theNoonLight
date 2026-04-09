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
    <div className="fixed bottom-4 left-3 right-3 md:left-4 md:right-auto z-20 flex items-center gap-1.5 md:gap-3 text-xs flex-wrap">
      <div className="px-2.5 max-md:px-2 py-2 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-400">
        <span className="text-slate-500 max-md:hidden">Topics:</span>
        <span className="text-slate-500 md:hidden">T:</span>{' '}
        <span className="text-slate-200">{rootNodes.length}</span>
      </div>
      {path.length > 0 && (
        <button
          onClick={goBack}
          className="px-2.5 max-md:px-2 py-2 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-300 hover:text-sky-300"
        >
          ←
        </button>
      )}
      <button
        onClick={handleReset}
        className="px-2.5 max-md:px-2 py-2 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-400 hover:text-rose-400"
      >
        Reset
      </button>
      <button
        onClick={handleSignOut}
        className="px-2.5 max-md:px-2 py-2 md:py-2 bg-slate-900/80 backdrop-blur border border-slate-800 rounded text-slate-400 hover:text-slate-200 max-md:ml-auto"
      >
        Sign Out
      </button>
    </div>
  );
}