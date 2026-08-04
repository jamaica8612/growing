do $$ begin
  if not exists (select from pg_policies where tablename='rn_market_buildings' and policyname='rn_market_buildings_write') then
    execute 'create policy rn_market_buildings_write on public.rn_market_buildings for update using (true) with check (true)';
  end if;
end $$;;
