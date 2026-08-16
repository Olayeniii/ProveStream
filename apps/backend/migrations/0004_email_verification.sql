-- Without this, "verified" was only a point-in-time gate at login with no
-- persisted trace. Pre-existing rows get NULL, correctly reflecting they
-- predate real OTP verification (see POST /api/auth/email/complete).
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
