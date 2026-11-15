-- Cosmetics only. Card rules and ranked deck validation are unchanged.
ALTER TABLE chaos_profiles ADD COLUMN IF NOT EXISTS skins JSONB NOT NULL DEFAULT '{}'::jsonb;
