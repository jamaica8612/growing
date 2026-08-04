-- Remove the permissive open_all (public, USING true / WITH CHECK true) policies
-- that overrode the per-user quickflex RLS policies and exposed all driver data
-- to anyone holding the public anon key. The proper own/admin policies already
-- exist on these tables and take effect once open_all is gone. quickflex_data
-- keeps its dedicated anon own-row policies for the single legacy app row.
drop policy if exists "open_all" on public.quickflex_route_rates;
drop policy if exists "open_all" on public.quickflex_day_records;
drop policy if exists "open_all" on public.quickflex_day_route_items;
drop policy if exists "open_all" on public.quickflex_data;;
