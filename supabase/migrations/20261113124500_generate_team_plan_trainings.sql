create policy "Super admins read team schedules" on public.team_training_schedule
  for select to authenticated using ((select public.is_super_admin()));

create function public.save_team_training_plan(
  p_team_id bigint,
  p_plan_id bigint,
  p_starts_on date,
  p_months smallint,
  p_phases jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  plan public.team_training_plans%rowtype;
  period_end date;
  required_weeks integer;
  created_ids bigint[];
  created_count integer;
  skipped_count integer;
  minutes_per_exercise constant integer := 10;
begin
  if caller_id is null or not (
    coalesce(public.is_super_admin(), false)
    or coalesce(public.is_head_trainer_of_team(p_team_id), false)
  ) then
    raise exception 'Je mag geen trainingsplan voor dit team opslaan.' using errcode = '42501';
  end if;

  -- Serialize plan saves for the same team so two requests cannot fill the same slots.
  perform pg_advisory_xact_lock(hashtextextended('team_training_plan:' || p_team_id, 0));

  if p_starts_on is null or p_starts_on not between date '0001-01-01' and date '9999-06-30'
    or p_months is null or p_months not in (3, 6) or p_phases is null then
    raise exception 'Kies een geldige startdatum en periode.';
  end if;
  period_end := (p_starts_on + make_interval(months => p_months))::date;
  required_weeks := (period_end - p_starts_on + 6) / 7;

  if not public.team_training_plan_phases_fit(p_phases, period_end - p_starts_on) then
    raise exception 'Controleer de trainingsdoelen en het aantal weken.';
  end if;
  if (select sum((phase->>'weeks')::integer) from jsonb_array_elements(p_phases) as phases(phase)) <> required_weeks then
    raise exception 'Verdeel alle % weken van het plan over de trainingsdoelen.', required_weeks;
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_phases) as phases(phase)
    where jsonb_array_length(phase->'exerciseIds') = 0
  ) then
    raise exception 'Kies bij elk trainingsdoel minstens één oefening.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_phases) as phases(phase)
    cross join lateral jsonb_array_elements_text(phase->'exerciseIds') as ids(id)
    left join public.exercises e on e.id = ids.id::bigint
    where e.id is null
  ) then
    raise exception 'Een gekozen oefening is niet meer beschikbaar. Pas de selectie aan.';
  end if;
  if not exists (select 1 from public.team_training_schedule where team_id = p_team_id) then
    raise exception 'Stel eerst vaste trainingstijden in via Weekoverzicht.';
  end if;

  if p_plan_id is not null then
    update public.team_training_plans
    set starts_on = p_starts_on, months = p_months, phases = p_phases
    where id = p_plan_id and team_id = p_team_id
    returning * into plan;
    if not found then
      raise exception 'Dit trainingsplan is niet meer beschikbaar.';
    end if;
  else
    -- An identical create request can be retried after a lost response.
    select * into plan from public.team_training_plans
    where team_id = p_team_id and starts_on = p_starts_on and months = p_months and phases = p_phases
    order by id limit 1;
    if not found then
      insert into public.team_training_plans (team_id, starts_on, months, phases)
      values (p_team_id, p_starts_on, p_months, p_phases)
      returning * into plan;
    end if;
  end if;

  with phases as (
    select phase, ordinality as phase_no,
      sum((phase->>'weeks')::integer) over (order by ordinality) as end_week
    from jsonb_array_elements(p_phases) with ordinality as goals(phase, ordinality)
  ), slots as (
    select p_starts_on + days.offset_days as session_date, schedule.start_time,
      phases.phase_no, phases.phase->>'goal' as goal
    from generate_series(0, period_end - p_starts_on - 1) as days(offset_days)
    join public.team_training_schedule schedule
      on schedule.team_id = p_team_id
      and schedule.weekday = extract(dow from p_starts_on + days.offset_days)
    join phases on days.offset_days / 7 >= phases.end_week - (phases.phase->>'weeks')::integer
      and days.offset_days / 7 < phases.end_week
  ), phase_exercises as (
    select phases.phase_no, array_agg(exercise_id order by first_position) as exercise_ids
    from phases
    cross join lateral (
      select id::bigint as exercise_id, min(ordinality) as first_position
      from jsonb_array_elements_text(phase->'exerciseIds') with ordinality as ids(id, ordinality)
      group by id::bigint
    ) as chosen
    group by phases.phase_no
  ), added_trainings as (
    insert into public.trainings (
      user_id, team_id, title, training_date, start_time, is_prepared,
      warmup_exercise_id, warmup_duration, main_exercise_id, main_duration, match_exercise_id, match_duration
    )
    select caller_id, p_team_id, slots.goal, slots.session_date, slots.start_time, true,
      exercise_ids[1], minutes_per_exercise,
      exercise_ids[2], case when cardinality(exercise_ids) >= 2 then minutes_per_exercise else 0 end,
      exercise_ids[3], case when cardinality(exercise_ids) >= 3 then minutes_per_exercise else 0 end
    from slots join phase_exercises using (phase_no)
    where not exists (
      select 1 from public.trainings t
      where t.team_id = p_team_id and t.training_date = slots.session_date
        and (t.start_time is null or t.start_time = slots.start_time)
    )
    returning id, training_date, start_time
  )
  select coalesce(array_agg(id), array[]::bigint[]),
         (select count(*) from slots) - count(*)
  into created_ids, skipped_count
  from added_trainings;

  -- The block insert policy must be able to read the new training rows.
  with phases as (
    select phase, sum((phase->>'weeks')::integer) over (order by ordinality) as end_week
    from jsonb_array_elements(p_phases) with ordinality as goals(phase, ordinality)
  )
  insert into public.training_blocks (training_id, position, title, exercise_id, duration)
  select t.id, row_number() over (partition by t.id order by chosen.first_position), e.title, e.id, minutes_per_exercise
  from public.trainings t
  join phases on (t.training_date - p_starts_on) / 7 >= phases.end_week - (phases.phase->>'weeks')::integer
    and (t.training_date - p_starts_on) / 7 < phases.end_week
  cross join lateral (
    select id::bigint as exercise_id, min(ordinality) as first_position
    from jsonb_array_elements_text(phase->'exerciseIds') with ordinality as ids(id, ordinality)
    group by id::bigint
  ) as chosen
  join public.exercises e on e.id = chosen.exercise_id
  where t.id = any(created_ids);

  created_count := cardinality(created_ids);

  return jsonb_build_object('plan', to_jsonb(plan), 'created', created_count, 'skipped', skipped_count);
end;
$$;

revoke all on function public.save_team_training_plan(bigint, bigint, date, smallint, jsonb)
  from public, anon;
grant execute on function public.save_team_training_plan(bigint, bigint, date, smallint, jsonb)
  to authenticated;
