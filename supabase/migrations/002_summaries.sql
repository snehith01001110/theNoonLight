-- Shared summaries cache — keyed by canonical wiki_title.
-- Publicly readable so all users benefit from each other's computed summaries.
-- Insert/update only by authenticated users.

create table if not exists public.summaries (
  wiki_title text primary key,
  summary text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_summaries_created on public.summaries(created_at);

alter table public.summaries enable row level security;

drop policy if exists "Anyone can read summaries" on public.summaries;
create policy "Anyone can read summaries"
  on public.summaries for select
  using (true);

drop policy if exists "Authenticated can insert summaries" on public.summaries;
create policy "Authenticated can insert summaries"
  on public.summaries for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated can update summaries" on public.summaries;
create policy "Authenticated can update summaries"
  on public.summaries for update
  to authenticated
  using (true);
