create or replace function public.growing_record_kiosk_event(
  p_student_id uuid,
  p_class_id uuid,
  p_date date,
  p_kind text,
  p_time text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid := auth.uid();
  v_attendance public.growing_attendance;
  v_alert public.growing_kiosk_alerts;
begin
  if v_owner_id is null then
    raise exception 'authentication_required';
  end if;
  if p_kind not in ('in', 'out') then
    raise exception 'invalid_kiosk_event_kind';
  end if;
  if p_class_id is null then
    raise exception 'class_required';
  end if;
  if not exists (
    select 1 from public.growing_students
    where id = p_student_id and owner_id = v_owner_id and status = 'active'
  ) then
    raise exception 'student_not_found';
  end if;
  if not exists (
    select 1 from public.growing_classes
    where id = p_class_id and owner_id = v_owner_id
  ) then
    raise exception 'class_not_found';
  end if;

  insert into public.growing_attendance (
    owner_id, student_id, class_id, date, status, memo,
    check_in_time, check_out_time
  )
  values (
    v_owner_id, p_student_id, p_class_id, p_date, 'present', '',
    case when p_kind = 'in' then p_time else null end,
    case when p_kind = 'out' then p_time else null end
  )
  on conflict (owner_id, student_id, class_id, date)
  do update set
    status = 'present',
    check_in_time = case when p_kind = 'in' then excluded.check_in_time else public.growing_attendance.check_in_time end,
    check_out_time = case when p_kind = 'out' then excluded.check_out_time else public.growing_attendance.check_out_time end
  returning * into v_attendance;

  insert into public.growing_kiosk_alerts (owner_id, student_id, kind, date, time)
  values (v_owner_id, p_student_id, p_kind, p_date, p_time)
  returning * into v_alert;

  return jsonb_build_object(
    'attendance', to_jsonb(v_attendance),
    'alert', to_jsonb(v_alert)
  );
end;
$$;

revoke all on function public.growing_record_kiosk_event(uuid, uuid, date, text, text) from public, anon;
grant execute on function public.growing_record_kiosk_event(uuid, uuid, date, text, text) to authenticated;
