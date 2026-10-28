-- Extend the existing notifications inbox to accept timer alarms.
alter table public.app_notifications drop constraint if exists app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check
  check (kind in ('reminder_24h','reminder_1h','evaluation','concept','live_timer'));

-- One pending alarm per running live-training interval, owned by its trainer.
create table if not exists public.live_training_timer_alarms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_id bigint not null,
  due_at timestamptz not null,
  fired_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists live_training_timer_alarms_due_idx
  on public.live_training_timer_alarms(due_at) where fired_at is null;
create index if not exists live_training_timer_alarms_user_idx
  on public.live_training_timer_alarms(user_id);
alter table public.live_training_timer_alarms enable row level security;
drop policy if exists "Trainers view own timer alarms" on public.live_training_timer_alarms;
create policy "Trainers view own timer alarms"
  on public.live_training_timer_alarms for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Trainers schedule own timer alarms" on public.live_training_timer_alarms;
create policy "Trainers schedule own timer alarms"
  on public.live_training_timer_alarms for insert to authenticated
  with check (user_id = (select auth.uid()) and due_at > now()
    and due_at < now() + interval '24 hours' and fired_at is null);
drop policy if exists "Trainers cancel own timer alarms" on public.live_training_timer_alarms;
create policy "Trainers cancel own timer alarms"
  on public.live_training_timer_alarms for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, insert, delete on public.live_training_timer_alarms to authenticated;
revoke all on public.live_training_timer_alarms from anon;

-- Cron is the only invoker; clients cannot enqueue push notifications themselves.
create or replace function public.enqueue_live_timer_alarms()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  with due as (
    update public.live_training_timer_alarms
       set fired_at = now()
     where id in (
       select id from public.live_training_timer_alarms
       where fired_at is null and due_at <= now()
       order by due_at
       limit 100
       for update skip locked
     )
     returning id, user_id, training_id
  ), inserted as (
    insert into public.app_notifications
      (user_id, kind, event_key, title, body, target_path)
    select user_id, 'live_timer', 'live_timer:' || id::text,
           '⏰ Tijd is om!',
           'De tijd voor deze oefening is afgelopen. Open de training om het alarm uit te zetten.',
           '/training-live/' || training_id::text
    from due
    on conflict (user_id,event_key) do nothing
    returning id
  )
  select count(*) into inserted_count from inserted;
  return inserted_count;
end;
$$;
revoke all on function public.enqueue_live_timer_alarms() from public, anon, authenticated;

-- The existing dispatch-push Edge Function sends notifications.
-- Only invoke it if there are due timer alarms, limiting unnecessary network calls.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'hockeyapp-live-timer-push',
  '10 seconds',
  $job$
    select case when public.enqueue_live_timer_alarms() > 0
      then net.http_post(
        url := 'https://shllbltitjogepjeyxdr.supabase.co/functions/v1/dispatch-push',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'X-Dispatcher-Secret',
          (select dispatcher_secret from public.app_push_server_config where id=1)
        ),
        body := '{}'::jsonb
      ) end;
  $job$
);
