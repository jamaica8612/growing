create table if not exists public.rn_announcement_comments (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.rn_announcements(id) on delete cascade,
  content text not null check (char_length(content) > 0 and char_length(content) <= 300),
  created_by uuid not null references public.rn_profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists rn_ann_comments_ann_idx
  on public.rn_announcement_comments (announcement_id, created_at);

alter table public.rn_announcement_comments enable row level security;

create policy "rn_read_ann_comments_for_auth"
  on public.rn_announcement_comments for select
  using (auth.role() = 'authenticated');

create policy "rn_insert_own_ann_comment"
  on public.rn_announcement_comments for insert
  with check (auth.uid() = created_by);

create policy "rn_delete_ann_comment"
  on public.rn_announcement_comments for delete
  using (auth.uid() = created_by or public.rn_is_admin(auth.uid()));

alter publication supabase_realtime add table public.rn_announcement_comments;;
