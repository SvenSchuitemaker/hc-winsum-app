-- Store trainer drawings as real PNGs without making unapproved exercises public.
alter table public.exercise_concepts
  add column if not exists preview_image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trainer-exercise-previews', 'trainer-exercise-previews', false, 5242880, array['image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/png'];

-- The path begins with the authenticated trainer's user id.
create policy "Trainer previews upload own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'trainer-exercise-previews'
  and split_part(name, '/', 1) = (select auth.uid())::text
);
create policy "Trainer previews update own"
on storage.objects for update to authenticated
using (
  bucket_id = 'trainer-exercise-previews'
  and split_part(name, '/', 1) = (select auth.uid())::text
)
with check (
  bucket_id = 'trainer-exercise-previews'
  and split_part(name, '/', 1) = (select auth.uid())::text
);
create policy "Trainer previews delete own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'trainer-exercise-previews'
  and split_part(name, '/', 1) = (select auth.uid())::text
);
create policy "Trainer previews read own or review"
on storage.objects for select to authenticated
using (
  bucket_id = 'trainer-exercise-previews'
  and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
      and p.role in ('head_trainer', 'super_admin')
    )
  )
);
