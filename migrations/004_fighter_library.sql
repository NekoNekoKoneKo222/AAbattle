-- Add personal favorites and reversible library removal without erasing battle or trade history.
ALTER TABLE fighters ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fighters ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS fighters_visible_by_owner
  ON fighters(owner_id, is_favorite DESC, created_at DESC) WHERE deleted_at IS NULL;
