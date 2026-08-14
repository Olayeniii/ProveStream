-- Risk analyses were deliberately left in-memory only in 0001_init.sql (see
-- that migration's comment) on the assumption they're "cheap to rederive on
-- boot" — in practice nothing re-runs analysis for already-attested items
-- after a restart, so every restart silently wiped real AI scores. Moving
-- them to Postgres like everything else.
CREATE TABLE risk_analyses (
  attestation_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
  score INTEGER,
  confidence INTEGER,
  summary TEXT,
  provider TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
