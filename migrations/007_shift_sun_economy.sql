-- SHIFT ARENA solar economy and tutorial progression.
-- Additive migration only; preserves existing accounts, friends and characters.
ALTER TABLE shift_profiles
  ADD COLUMN IF NOT EXISTS economy jsonb NOT NULL DEFAULT '{}'::jsonb;
