create function public.team_training_plan_phases_fit(phases jsonb, days integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  phase jsonb;
  weeks integer := 0;
begin
  if jsonb_typeof(phases) <> 'array' then return false; end if;
  if jsonb_array_length(phases) not between 1 and 27 then return false; end if;
  for phase in select value from jsonb_array_elements(phases) loop
    if jsonb_typeof(phase->'goal') is distinct from 'string'
      or length(btrim(phase->>'goal')) not between 1 and 300
      or jsonb_typeof(phase->'weeks') is distinct from 'number'
      or (phase->>'weeks') !~ '^([1-9]|1[0-9]|2[0-7])$'
      or jsonb_typeof(phase->'exerciseIds') is distinct from 'array'
    then return false; end if;
    if jsonb_array_length(phase->'exerciseIds') > 50 or exists (
      select 1 from jsonb_array_elements(phase->'exerciseIds') e(value)
      where jsonb_typeof(e.value) <> 'number' or e.value::text !~ '^[1-9][0-9]{0,15}$'
    ) then return false; end if;
    weeks := weeks + (phase->>'weeks')::integer;
  end loop;
  return weeks <= (days + 6) / 7;
end;
$$;
revoke all on function public.team_training_plan_phases_fit(jsonb, integer) from public, anon;
grant execute on function public.team_training_plan_phases_fit(jsonb, integer) to authenticated;

create table public.team_training_plans (
  id bigint generated always as identity primary key,
  team_id bigint not null references public.teams(id) on delete cascade,
  starts_on date not null check (starts_on between date '0001-01-01' and date '9999-06-30'),
  months smallint not null check (months in (3, 6)),
  ends_before date generated always as ((starts_on + make_interval(months => months))::date) stored,
  phases jsonb not null,
  constraint team_training_plan_phases_fit check (
    public.team_training_plan_phases_fit(phases, (starts_on + make_interval(months => months))::date - starts_on)
  )
);

create index team_training_plans_team_start_idx on public.team_training_plans (team_id, starts_on);
alter table public.team_training_plans enable row level security;
revoke all on public.team_training_plans from anon, authenticated, public;
grant select, delete on public.team_training_plans to authenticated;
grant insert (team_id, starts_on, months, phases), update (starts_on, months, phases)
  on public.team_training_plans to authenticated;

create policy "Team staff read team training plans"
  on public.team_training_plans for select to authenticated using (
    (select public.is_super_admin())
    or public.is_head_trainer_of_team(team_id)
    or public.is_trainer_of_team(team_id)
  );

create policy "Head trainers manage team training plans"
  on public.team_training_plans for all to authenticated using (
    (select public.is_super_admin()) or public.is_head_trainer_of_team(team_id)
  ) with check (
    (select public.is_super_admin()) or public.is_head_trainer_of_team(team_id)
  );
