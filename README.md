# Graphmind

A 3D fractal knowledge explorer. Type a topic and explore it as a navigable 3D graph of Wikipedia concepts, with Claude-generated summaries and per-node chat.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- React Three Fiber + drei (3D scene)
- Supabase (auth + Postgres with RLS)
- Anthropic Claude (`claude-sonnet-4-20250514`) for summaries + chat
- Wikipedia REST + MediaWiki Action API for topic data

## Setup

1. Install deps:
   ```
   npm install
   ```
2. Create a Supabase project and run `supabase/migrations/001_initial.sql` in the SQL editor.
3. Copy env vars:
   ```
   cp .env.local.example .env.local
   ```
   Fill in `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
4. (Optional) Enable Google OAuth in Supabase → Authentication → Providers. Set the redirect URL to `https://<your-domain>/auth/callback`.
5. Run:
   ```
   npm run dev
   ```

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Add the env vars in Project Settings → Environment Variables.
4. Deploy. That's it — it's a website now.

## How it works

- User types `I want to learn X` → Wikipedia search finds the best-matching article and creates a root node.
- Clicking a node fetches its internal wiki links (top 6), creates child nodes, and pulls a Claude-summarized extract for the sidebar.
- Graph shows one level at a time. Breadcrumb lets you jump back. State persists per-user in Supabase with RLS.
