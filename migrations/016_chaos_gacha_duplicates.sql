-- Gacha duplicate counts persist independently from inventory / shard conversion.
ALTER TABLE chaos_profiles ADD COLUMN IF NOT EXISTS duplicate_counts JSONB NOT NULL DEFAULT '{}'::jsonb;
