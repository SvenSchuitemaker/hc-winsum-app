-- Individuele trainingstijden, conceptplanning en vier soorten meldingen.
alter table public.trainings add column if not exists start_time time without time zone;
alter table public.trainings add column if not exists is_prepared boolean not null default true;
create index if not exists trainings_reminders_idx on public.trainings(training_date, start_time) where is_prepared = false;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id bigint references public.clubs(id) on delete cascade,
  kind text not null check (kind in ('reminder_24h','reminder_1h','evaluation','concept')),
  event_key text not null,
  title text not null,
  body text not null,
  target_path text not null default '/',
  read_at timestamptz,
  push_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);
create index if not exists app_notifications_unread_idx on public.app_notifications(user_id, created_at desc);
create index if not exists app_notifications_unsent_idx on public.app_notifications(created_at) where push_sent_at is null;
alter table public.app_notifications enable row level security;
grant select, update(read_at) on public.app_notifications to authenticated;
create policy "Users see only own notifications" on public.app_notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users mark own notifications read" on public.app_notifications
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.app_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now()
);
create index if not exists app_push_subscriptions_user_idx on public.app_push_subscriptions(user_id);
alter table public.app_push_subscriptions enable row level security;
grant select, insert, update, delete on public.app_push_subscriptions to authenticated;
create policy "Users read own push devices" on public.app_push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users register own push devices" on public.app_push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users update own push devices" on public.app_push_subscriptions
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users remove own push devices" on public.app_push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- Private service credentials are only ever read by the Edge Function's service role.
create table if not exists public.app_push_server_config (
  id int primary key check (id = 1),
  dispatcher_secret text not null,
  vapid_public text,
  vapid_private text
);
alter table public.app_push_server_config enable row level security;
revoke all on public.app_push_server_config from anon, authenticated, public;
grant select, insert, update on public.app_push_server_config to service_role;
insert into public.app_push_server_config(id, dispatcher_secret)
values (1, encode(gen_random_bytes(32), 'hex')) on conflict (id) do nothing;

-- Database-triggered notifications; not callable by clients.
create or replace function public.notify_head_trainers()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club bigint; v_title text; v_kind text; v_key text; v_target text; v_author uuid;
begin
  if tg_table_name = 'exercise_concepts' then
    if new.status <> 'ready' or (tg_op='UPDATE' and old.status='ready') then return new; end if;
    select club_id into v_club from public.profiles where id = new.user_id;
    v_title := new.title;
    v_kind := 'concept';
    v_key := 'concept:' || new.id::text;
    v_target := '/dashboard';
    v_author := new.user_id;
  elsif tg_table_name = 'training_notes' then
    if coalesce(btrim(new.what_went_well),'')='' and coalesce(btrim(new.what_to_improve),'')=''
       and coalesce(btrim(new.next_time_notes),'')='' and coalesce(btrim(new.attendance_note),'')='' then
      return new;
    end if;
    if tg_op = 'UPDATE' and
       row(new.what_went_well,new.what_to_improve,new.next_time_notes,new.attendance_note)
       is not distinct from
       row(old.what_went_well,old.what_to_improve,old.next_time_notes,old.attendance_note) then
      return new;
    end if;
    select t.title, tm.club_id into v_title, v_club from public.trainings t
      join public.teams tm on tm.id = t.team_id where t.id = new.training_id;
    v_kind := 'evaluation';
    v_key := 'evaluation:' || new.id::text || ':' || (extract(epoch from new.updated_at)::bigint)::text;
    v_target := '/training/' || new.training_id::text;
    v_author := new.author_user_id;
  end if;
  if v_club is null then return new; end if;
  insert into public.app_notifications(user_id, club_id, kind, event_key, title, body, target_path)
  select p.id, v_club, v_kind, v_key,
    case when v_kind='concept' then 'Nieuwe conceptoefening' else 'Trainingsevaluatie ontvangen' end,
    case when v_kind='concept' then 'Er staat een nieuwe oefening klaar: ' || v_title
      else 'Een trainer heeft ' || coalesce(v_title,'een training') || ' geëvalueerd.' end,
    v_target
  from public.profiles p
  where p.club_id = v_club and p.role in ('head_trainer','super_admin') and p.id <> v_author
  on conflict (user_id,event_key) do nothing;
  return new;
end $$;
revoke all on function public.notify_head_trainers() from public, anon, authenticated;
drop trigger if exists notify_concept_ready on public.exercise_concepts;
create trigger notify_concept_ready after insert or update on public.exercise_concepts
  for each row execute function public.notify_head_trainers();
drop trigger if exists notify_training_evaluation on public.training_notes;
create trigger notify_training_evaluation after insert or update on public.training_notes
  for each row execute function public.notify_head_trainers();

create or replace function public.enqueue_training_reminders()
returns void language sql security definer set search_path = public, pg_temp as $$
  with upcoming as (
    select t.id, t.title, t.user_id, tm.club_id,
      ((t.training_date + t.start_time) at time zone 'Europe/Amsterdam') as start_at
    from public.trainings t
    join public.teams tm on tm.id = t.team_id
    where t.is_prepared = false and t.training_date is not null and t.start_time is not null
      and t.training_date between (now() at time zone 'Europe/Amsterdam')::date
      and (now() at time zone 'Europe/Amsterdam')::date + 2
  ), due as (
    select *, 'reminder_24h'::text as kind, start_at - interval '24 hours' as due_at from upcoming
    union all
    select *, 'reminder_1h'::text as kind, start_at - interval '1 hour' as due_at from upcoming
  )
  insert into public.app_notifications(user_id, club_id, kind, event_key, title, body, target_path)
  select d.user_id,d.club_id,d.kind,
    d.kind || ':' || d.id::text || ':' || d.start_at::text,
    case when d.kind = 'reminder_24h' then 'Je training is morgen' else 'Je training begint over een uur' end,
    'Je training "' || d.title || '" staat nog niet klaar. Rond de voorbereiding af.',
    '/training-bewerk/' || d.id::text
  from due d
  where d.due_at <= now() and d.due_at > now() - interval '3 minutes'
  on conflict (user_id,event_key) do nothing;
$$;
revoke all on function public.enqueue_training_reminders() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$
begin
  if not exists(select 1 from cron.job where jobname='hockeyapp-notifications-minute') then
    perform cron.schedule('hockeyapp-notifications-minute','* * * * *',
      $job$
      select public.enqueue_training_reminders();
      select net.http_post(
        url:='https://shllbltitjogepjeyxdr.supabase.co/functions/v1/dispatch-push',
        headers:=jsonb_build_object('Content-Type','application/json',
          'X-Dispatcher-Secret',(select dispatcher_secret from public.app_push_server_config where id=1)),
        body:='{}'::jsonb
      );
      $job$);
  end if;
end $$;
