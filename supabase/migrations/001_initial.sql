-- Graphmind initial schema

create table if not exists public.graph_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  wiki_title text not null,
  label text not null,
  summary text,
  parent_id uuid references public.graph_nodes(id) on delete cascade,
  position_x float default 0,
  position_y float default 0,
  position_z float default 0,
  is_root boolean default false,
  visited boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_graph_nodes_user on public.graph_nodes(user_id);
create index if not exists idx_graph_nodes_parent on public.graph_nodes(parent_id);

alter table public.graph_nodes enable row level security;

drop policy if exists "Users see own nodes" on public.graph_nodes;
create policy "Users see own nodes"
  on public.graph_nodes for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own nodes" on public.graph_nodes;
create policy "Users insert own nodes"
  on public.graph_nodes for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own nodes" on public.graph_nodes;
create policy "Users update own nodes"
  on public.graph_nodes for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own nodes" on public.graph_nodes;
create policy "Users delete own nodes"
  on public.graph_nodes for delete
  using (auth.uid() = user_id);
