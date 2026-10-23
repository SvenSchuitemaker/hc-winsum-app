-- Head-trainer comments on a scheduled training.
create table if not exists public.training_feedback (
  id uuid primary key default gen_random_uuid(),
  training_id bigint not null references public.trainings(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists training_feedback_training_created_idx
  on public.training_feedback (training_id, created_at desc);
alter table public.training_feedback enable row level security;
grant select, insert, delete on public.training_feedback to authenticated;
create policy "Team trainers read training feedback"
on public.training_feedback for select to authenticated using (
  exists (select 1 from public.trainings t where t.id = training_id
    and (t.user_id = (select auth.uid()) or public.is_super_admin()
      or public.is_head_trainer_of_team(t.team_id) or public.is_trainer_of_team(t.team_id)))
);
create policy "Head trainers comment on their team trainings"
on public.training_feedback for insert to authenticated with check (
  author_user_id = (select auth.uid())
  and exists (select 1 from public.trainings t where t.id = training_id
    and (public.is_super_admin() or public.is_head_trainer_of_team(t.team_id)))
);
create policy "Authors remove own training feedback"
on public.training_feedback for delete to authenticated using (
  author_user_id = (select auth.uid())
  and exists (select 1 from public.trainings t where t.id = training_id
    and (public.is_super_admin() or public.is_head_trainer_of_team(t.team_id)))
);
-- A pause is an explicit block; it cannot accidentally reference an exercise.
alter table public.training_blocks add column if not exists is_break boolean not null default false;
alter table public.training_blocks add constraint training_break_no_exercise
  check (not is_break or (exercise_id is null and concept_id is null));
