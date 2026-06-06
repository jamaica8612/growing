create extension if not exists vector;

alter table public.growing_assistant_notes
  alter column owner_id set default auth.uid(),
  add column if not exists embedding vector(384),
  add column if not exists embedding_updated_at timestamptz;

create index if not exists growing_assistant_notes_embedding_hnsw_idx
  on public.growing_assistant_notes
  using hnsw (embedding vector_ip_ops)
  where embedding is not null;

create index if not exists growing_assistant_notes_owner_embedding_idx
  on public.growing_assistant_notes (owner_id, embedding_updated_at)
  where embedding is not null;

create or replace function public.growing_match_assistant_notes(
  query_embedding vector(384),
  match_count int default 8,
  match_threshold float default 0.72,
  target_student_id uuid default null
)
returns table (
  id uuid,
  scope text,
  student_id uuid,
  category text,
  content text,
  created_at timestamptz,
  similarity float
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    n.id,
    n.scope,
    n.student_id,
    n.category,
    n.content,
    n.created_at,
    (n.embedding <#> query_embedding) * -1 as similarity
  from public.growing_assistant_notes n
  where n.owner_id = auth.uid()
    and n.embedding is not null
    and (target_student_id is null or n.student_id = target_student_id)
    and ((n.embedding <#> query_embedding) * -1) >= match_threshold
  order by n.embedding <#> query_embedding
  limit greatest(1, least(match_count, 20));
$$;

revoke all on function public.growing_match_assistant_notes(vector, int, float, uuid) from public, anon;
grant execute on function public.growing_match_assistant_notes(vector, int, float, uuid) to authenticated;
