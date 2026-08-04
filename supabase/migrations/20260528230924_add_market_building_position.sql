
ALTER TABLE rn_market_buildings
  ADD COLUMN IF NOT EXISTS pos_lat NUMERIC,
  ADD COLUMN IF NOT EXISTS pos_lng NUMERIC,
  ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT '🏬';

UPDATE rn_market_buildings SET icon = CASE code
  WHEN 'cheonggwamul' THEN '🍎'
  WHEN 'mubaechu' THEN '🥬'
  WHEN 'yangnyeom' THEN '🌶️'
  WHEN 'hwahwe' THEN '🌸'
  ELSE '🏬' END WHERE icon IS NULL OR icon = '🏬';
;
