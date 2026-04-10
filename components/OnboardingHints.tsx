'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'graphmind_onboarded';

const HINTS = [
  {
    title: 'Click any node to dive in',
    description: 'Each sphere is a subtopic. Click to explore it and see its own knowledge tree.',
    position: 'center' as const,
  },
  {
    title: 'Read & chat in the sidebar',
    description: 'Every topic gets an AI-generated summary. Ask follow-up questions to learn more.',
    position: 'right' as const,
  },
  {
    title: 'Navigate with breadcrumbs',
    description: 'Use the trail at the top-left to jump back to any level you\'ve visited.',
    position: 'top-left' as const,
  },
];

export default function OnboardingHints() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const seen = localStorage.getItem(STORAGE_KEY);
    if (!seen) {
      // Small delay so the graph has time to render
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  function handleNext() {
    if (step < HINTS.length - 1) {
      setStep(step + 1);
    } else {
      dismiss();
    }
  }

  function dismiss() {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, '1');
  }

  if (!visible) return null;

  const hint = HINTS[step];

  const positionClasses = {
    'center': 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
    'right': 'top-1/2 right-8 -translate-y-1/2',
    'top-left': 'top-16 left-4',
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300"
        onClick={dismiss}
      />

      {/* Hint card */}
      <div
        className={`fixed z-50 ${positionClasses[hint.position]} max-w-sm w-[calc(100vw-3rem)] animate-fade-in`}
      >
        <div className="bg-[#0f1219] border border-slate-700/60 rounded-xl p-5 shadow-2xl shadow-black/40">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mb-3">
            {HINTS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === step ? 'w-6 bg-sky-400' : 'w-1.5 bg-slate-700'
                }`}
              />
            ))}
          </div>

          <h3 className="text-slate-100 text-base font-medium mb-1.5">
            {hint.title}
          </h3>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            {hint.description}
          </p>

          <div className="flex items-center justify-between">
            <button
              onClick={dismiss}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Skip tour
            </button>
            <button
              onClick={handleNext}
              className="px-4 py-1.5 rounded-lg text-sm font-medium bg-sky-500/15 border border-sky-500/30 text-sky-300 hover:bg-sky-500/25 transition-all"
            >
              {step < HINTS.length - 1 ? 'Next' : 'Got it'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
