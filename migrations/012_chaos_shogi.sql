-- CHAOS SHOGI phase 8. Existing AAbattle accounts and game data are unchanged.
CREATE TABLE IF NOT EXISTS chaos_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  coins INTEGER NOT NULL DEFAULT 500 CHECK (coins >= 0),
  shards INTEGER NOT NULL DEFAULT 0 CHECK (shards >= 0),
  cards JSONB NOT NULL DEFAULT '{}'::jsonb,
  decks JSONB NOT NULL DEFAULT '[]'::jsonb,
  pulls JSONB NOT NULL DEFAULT '[]'::jsonb,
  matches JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  daily_day DATE,
  battle_reward_day DATE,
  battle_reward_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
