-- Additive CHAOS SHOGI card progression. Existing profiles remain valid.
ALTER TABLE chaos_profiles ADD COLUMN IF NOT EXISTS mastery JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE chaos_profiles ADD COLUMN IF NOT EXISTS awakened JSONB NOT NULL DEFAULT '[]'::jsonb;
