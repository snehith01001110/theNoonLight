'use client';

import { useEffect, useState } from 'react';
import { useGraphStore } from '@/lib/store';
import { createClient } from '@/lib/supabase-browser';
import type { GraphNode } from '@/lib/types';

export default function Breadcrumb() {
  const path = useGraphStore((s) => s.path);
  const goToLevel = useGraphStore((s) => s.goToLevel);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      if (path.length === 0) {
        setLabels([]);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from('graph_nodes')
        .select('id, label')
        .in('id', path);
      const byId = new Map<string, string>();
      (data ?? []).forEach((n: any) => byId.set(n.id, n.label));
      setLabels(path.map((id) => byId.get(id) ?? '…'));
    }
    load();
  }, [path]);

  return (
    <nav className="fixed top-4 left-4 z-20 flex items-center gap-2 text-sm">
      <button
        onClick={() => goToLevel(-1)}
        className="text-slate-400 hover:text-sky-300 transition-colors"
      >
        Home
      </button>
      {labels.map((label, i) => (
        <span key={i} className="flex items-center gap-2">
          <span className="text-slate-600">›</span>
          <button
            onClick={() => goToLevel(i)}
            className={`transition-colors ${
              i === labels.length - 1
                ? 'text-emerald-400'
                : 'text-slate-400 hover:text-sky-300'
            }`}
          >
            {label}
          </button>
        </span>
      ))}
    </nav>
  );
}
