-- Use the correct author field for each trigger table. A changed evaluation
-- is saved and its notifications are committed in the same transaction.
create or replace function public.notify_head_trainers()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_club bigint; v_title text; v_kind text; v_key text; v_target text; v_author uuid;
begin
  if tg_table_name = 'exercise_concepts' then
    if new.status <> 'ready' or (tg_op='UPDATE' and old.status='ready') then return new; end if;
    v_author := new.user_id;
    select club_id into v_club from public.profiles where id = new.user_id;
    v_title := new.title;
    v_kind := 'concept';
    v_key := 'concept:' || new.id::text;
    v_target := '/dashboard';
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
    v_author := new.author_user_id;
    select t.title, coalesce(tm.club_id, owner.club_id) into v_title, v_club from public.trainings t
      left join public.teams tm on tm.id = t.team_id
      left join public.profiles owner on owner.id = t.user_id where t.id = new.training_id;
    v_kind := 'evaluation';
    v_key := 'evaluation:' || new.id::text || ':' || gen_random_uuid()::text;
    v_target := '/training/' || new.training_id::text;
  end if;
  if v_club is null then return new; end if;
  insert into public.app_notifications(user_id, club_id, kind, event_key, title, body, target_path)
  select p.id, v_club, v_kind, v_key,
    case when v_kind='concept' then 'Nieuwe conceptoefening' else 'Trainingsevaluatie ontvangen' end,
    case when v_kind='concept' then 'Er staat een nieuwe oefening klaar: ' || v_title
      else 'Een trainer heeft ' || coalesce(v_title,'een training') || ' geëvalueerd. De evaluatie staat klaar om te bekijken.' end,
    v_target
  from public.profiles p
  where p.club_id = v_club and p.role in ('head_trainer','super_admin') and p.id <> v_author
  on conflict (user_id,event_key) do nothing;
  return new;
end $$;
revoke all on function public.notify_head_trainers() from public, anon, authenticated;
