-- Growing English academy app: dedicated tables in public schema with the
-- same `prefix + owner-based RLS` isolation the other apps in this project use.
-- Additive only: does not touch existing tables.

-- 1. Students
create table if not exists public.growing_students (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  school text not null default '',
  grade text not null default '',
  contact text not null default '',
  parent_contact text not null default '',
  registration_date date,
  status text not null default 'active' check (status in ('active','inactive')),
  memo text not null default '',
  created_at timestamptz not null default now()
);

-- 2. Classes (student_ids kept as an array to mirror the current app shape)
create table if not exists public.growing_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  days text[] not null default '{}',
  start_time text not null default '',
  end_time text not null default '',
  tuition_fee integer not null default 0,
  student_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

-- 3. Attendance
create table if not exists public.growing_attendance (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.growing_students(id) on delete cascade,
  class_id uuid references public.growing_classes(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','late','makeup')),
  memo text not null default '',
  homework_status text not null default '',
  created_at timestamptz not null default now(),
  unique (owner_id, student_id, class_id, date)
);

-- 4. Payments
create table if not exists public.growing_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.growing_students(id) on delete cascade,
  billing_month text not null,
  amount integer not null default 0,
  payment_date date,
  payment_method text check (payment_method in ('card','cash','transfer','')),
  status text not null default 'unpaid' check (status in ('paid','unpaid')),
  created_at timestamptz not null default now()
);

-- 5. Counsel / progress / test logs
create table if not exists public.growing_counsel_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.growing_students(id) on delete cascade,
  date date not null,
  title text not null,
  content text not null default '',
  type text not null check (type in ('counsel','progress','test')),
  score text,
  created_at timestamptz not null default now()
);

-- 6. Kiosk check-in/out alerts awaiting send
create table if not exists public.growing_kiosk_alerts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid not null references public.growing_students(id) on delete cascade,
  kind text not null check (kind in ('in','out')),
  date date not null,
  time text not null,
  created_at timestamptz not null default now()
);

-- 7. Per-owner settings (kiosk PIN, etc.)
create table if not exists public.growing_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  kiosk_pin text not null default '1234',
  updated_at timestamptz not null default now()
);

-- Helpful indexes for owner-scoped lookups
create index if not exists growing_students_owner_idx on public.growing_students(owner_id);
create index if not exists growing_classes_owner_idx on public.growing_classes(owner_id);
create index if not exists growing_attendance_owner_idx on public.growing_attendance(owner_id);
create index if not exists growing_attendance_student_idx on public.growing_attendance(student_id);
create index if not exists growing_payments_owner_idx on public.growing_payments(owner_id);
create index if not exists growing_payments_student_idx on public.growing_payments(student_id);
create index if not exists growing_counsel_logs_owner_idx on public.growing_counsel_logs(owner_id);
create index if not exists growing_kiosk_alerts_owner_idx on public.growing_kiosk_alerts(owner_id);

-- Enable RLS and add owner-only policies on every table
do $$
declare
  t text;
begin
  foreach t in array array[
    'growing_students','growing_classes','growing_attendance',
    'growing_payments','growing_counsel_logs','growing_kiosk_alerts','growing_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t || '_owner_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());',
      t || '_owner_all', t
    );
  end loop;
end $$;
;
