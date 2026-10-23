-- Expose full exercise details only for exercises in a token-linked training.
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
              'audience', e.audience,
              'explanation', e.explanation,
              'instructions', e.instructions,
              'simplify', e.simplify,
              'build_up', e.build_up
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
