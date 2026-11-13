CREATE TABLE IF NOT EXISTS draw_characters (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  visibility VARCHAR(16) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','public')),
  copy_allowed BOOLEAN NOT NULL DEFAULT FALSE,
  favorite BOOLEAN NOT NULL DEFAULT FALSE,
  tags TEXT[] NOT NULL DEFAULT '{}',
  original_author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  current_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS draw_versions (
  id UUID PRIMARY KEY,
  character_id UUID NOT NULL REFERENCES draw_characters(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  project JSONB NOT NULL,
  png_data TEXT NOT NULL,
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (character_id,version_number)
);
CREATE INDEX IF NOT EXISTS draw_characters_owner ON draw_characters(owner_id,updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS draw_characters_public ON draw_characters(updated_at DESC) WHERE visibility='public' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS draw_battles (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  creator_id UUID NOT NULL REFERENCES users(id),
  a_version_id UUID NOT NULL REFERENCES draw_versions(id),
  b_version_id UUID NOT NULL REFERENCES draw_versions(id),
  mode VARCHAR(16) NOT NULL,
  stage VARCHAR(80) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'judging',
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  recovery_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS draw_battles_creator ON draw_battles(creator_id,created_at DESC);

CREATE TABLE IF NOT EXISTS draw_rooms (
  id UUID PRIMARY KEY,
  code VARCHAR(8) UNIQUE NOT NULL,
  host_id UUID NOT NULL REFERENCES users(id),
  guest_id UUID REFERENCES users(id),
  host_character_id UUID REFERENCES draw_characters(id),
  guest_character_id UUID REFERENCES draw_characters(id),
  host_ready BOOLEAN NOT NULL DEFAULT FALSE,
  guest_ready BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(16) NOT NULL DEFAULT 'waiting',
  battle_id UUID REFERENCES draw_battles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS draw_rooms_host ON draw_rooms(host_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS draw_ai_usage (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind VARCHAR(16) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS draw_ai_usage_recent ON draw_ai_usage(user_id,kind,created_at DESC);

CREATE TABLE IF NOT EXISTS draw_analysis_cache (
  cache_key CHAR(64) PRIMARY KEY,
  analysis JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
