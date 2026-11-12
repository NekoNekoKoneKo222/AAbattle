-- Additive ASCII BATTLE expansion. Existing users, fighters and history remain untouched.
CREATE TABLE IF NOT EXISTS fighter_awakening_seen (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fighter_id UUID NOT NULL REFERENCES fighters(id) ON DELETE CASCADE,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, fighter_id)
);
CREATE TABLE IF NOT EXISTS tournaments (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(60) NOT NULL,
  size SMALLINT NOT NULL CHECK (size IN (8,16,32)),
  status VARCHAR(12) NOT NULL CHECK (status IN ('open','running','complete','cancelled')),
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tournaments_status_created ON tournaments(status, created_at DESC);
CREATE TABLE IF NOT EXISTS tournament_rewards (
  tournament_id UUID NOT NULL REFERENCES tournaments(id),
  user_id UUID NOT NULL REFERENCES users(id),
  reward VARCHAR(30) NOT NULL,
  claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tournament_id, user_id, reward)
);
CREATE TABLE IF NOT EXISTS user_achievement_progress (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  equipped_title VARCHAR(40),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS user_titles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_id VARCHAR(40) NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, title_id)
);
