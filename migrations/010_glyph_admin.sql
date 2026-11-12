CREATE TABLE IF NOT EXISTS glyph_world_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  source TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS glyph_announcements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message VARCHAR(500) NOT NULL,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS glyph_announcements_recent ON glyph_announcements (created_at DESC);
