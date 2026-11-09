-- Additive migration for server-authoritative solo PvE match history.
-- Apply as a database owner through a direct (non-pooler) connection.

CREATE TABLE IF NOT EXISTS pve_matches (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fighter_id UUID NOT NULL REFERENCES fighters(id),
  fighter_name VARCHAR(64) NOT NULL,
  enemy_key VARCHAR(16) NOT NULL,
  enemy_name VARCHAR(64) NOT NULL,
  won BOOLEAN NOT NULL,
  turns INTEGER NOT NULL CHECK (turns BETWEEN 1 AND 48),
  transcript JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pve_valid_difficulty CHECK (enemy_key IN ('easy', 'normal', 'hard', 'boss'))
);

CREATE INDEX IF NOT EXISTS pve_matches_by_user ON pve_matches(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pve_matches_by_difficulty ON pve_matches(user_id, enemy_key, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON pve_matches TO aabattle_app;
