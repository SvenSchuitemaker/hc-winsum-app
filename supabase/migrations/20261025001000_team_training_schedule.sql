-- Vaste trainingstijden per team; hoofdtrainers beheren het rooster.
create table if not exists public.team_training_schedule (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time without time zone not null,
  unique (team_id, weekday, start_time)
);
create index if not exists team_training_schedule_day_idx on public.team_training_schedule(weekday, team_id);
alter table public.team_training_schedule enable row level security;
grant select, insert, update, delete on public.team_training_schedule to authenticated;

create policy "Club members read team schedules" on public.team_training_schedule
  for select to authenticated using (
    exists (select 1 from public.teams t join public.profiles p on p.club_id = t.club_id
      where t.id = team_id and p.id = (select auth.uid()))
  );
create policy "Head trainers add team schedules" on public.team_training_schedule
  for insert to authenticated with check (
    exists (select 1 from public.teams t join public.profiles p on p.club_id = t.club_id
      where t.id = team_id and p.id = (select auth.uid()) and p.role in ('head_trainer','super_admin'))
  );
create policy "Head trainers update team schedules" on public.team_training_schedule
  for update to authenticated using (
    exists (select 1 from public.teams t join public.profiles p on p.club_id = t.club_id
      where t.id = team_id and p.id = (select auth.uid()) and p.role in ('head_trainer','super_admin'))
  ) with check (
    exists (select 1 from public.teams t join public.profiles p on p.club_id = t.club_id
      where t.id = team_id and p.id = (select auth.uid()) and p.role in ('head_trainer','super_admin'))
  );
create policy "Head trainers remove team schedules" on public.team_training_schedule
  for delete to authenticated using (
    exists (select 1 from public.teams t join public.profiles p on p.club_id = t.club_id
      where t.id = team_id and p.id = (select auth.uid()) and p.role in ('head_trainer','super_admin'))
  );

-- Ook wanneer nog geen concept bestaat moet een trainer een herinnering krijgen.
-- Zodra een voorbereide training op de juiste datum aanwezig is, vervalt de herinnering.
create or replace function public.enqueue_training_reminders()
returns void language sql security definer set search_path = public, pg_temp as $$
  with training_days as (
    select (now() at time zone 'Europe/Amsterdam')::date + offset_days as training_date
    from generate_series(0, 2) as offset_days
  ), upcoming as (
    select s.id as schedule_id, s.team_id, td.training_date, tt.user_id, tm.name as team_name,
      tm.club_id, ((td.training_date + s.start_time) at time zone 'Europe/Amsterdam') as start_at
    from public.team_training_schedule s
    join public.teams tm on tm.id = s.team_id
    join public.team_trainers tt on tt.team_id = s.team_id
    cross join training_days td
    where s.weekday = extract(dow from td.training_date)::smallint
      and not exists (
        select 1 from public.trainings t
        where t.team_id = s.team_id and t.training_date = td.training_date and t.is_prepared = true
      )
  ), due as (
    select *, 'reminder_24h'::text as kind, start_at - interval '24 hours' as due_at from upcoming
    union all
    select *, 'reminder_1h'::text as kind, start_at - interval '1 hour' as due_at from upcoming
  )
  insert into public.app_notifications(user_id, club_id, kind, event_key, title, body, target_path)
  select d.user_id, d.club_id, d.kind,
    d.kind || ':schedule:' || d.schedule_id::text || ':' || d.training_date::text,
    case when d.kind = 'reminder_24h' then 'Je training is morgen' else 'Je training begint over een uur' end,
    'De training van ' || d.team_name || ' staat nog niet klaar. Maak de training aan.',
    '/training-nieuw'
  from due d
  where d.due_at <= now() and d.due_at > now() - interval '3 minutes'
  on conflict (user_id,event_key) do nothing;
$$;
revoke all on function public.enqueue_training_reminders() from public, anon, authenticated;
