-- CASTLE SHOGI (SHG) collection. Independent of CHAOS SHOGI inventories.
CREATE TABLE IF NOT EXISTS shg_profiles (
  user_id UUID PRIMARY KEY,
  coins INTEGER NOT NULL DEFAULT 900 CHECK (coins >= 0),
  shards INTEGER NOT NULL DEFAULT 0 CHECK (shards >= 0),
  pieces JSONB NOT NULL DEFAULT '{"slash":1,"guardian":1,"sniper":1}'::jsonb,
  mastery JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_day DATE,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);