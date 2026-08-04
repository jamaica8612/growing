do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingest-orders-every-10min') then
    perform cron.unschedule('ingest-orders-every-10min');
  end if;
end$$;

select cron.schedule(
  'ingest-orders-every-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://xrrdokcjhjqdfvwtbenl.supabase.co/functions/v1/ingest-orders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'INGEST_CRON_TOKEN' limit 1)
    ),
    body := '{}'::jsonb
  );
  $$
);;
