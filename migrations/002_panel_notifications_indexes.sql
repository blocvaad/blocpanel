-- ============================================================
-- blocpanel — panel_notifications indexes (audit P0.9)
-- Additive only. Optional but recommended for the panel alert feed.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_panel_notifications_created
  ON panel_notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_notifications_unread
  ON panel_notifications(is_read) WHERE is_read = false;
