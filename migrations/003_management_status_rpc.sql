-- ============================================================
-- blocpanel — atomic management-company status change (P0.6 / P0.13)
-- Run in Supabase SQL Editor. Additive only.
--
-- Wraps the two writes (management_companies.status + profiles.role) in one
-- transaction so a company can never be left half-changed (e.g. suspended
-- while the owner still has role=management). The panel calls this via
-- service_role AFTER the human authorization check in guard().
-- ============================================================

CREATE OR REPLACE FUNCTION admin_set_management_status(
  p_company_id  uuid,
  p_new_status  text,
  p_new_role    text,
  p_reason      text DEFAULT NULL
)
RETURNS TABLE (owner_id uuid, company_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_name  text;
BEGIN
  IF p_new_status NOT IN ('active','rejected','suspended') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF p_new_role NOT IN ('management','tenant') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  SELECT mc.owner_id, mc.name INTO v_owner, v_name
  FROM management_companies mc
  WHERE mc.id = p_company_id
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'company_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE management_companies
    SET status = p_new_status,
        reject_reason = COALESCE(p_reason, reject_reason)
    WHERE id = p_company_id;

  UPDATE profiles
    SET role = p_new_role
    WHERE id = v_owner;

  owner_id := v_owner;
  company_name := v_name;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION admin_set_management_status(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_set_management_status(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION admin_set_management_status(uuid, text, text, text) TO service_role;

COMMENT ON FUNCTION admin_set_management_status(uuid, text, text, text) IS
  'Atomic management-company status change (status + owner role) in one transaction. Called by blocpanel via service_role after guard() authorization.';
