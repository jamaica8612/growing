ALTER TABLE recipes ADD COLUMN share_code TEXT UNIQUE DEFAULT NULL;
CREATE INDEX recipes_share_code_idx ON recipes (share_code) WHERE share_code IS NOT NULL;;
