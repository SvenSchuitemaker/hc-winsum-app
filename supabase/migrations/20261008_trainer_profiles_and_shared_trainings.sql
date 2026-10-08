alter table public.profiles
  add column if not exists phone text,
  add column if not exists specialty text,
  add column if not exists age_groups text[] not null default '{}'::text[],
  add column if not exists bio text;

alter table public.trainings
  add column if not exists share_token uuid;

update public.trainings
set share_token = gen_random_uuid()
where share_token is null;

alter table public.trainings
  alter column share_token set default gen_random_uuid();

alter table public.trainings
  alter column share_token set not null;

create unique index if not exists trainings_share_token_key
  on public.trainings (share_token);

create or replace function public.get_shared_training(p_share_token uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', t.id,
    'title', t.title,
    'training_date', t.training_date,
    'team', case
      when tm.id is null then null
      else jsonb_build_object('id', tm.id, 'name', tm.name)
    end,
    'blocks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', b.id,
          'position', b.position,
          'title', b.title,
          'duration', b.duration,
          'notes', b.notes,
          'exercise', case
            when e.id is null then null
            else jsonb_build_object(
              'id', e.id,
              'title', e.title,
              'image_url', e.image_url,
              'subtitle', e.subtitle,
              'difficulty', e.difficulty,
              'audience', e.audience
            )
          end
        )
        order by b.position
      )
      from public.training_blocks b
      left join public.exercises e on e.id = b.exercise_id
      where b.training_id = t.id
    ), '[]'::jsonb)
  )
  from public.trainings t
  left join public.teams tm on tm.id = t.team_id
  where t.share_token = p_share_token;
$$;

revoke all on function public.get_shared_training(uuid) from public;
grant execute on function public.get_shared_training(uuid) to anon, authenticated;
