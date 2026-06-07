-- ── Gmail connector: schema additions + enqueue helper ─────────────────────

-- Connector-specific sync cursor (e.g. Gmail historyId, Drive pageToken).
ALTER TABLE connections ADD COLUMN IF NOT EXISTS sync_cursor jsonb DEFAULT '{}';

-- Gate 1 exclusion rules stored per-connection.
-- Format: [{ "type": "email"|"domain", "value": "..." }]
ALTER TABLE connections ADD COLUMN IF NOT EXISTS exclusion_rules jsonb DEFAULT '[]';

-- enqueue_job: lets the app service insert pg-boss jobs via service_role RPC.
-- The app has no DATABASE_URL, so it can't use pg-boss directly. This function
-- wraps the pgboss.job insert so the webhook handler stays dependency-free.
CREATE OR REPLACE FUNCTION enqueue_job(p_name text, p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO pgboss.job (name, data)
  VALUES (p_name, p_data)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION enqueue_job(text, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION enqueue_job(text, jsonb) TO service_role;
