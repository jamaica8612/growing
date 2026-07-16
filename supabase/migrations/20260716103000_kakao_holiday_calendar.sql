alter table public.growing_settings
  add column if not exists holiday_auto_close boolean not null default true,
  add column if not exists calendar_exceptions jsonb not null default '[]'::jsonb;

alter table public.growing_settings
  drop constraint if exists growing_settings_calendar_exceptions_array;

alter table public.growing_settings
  add constraint growing_settings_calendar_exceptions_array
  check (
    jsonb_typeof(calendar_exceptions) = 'array'
    and jsonb_array_length(calendar_exceptions) <= 500
    and pg_column_size(calendar_exceptions) <= 131072
  );

comment on column public.growing_settings.holiday_auto_close is
  'When true, Korean public holidays are treated as academy closure days.';

comment on column public.growing_settings.calendar_exceptions is
  'Per-date overrides: [{"date":"YYYY-MM-DD","kind":"closed|open","title":"..."}].';
