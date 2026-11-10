-- SHIFT ARENA data lives beside, but does not alter, AAbattle accounts.
CREATE TABLE IF NOT EXISTS shift_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  selected_character text NOT NULL DEFAULT 'rei',
  owned_characters text[] NOT NULL DEFAULT ARRAY['rei']::text[],
  credits integer NOT NULL DEFAULT 0 CHECK (credits >= 0),
  prestige integer NOT NULL DEFAULT 0 CHECK (prestige >= 0),
  road_target text NOT NULL DEFAULT 'gald',
  loadouts jsonb NOT NULL DEFAULT '{}'::jsonb,
  mastery jsonb NOT NULL DEFAULT '{}'::jsonb,
  missions jsonb NOT NULL DEFAULT '{}'::jsonb,
  mission_day date,
  first_win_day date,
  solo_day date,
  solo_count integer NOT NULL DEFAULT 0 CHECK (solo_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shift_reward_transactions (
  match_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits integer NOT NULL CHECK (credits >= 0),
  mastery_xp integer NOT NULL CHECK (mastery_xp >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(match_id,user_id)
);
CREATE INDEX IF NOT EXISTS shift_reward_user_time ON shift_reward_transactions(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS shift_friend_requests (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS shift_friend_requests_recipient ON shift_friend_requests(recipient_id,status,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS shift_one_pending_request ON shift_friend_requests(sender_id,recipient_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS shift_friendships (
  user_low uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_low,user_high),
  CHECK (user_low < user_high)
);
CREATE INDEX IF NOT EXISTS shift_friendships_high ON shift_friendships(user_high);
CREATE TABLE IF NOT EXISTS shift_blocks (
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(owner_id,target_id),
  CHECK (owner_id <> target_id)
);
