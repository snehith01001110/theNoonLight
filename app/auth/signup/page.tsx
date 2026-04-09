'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase-browser';

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') ?? '';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const redirectTarget = initialQuery
    ? `/explore?q=${encodeURIComponent(initialQuery)}`
    : '/explore';

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    const supabase = createClient();
    const origin = window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
          redirectTarget
        )}`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.push(redirectTarget);
    } else {
      setInfo('Check your email to confirm your account.');
    }
  }

  async function handleGoogle() {
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTarget)}`,
      },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#08090e] text-slate-200">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <div className="text-xs uppercase tracking-[0.35em] text-slate-500 mb-3">
            thenoonlight
          </div>
          <h1 className="text-3xl font-light">Create account</h1>
        </div>
        <form onSubmit={handleSignup} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password (6+ characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded px-4 py-3 text-slate-100 focus:outline-none focus:border-sky-500"
          />
          {error && <div className="text-rose-400 text-sm">{error}</div>}
          {info && <div className="text-emerald-400 text-sm">{info}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-sky-500/20 border border-sky-500/40 text-sky-300 rounded hover:bg-sky-500/30 disabled:opacity-40 uppercase tracking-widest text-sm"
          >
            {loading ? '...' : 'Sign up'}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-600 uppercase tracking-widest">
          <div className="flex-1 h-px bg-slate-800"></div>
          or
          <div className="flex-1 h-px bg-slate-800"></div>
        </div>

        <button
          onClick={handleGoogle}
          className="w-full py-3 bg-slate-900 border border-slate-800 text-slate-200 rounded hover:border-slate-700 uppercase tracking-widest text-sm"
        >
          Continue with Google
        </button>

        <div className="text-center mt-6 text-sm text-slate-500">
          Already have an account?{' '}
          <Link
            href={`/auth/login${initialQuery ? `?q=${encodeURIComponent(initialQuery)}` : ''}`}
            className="text-sky-400 hover:text-sky-300"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
