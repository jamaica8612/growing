ALTER TABLE fridge_items
  ADD COLUMN is_shopping BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX fridge_items_shopping_idx ON fridge_items (user_id, is_shopping)
  WHERE is_shopping = TRUE;;
