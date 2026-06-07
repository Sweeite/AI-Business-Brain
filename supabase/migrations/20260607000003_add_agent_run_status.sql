ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'failed'));
