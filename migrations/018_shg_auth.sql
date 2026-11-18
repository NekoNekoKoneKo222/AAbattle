-- SHG account storage on the isolated Neon project.
-- Does not change AAbattle users/sessions or existing CSH data.
CREATE TABLE IF NOT EXISTS shg_players (
  id UUID PRIMARY KEY,
  username VARCHAR(32) NOT NULL,
  username_key VARCHAR(32) UNIQUE,
  password_hash TEXT,
  is_guest BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS shg_sessions (
  token_hash TEXT PRIMARY KEY,
  player_id UUID NOT NULL REFERENCES shg_players(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS shg_sessions_player_idx ON shg_sessions(player_id);
