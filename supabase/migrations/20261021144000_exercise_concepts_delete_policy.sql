-- Allow concept owners to permanently reject and remove their own drafts.
-- Without this policy, RLS makes client-side deletes silently affect zero rows.
create policy "Own exercise concepts delete"
on public.exercise_concepts
for delete to authenticated
using (auth.uid() = user_id and status = 'ready');
