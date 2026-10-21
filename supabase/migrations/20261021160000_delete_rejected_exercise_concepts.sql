-- Permit owners to remove historical rejected concepts as well as new ready drafts.
drop policy if exists "Own exercise concepts delete" on public.exercise_concepts;
create policy "Own exercise concepts delete" on public.exercise_concepts
for delete to authenticated
using (auth.uid() = user_id and status in ('ready','rejected'));
