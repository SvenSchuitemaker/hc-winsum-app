-- Explicitly exclude unauthenticated access to head-trainer feedback.
revoke all on public.training_feedback from public, anon;
grant select, insert, delete on public.training_feedback to authenticated;
