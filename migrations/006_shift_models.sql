CREATE TABLE IF NOT EXISTS shift_models (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  model_doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
