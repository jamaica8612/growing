
-- Enable pgvector extension
create extension if not exists vector;

-- Add embedding column to growing_counsel_logs
alter table growing_counsel_logs
  add column if not exists embedding vector(768);

-- Add embedding column to growing_assistant_notes
alter table growing_assistant_notes
  add column if not exists embedding vector(768);

-- IVFFlat index for counsel logs (cosine distance)
create index if not exists growing_counsel_logs_embedding_idx
  on growing_counsel_logs
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

-- IVFFlat index for assistant notes (cosine distance)
create index if not exists growing_assistant_notes_embedding_idx
  on growing_assistant_notes
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 10);

-- RPC: search counsel logs by semantic similarity
create or replace function search_counsel_logs(
  query_embedding vector(768),
  match_count int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  student_id uuid,
  date text,
  title text,
  content text,
  type text,
  score text,
  similarity float
)
language sql stable
as $$
  select
    cl.id,
    cl.student_id,
    cl.date,
    cl.title,
    cl.content,
    cl.type,
    cl.score,
    1 - (cl.embedding <=> query_embedding) as similarity
  from growing_counsel_logs cl
  where cl.embedding is not null
    and 1 - (cl.embedding <=> query_embedding) >= similarity_threshold
  order by cl.embedding <=> query_embedding
  limit match_count;
$$;

-- RPC: search assistant notes by semantic similarity
create or replace function search_assistant_notes(
  query_embedding vector(768),
  match_count int default 5,
  similarity_threshold float default 0.3
)
returns table (
  id uuid,
  content text,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select
    n.id,
    n.content,
    n.created_at,
    1 - (n.embedding <=> query_embedding) as similarity
  from growing_assistant_notes n
  where n.embedding is not null
    and 1 - (n.embedding <=> query_embedding) >= similarity_threshold
  order by n.embedding <=> query_embedding
  limit match_count;
$$;
;
