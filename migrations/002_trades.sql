-- ASCII BATTLE player-to-player AA character trading.
-- Apply once as the database owner through a direct (non-pooler) connection.
-- Additive migration: existing users, fighters and match records are untouched.

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES users(id),
  recipient_id UUID NOT NULL REFERENCES users(id),
  offered_fighter_id UUID NOT NULL REFERENCES fighters(id),
  requested_fighter_id UUID NOT NULL REFERENCES fighters(id),
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  decided_at TIMESTAMPTZ,
  CONSTRAINT trades_distinct_users CHECK (sender_id <> recipient_id),
  CONSTRAINT trades_distinct_fighters CHECK (offered_fighter_id <> requested_fighter_id),
  CONSTRAINT trades_valid_status CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS trades_by_sender ON trades(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS trades_by_recipient ON trades(recipient_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS trades_unique_pending_offer ON trades(sender_id, recipient_id, offered_fighter_id, requested_fighter_id) WHERE status = 'pending';

GRANT SELECT, INSERT, UPDATE, DELETE ON trades TO aabattle_app;
