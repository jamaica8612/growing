-- 알림톡/문자/복사 발송 이력. 실제 외부 발송은 Edge Function에서 처리하고,
-- 앱은 owner_id 기준 RLS로 본인 학원 로그만 조회/생성한다.
create table if not exists growing_message_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  student_id uuid references growing_students(id) on delete set null,
  payment_id uuid references growing_payments(id) on delete set null,
  alert_type text not null check (
    alert_type in (
      'check_in',
      'check_out',
      'homework_done',
      'homework_incomplete',
      'homework_undone',
      'payment_request',
      'payment_paid',
      'custom'
    )
  ),
  channel text not null check (channel in ('alimtalk', 'sms', 'copy')),
  provider text,
  template_code text,
  recipient_phone text not null,
  recipient_name text,
  subject text,
  message text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  provider_message_id text,
  provider_response jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

alter table growing_message_logs enable row level security;

drop policy if exists "owner_select" on growing_message_logs;
create policy "owner_select" on growing_message_logs
  for select using (auth.uid() = owner_id);

drop policy if exists "owner_insert" on growing_message_logs;
create policy "owner_insert" on growing_message_logs
  for insert with check (auth.uid() = owner_id);

create index if not exists idx_growing_message_logs_owner_created
  on growing_message_logs (owner_id, created_at desc);

create index if not exists idx_growing_message_logs_student_created
  on growing_message_logs (student_id, created_at desc);

create index if not exists idx_growing_message_logs_status
  on growing_message_logs (owner_id, status, created_at desc);
