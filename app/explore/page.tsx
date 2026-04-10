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
import SidebarReopenButton from '@/components/SidebarReopenButton';

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
  const errorMessage = useGraphStore((s) => s.errorMessage);
  const clearError = useGraphStore((s) => s.clearError);
  const userId = useGraphStore((s) => s.userId);
  const initialQueryProcessed = useRef(false);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!errorMessage) return;
    const t = setTimeout(clearError, 5000);
    return () => clearTimeout(t);
  }, [errorMessage, clearError]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        // Preserve pending query through the auth redirect
        const pendingQ = searchParams.get('q');
        if (pendingQ) sessionStorage.setItem('pendingQuery', pendingQ);
        router.replace('/auth/login');
        return;
      }
      setUserId(user.id);
      await loadInitial();

      // Check URL param first, then fall back to sessionStorage
      const q = searchParams.get('q') || sessionStorage.getItem('pendingQuery');
      if (q && !initialQueryProcessed.current) {
        initialQueryProcessed.current = true;
        sessionStorage.removeItem('pendingQuery');
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
          <SidebarReopenButton />
        </>
      )}

      {loading && (
        <div className="fixed bottom-16 md:bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 px-4 md:px-5 py-3 bg-slate-900/90 backdrop-blur border border-slate-800 rounded-full text-sm text-slate-300 flex items-center justify-center gap-3">
          <div className="w-2 h-2 bg-sky-400 rounded-full animate-pulse"></div>
          {loadingMessage || 'Loading...'}
        </div>
      )}

      {errorMessage && !loading && (
        <div className="fixed bottom-16 md:bottom-6 left-4 right-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 px-4 md:px-5 py-3 bg-rose-950/90 backdrop-blur border border-rose-800/60 rounded-full text-sm text-rose-200 flex items-center justify-center gap-3">
          <span>{errorMessage}</span>
          <button onClick={clearError} className="text-rose-400 hover:text-rose-300 ml-1">✕</button>
        </div>
      )}

      {userId && useGraphStore.getState().rootNodes.length === 0 && !loading && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="text-center pointer-events-auto px-6">
            <div className="text-slate-500 text-sm uppercase tracking-widest mb-3">
              Empty Graph
            </div>
            <div className="text-slate-300 text-lg md:text-xl font-light">
              Add a topic above to begin exploring.
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
