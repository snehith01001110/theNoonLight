'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { useGraphStore } from '@/lib/store';
import Sidebar from '@/components/Sidebar';
import Breadcrumb from '@/components/Breadcrumb';
import PromptInput from '@/components/PromptInput';
import TopBar from '@/components/TopBar';

// Disable SSR for the 3D canvas
const Scene = dynamic(() => import('@/components/Scene'), { ssr: false });

function ExploreContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setUserId = useGraphStore((s) => s.setUserId);
  const loadInitial = useGraphStore((s) => s.loadInitial);
  const startTopic = useGraphStore((s) => s.startTopic);
  const loading = useGraphStore((s) => s.loading);
  const loadingMessage = useGraphStore((s) => s.loadingMessage);
  const userId = useGraphStore((s) => s.userId);
  const initialQueryProcessed = useRef(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/auth/login');
        return;
      }
      setUserId(user.id);
      await loadInitial();

      const q = searchParams.get('q');
      if (q && !initialQueryProcessed.current) {
        initialQueryProcessed.current = true;
        await startTopic(q);
        // Clean the URL
        router.replace('/explore');
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="w-screen h-screen relative overflow-hidden bg-[#08090e]">
      {userId && (
        <>
          <div className="absolute inset-0">
            <Scene />
          </div>
          <Breadcrumb />
          <PromptInput />
          <TopBar />
          <Sidebar />
        </>
      )}

      {loading && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 px-5 py-3 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-full text-sm text-slate-300 flex items-center gap-3">
          <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse"></div>
          {loadingMessage || 'Loading...'}
        </div>
      )}

      {userId && useGraphStore.getState().rootNodes.length === 0 && !loading && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center pointer-events-auto">
            <div className="text-slate-500 text-sm uppercase tracking-widest mb-3">
              Empty Graph
            </div>
            <div className="text-slate-300 text-xl font-light">
              Add a topic in the top right to begin exploring.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreContent />
    </Suspense>
  );
}
