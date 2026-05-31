alter table public.growing_classes
  add column if not exists tuition_overrides jsonb not null default '{}'::jsonb;
