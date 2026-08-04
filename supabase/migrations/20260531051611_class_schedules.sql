alter table public.growing_classes
add column if not exists schedules jsonb not null default '[]'::jsonb;

update public.growing_classes
set schedules = (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', day_value,
        'startTime', start_time,
        'endTime', end_time
      )
    ),
    '[]'::jsonb
  )
  from unnest(days) as day_value
)
where schedules = '[]'::jsonb
  and days is not null
  and array_length(days, 1) > 0;;
