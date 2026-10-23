-- Unapproved trainer exercises stay in the private concept queue.
-- Only the author and the review team can read concept metadata/drawings.
alter table public.training_blocks
  add column if not exists concept_id uuid references public.exercise_concepts(id) on delete set null;

create index if not exists training_blocks_concept_id_idx on public.training_blocks(concept_id);

alter table public.training_blocks
  add constraint training_block_one_exercise_source
  check (concept_id is null or exercise_id is null);

create policy "Review team reads pending exercises"
on public.exercise_concepts for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('head_trainer', 'super_admin')
  )
);

create policy "Review team updates pending exercises"
on public.exercise_concepts for update to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('head_trainer', 'super_admin')
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('head_trainer', 'super_admin')
  )
);

-- The original author may edit the drawing but cannot approve or publish it.
-- Reviewers may approve it; a published row must exist first.
create or replace function public.protect_exercise_concept_review()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare is_reviewer boolean;
begin
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('head_trainer','super_admin')
  ) into is_reviewer;
  if new.user_id is distinct from old.user_id or new.id is distinct from old.id
     or new.created_at is distinct from old.created_at then
    raise exception 'Concept ownership cannot be changed';
  end if;
  if not is_reviewer then
    if old.user_id is distinct from auth.uid() or old.status <> 'ready'
       or new.status <> 'ready'
       or new.published_exercise_id is distinct from old.published_exercise_id
       or new.reviewed_at is distinct from old.reviewed_at then
      raise exception 'Only a reviewer can approve or reject concepts';
    end if;
  elsif old.status <> 'ready' and new.status is distinct from old.status then
    raise exception 'Reviewed concepts cannot change status';
  end if;
  if new.status = 'approved' and (new.published_exercise_id is null
     or not exists(select 1 from public.exercises e where e.id = new.published_exercise_id)) then
    raise exception 'Approved concepts require an existing published exercise';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_exercise_concept_review() from public, anon, authenticated;
drop trigger if exists protect_exercise_concept_review on public.exercise_concepts;
create trigger protect_exercise_concept_review
before update on public.exercise_concepts
for each row execute function public.protect_exercise_concept_review();

-- Prevent a user from attaching another trainer's private drawing to a training.
create or replace function public.validate_private_training_exercise()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.concept_id is not null and not exists (
    select 1 from public.exercise_concepts c
    where c.id = new.concept_id and c.user_id = auth.uid() and c.status = 'ready'
  ) then
    raise exception 'Only your own pending exercise may be used in a training';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_private_training_exercise() from public, anon, authenticated;
drop trigger if exists validate_private_training_exercise on public.training_blocks;
create trigger validate_private_training_exercise
before insert or update of concept_id on public.training_blocks
for each row execute function public.validate_private_training_exercise();

-- Approval automatically upgrades existing training blocks to the public exercise.
create or replace function public.publish_concept_training_blocks()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    update public.training_blocks
      set exercise_id = new.published_exercise_id, concept_id = null
    where concept_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.publish_concept_training_blocks() from public, anon, authenticated;
drop trigger if exists publish_concept_training_blocks on public.exercise_concepts;
create trigger publish_concept_training_blocks
after update of status on public.exercise_concepts
for each row execute function public.publish_concept_training_blocks();

-- Reviewer-only publication. Do not grant head trainers unrestricted write
-- access to the public exercises table.
create or replace function public.approve_trainer_exercise(
  p_concept_id uuid,
  p_image_url text
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  draft public.exercise_concepts%rowtype;
  new_exercise_id bigint;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid()
    and p.role in ('head_trainer','super_admin')
  ) then
    raise exception 'Only club reviewers can approve exercises';
  end if;
  if p_image_url is null or p_image_url not like
      'https://shllbltitjogepjeyxdr.supabase.co/storage/v1/object/public/exercise-previews/%'
  then
    raise exception 'A saved board preview is required';
  end if;
  select * into draft from public.exercise_concepts
  where id = p_concept_id and status = 'ready' for update;
  if not found then
    raise exception 'Concept is missing or already reviewed';
  end if;
  if jsonb_array_length(coalesce(draft.board_layout->'items','[]'::jsonb)) = 0 then
    raise exception 'An empty drawing cannot be published';
  end if;

  insert into public.exercises (
    title, category_slug, image_url, subtitle, explanation, instructions,
    simplify, build_up, difficulty, audience, board_layout
  ) values (
    draft.title, draft.category_slug, p_image_url, draft.subtitle,
    draft.explanation, draft.instructions, draft.simplify,
    draft.build_up, draft.difficulty, draft.audience,
    draft.board_layout - 'backgroundImageUrl'
  ) returning id into new_exercise_id;

  update public.exercise_concepts
  set status='approved', published_exercise_id=new_exercise_id, reviewed_at=now()
  where id=p_concept_id;

  return new_exercise_id;
end;
$$;
revoke all on function public.approve_trainer_exercise(uuid,text) from public, anon;
grant execute on function public.approve_trainer_exercise(uuid,text) to authenticated;
