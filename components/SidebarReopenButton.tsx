'use client';

import { useGraphStore } from '@/lib/store';

export default function SidebarReopenButton() {
  const currentParent = useGraphStore((s) => s.currentParent);
  const sidebarOpen = useGraphStore((s) => s.sidebarOpen);
  const setSidebarOpen = useGraphStore((s) => s.setSidebarOpen);

  // Only show when there's a current parent and the sidebar is closed
  if (!currentParent || sidebarOpen) return null;

  return (
    <button
      onClick={() => setSidebarOpen(true)}
      className="fixed bottom-4 right-4 md:top-4 md:right-4 md:bottom-auto z-20 flex items-center gap-2 px-3 py-2 bg-slate-900/80 backdrop-blur-md border border-slate-700 rounded-full text-sm text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 transition-all shadow-lg"
      aria-label={`View summary for ${currentParent.label}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="max-w-[140px] truncate">{currentParent.label}</span>
    </button>
  );
}
