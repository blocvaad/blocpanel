-- ============================================================
-- blocpanel Schema — run in your bloc Supabase project
-- SQL Editor → New Query → Paste → Run
-- ============================================================

CREATE TABLE IF NOT EXISTS panel_admins (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name    TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('superadmin','admin','viewer')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  last_login   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panel_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID NOT NULL REFERENCES panel_admins(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panel_audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID REFERENCES panel_admins(id) ON DELETE SET NULL,
  admin_email TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  metadata    JSONB DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS panel_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  is_read     BOOLEAN DEFAULT false,
  entity_type TEXT,
  entity_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW panel_buildings_view AS
SELECT b.id, b.name, b.address, b.invite_code, b.is_active, b.created_at,
  COUNT(DISTINCT p.id) AS tenant_count,
  COUNT(DISTINCT CASE WHEN p.role='admin' THEN p.id END) AS admin_count,
  COUNT(DISTINCT CASE WHEN p.approval_status='pending' THEN p.id END) AS pending_count,
  COUNT(DISTINCT t.id) AS open_tickets,
  MAX(p.created_at) AS last_activity
FROM buildings b
LEFT JOIN profiles p ON p.building_id=b.id
LEFT JOIN tickets t ON t.building_id=b.id AND t.status NOT IN ('closed','resolved')
GROUP BY b.id;

CREATE OR REPLACE VIEW panel_tenants_view AS
SELECT p.id, p.building_id, b.name AS building_name, p.full_name, p.role, p.floor,
  p.approval_status, p.created_at,
  CASE WHEN p.hide_apartment=false THEN p.apartment::TEXT ELSE '🔒 מוסתר' END AS apartment_display,
  CASE WHEN p.hide_phone=false THEN CONCAT(SUBSTRING(p.phone,1,3),'***',RIGHT(p.phone,3)) ELSE '🔒 מוסתר' END AS phone_masked,
  p.hide_phone, p.hide_apartment, p.avatar_url
FROM profiles p LEFT JOIN buildings b ON b.id=p.building_id;

CREATE OR REPLACE VIEW panel_payments_view AS
SELECT pay.id, pay.building_id, b.name AS building_name, pay.amount, pay.currency,
  pay.status, pay.payment_method, pay.description, pay.created_at, pay.due_date,
  p.full_name AS tenant_name,
  CASE WHEN p.hide_apartment=false THEN p.apartment::TEXT ELSE '🔒' END AS apartment_display
FROM payments pay
LEFT JOIN buildings b ON b.id=pay.building_id
LEFT JOIN profiles p ON p.id=pay.user_id;

CREATE OR REPLACE VIEW panel_tickets_view AS
SELECT t.id, t.building_id, b.name AS building_name, t.title, t.description,
  t.status, t.priority, t.category, t.created_at, t.updated_at,
  p.full_name AS reporter_name,
  CASE WHEN p.hide_apartment=false THEN p.apartment::TEXT ELSE '🔒' END AS apartment_display
FROM tickets t
LEFT JOIN buildings b ON b.id=t.building_id
LEFT JOIN profiles p ON p.id=t.user_id;

CREATE OR REPLACE VIEW panel_stats_view AS
SELECT
  (SELECT COUNT(*) FROM buildings) AS total_buildings,
  (SELECT COUNT(*) FROM buildings WHERE is_active=true) AS active_buildings,
  (SELECT COUNT(*) FROM profiles) AS total_tenants,
  (SELECT COUNT(*) FROM profiles WHERE approval_status='pending') AS pending_approvals,
  (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed','resolved')) AS open_tickets,
  (SELECT COUNT(*) FROM payments WHERE status='paid' AND created_at>NOW()-INTERVAL '30 days') AS payments_30d,
  (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid' AND created_at>NOW()-INTERVAL '30 days') AS revenue_30d,
  (SELECT COUNT(*) FROM payments WHERE status='failed') AS failed_payments;

ALTER TABLE panel_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE panel_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no_public_access" ON panel_admins FOR ALL USING (false);
CREATE POLICY "no_public_access" ON panel_sessions FOR ALL USING (false);
CREATE POLICY "no_public_access" ON panel_audit_logs FOR ALL USING (false);
CREATE POLICY "no_public_access" ON panel_notifications FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS idx_panel_sessions_token ON panel_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_panel_sessions_admin ON panel_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_panel_audit_admin ON panel_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_panel_audit_created ON panel_audit_logs(created_at DESC);

-- ⚠️ SEED: uncomment after generating hash
-- node -e "require('bcryptjs').hash('YOUR_PASSWORD',12).then(console.log)"
-- INSERT INTO panel_admins (email,password_hash,full_name,role)
-- VALUES ('talyohala1@gmail.com','$2b$12$REPLACE_HASH','טל','superadmin');
