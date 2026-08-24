-- ============================================================
-- blocpanel — atomic building archive (P0.6 / P0.13)
-- Run in Supabase SQL Editor. Additive only.
--
-- Wraps buildings.is_archived + blocking all tenants in one transaction.
-- Previously these were two separate writes and the second (tenant block)
-- was not even error-checked — so a building could be left archived while
-- its tenants stayed approved (still had access). Called by blocpanel via
-- service_role after guard({ role: "superadmin" }).
-- ============================================================

CREATE OR REPLACE FUNCTION admin_archive_building(
  p_building_id uuid,
  p_reason      text DEFAULT NULL
)
RETURNS TABLE (building_name text, blocked_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name  text;
  v_count integer;
BEGIN
  SELECT b.name INTO v_name
  FROM buildings b
  WHERE b.id = p_building_id
  FOR UPDATE;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'building_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE buildings
    SET is_archived     = true,
        archived_at     = now(),
        archived_reason = COALESCE(p_reason, 'הושהה על ידי מנהל מערכת')
    WHERE id = p_building_id;

  UPDATE profiles
    SET approval_status = 'blocked'
    WHERE building_id = p_building_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  building_name := v_name;
  blocked_count := v_count;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION admin_archive_building(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_archive_building(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_archive_building(uuid, text) TO service_role;

COMMENT ON FUNCTION admin_archive_building(uuid, text) IS
  'Atomic building archive (is_archived + block all tenants) in one transaction. Called by blocpanel via service_role after guard() authorization.';
