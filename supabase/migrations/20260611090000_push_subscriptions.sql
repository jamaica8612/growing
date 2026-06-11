create table if not exists growing_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, endpoint)
);

alter table growing_push_subscriptions enable row level security;

create policy "owners manage own subscriptions"
  on growing_push_subscriptions
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);
