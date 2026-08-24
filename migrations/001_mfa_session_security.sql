-- ============================================================
-- blocpanel — MFA assurance + session revocation (audit P0.2 / P0.4)
-- Run in Supabase SQL Editor. Additive only — no data loss.
-- ============================================================

-- panel_admins: OTP + last-2FA columns the 2FA route already writes to.
ALTER TABLE panel_admins ADD COLUMN IF NOT EXISTS otp_code    TEXT;
ALTER TABLE panel_admins ADD COLUMN IF NOT EXISTS otp_expires TIMESTAMPTZ;
ALTER TABLE panel_admins ADD COLUMN IF NOT EXISTS last_2fa    TIMESTAMPTZ;

-- panel_sessions: assurance level + revocation + mfa timestamp.
ALTER TABLE panel_sessions ADD COLUMN IF NOT EXISTS auth_level      TEXT NOT NULL DEFAULT 'pre_mfa'
  CHECK (auth_level IN ('pre_mfa','mfa'));
ALTER TABLE panel_sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;
ALTER TABLE panel_sessions ADD COLUMN IF NOT EXISTS revoked_at      TIMESTAMPTZ;

-- Fast lookup for the live-session check in requireFullSession().
CREATE INDEX IF NOT EXISTS idx_panel_sessions_active
  ON panel_sessions(token_hash) WHERE revoked_at IS NULL;

-- Safety: any session that predates this migration has no MFA assurance.
-- Revoke them so every admin re-authenticates through the new MFA flow once.
UPDATE panel_sessions SET revoked_at = now()
  WHERE revoked_at IS NULL AND auth_level = 'pre_mfa';
