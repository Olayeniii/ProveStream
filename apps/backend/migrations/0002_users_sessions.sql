-- Real backend-issued sessions, replacing the single shared ADMIN_TOKEN
-- checked by string-equality on every request. `role` drives `requireRole`
-- in server.ts. `email` is the identity ProveStream already uses elsewhere
-- (the Circle embedded-wallet flow treats the typed email as the Circle
-- userId directly, per docs/decisions.md) — a user upserts here the first
-- time they log in for a given role, so a role change just overwrites it
-- (no stronger guarantee than today's unverified-email login already has).

CREATE TABLE users (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'auditor', 'supplier')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tokens are stored hashed (sha256), never in plaintext — a DB dump alone
-- can't be replayed as a live session. Role is looked up fresh via the join
-- to `users` on every request rather than denormalized onto the session
-- row, so a role change takes effect immediately without hunting down and
-- revoking existing sessions.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
