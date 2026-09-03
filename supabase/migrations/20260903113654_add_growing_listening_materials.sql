-- Public listening audio for stable links pasted into Classcard materials.
-- Metadata remains owner-private; only the unguessable audio URL is public.

create table public.growing_listening_materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growing_listening_materials_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint growing_listening_materials_description_check
    check (char_length(description) <= 1000),
  constraint growing_listening_materials_storage_path_check
    check (split_part(storage_path, '/', 1) = owner_id::text),
  constraint growing_listening_materials_mime_type_check
    check (mime_type in ('audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac')),
  constraint growing_listening_materials_file_size_check
    check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  constraint growing_listening_materials_owner_path_key unique (owner_id, storage_path)
);

comment on table public.growing_listening_materials is
  'Owner-private metadata for public listening audio links used in external learning materials.';

create index growing_listening_materials_owner_created_idx
  on public.growing_listening_materials (owner_id, created_at desc);

create or replace function public.set_growing_listening_material_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.set_growing_listening_material_updated_at()
  from public, anon, authenticated;

create trigger growing_listening_materials_set_updated_at
before update on public.growing_listening_materials
for each row execute function public.set_growing_listening_material_updated_at();

alter table public.growing_listening_materials enable row level security;

revoke all on table public.growing_listening_materials from public, anon, authenticated;
grant select, delete on table public.growing_listening_materials to authenticated;
grant insert (owner_id, title, description, storage_path, original_file_name, mime_type, file_size_bytes)
  on table public.growing_listening_materials to authenticated;
grant update (title, description)
  on table public.growing_listening_materials to authenticated;

create policy growing_listening_materials_owner_select
  on public.growing_listening_materials
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy growing_listening_materials_owner_insert
  on public.growing_listening_materials
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy growing_listening_materials_owner_update
  on public.growing_listening_materials
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy growing_listening_materials_owner_delete
  on public.growing_listening_materials
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'growing-listening-audio',
  'growing-listening-audio',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/aac']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy growing_listening_audio_owner_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'growing-listening-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy growing_listening_audio_owner_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'growing-listening-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and lower(storage.extension(name)) in ('mp3', 'm4a', 'wav', 'ogg', 'webm', 'aac')
  );

create policy growing_listening_audio_owner_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'growing-listening-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

notify pgrst, 'reload schema';
