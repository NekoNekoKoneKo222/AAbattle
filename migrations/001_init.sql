-- ASCII BATTLE initial PostgreSQL schema.
-- Apply with a direct (not pooled) database connection as the database owner.
-- This migration creates tables and indexes only; it never drops existing data.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  username_key VARCHAR(64) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS fighters (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  art TEXT NOT NULL,
  definition JSONB NOT NULL,
  generation_mode VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  player_a UUID NOT NULL REFERENCES users(id),
  player_b UUID NOT NULL REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  transcript JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fighters_by_owner ON fighters(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS matches_by_a ON matches(player_a, created_at DESC);
CREATE INDEX IF NOT EXISTS matches_by_b ON matches(player_b, created_at DESC);
CREATE INDEX IF NOT EXISTS sessions_by_expiry ON sessions(expires_at);
