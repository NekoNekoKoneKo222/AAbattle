-- Safe additive progression fields for CHAOS SHOGI.
ALTER TABLE chaos_profiles ADD COLUMN IF NOT EXISTS ultimate JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE chaos_profiles ADD COLUMN IF NOT EXISTS titles JSONB NOT NULL DEFAULT '{"owned":["rookie"],"equipped":"rookie"}'::jsonb;
ALTER TABLE chaos_profiles ADD COLUMN IF NOT EXISTS boss JSONB NOT NULL DEFAULT '{"clears":{},"duoClears":0,"claims":[]}'::jsonb;
