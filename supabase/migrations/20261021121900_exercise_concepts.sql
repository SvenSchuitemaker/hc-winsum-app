-- Private review queue. Nothing in this table is published automatically.
create table if not exists public.exercise_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ready' check (status in ('ready','approved','rejected','failed')),
  title text not null,
  category_slug text not null,
  source_image_url text,
  board_layout jsonb not null,
  subtitle text,
  explanation text,
  instructions text,
  simplify text,
  build_up text,
  difficulty text not null default 'Gemiddeld',
  audience text[] not null default '{}',
  published_exercise_id bigint,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists exercise_concepts_user_created_idx on public.exercise_concepts(user_id, created_at desc);
alter table public.exercise_concepts enable row level security;
create policy "Own exercise concepts read" on public.exercise_concepts for select to authenticated using (auth.uid() = user_id);
create policy "Own exercise concepts create" on public.exercise_concepts for insert to authenticated with check (auth.uid() = user_id and status = 'ready');
create policy "Own exercise concepts update" on public.exercise_concepts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
