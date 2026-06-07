-- ── Vault credential RPC helpers ──────────────────────────────────────────────
-- Lock down get_decrypted_credential to service_role only.
-- Add store_credential and refresh_credential for writing/refreshing tokens.
-- All three are SECURITY DEFINER; raw tokens never travel through the app layer.

REVOKE EXECUTE ON FUNCTION get_decrypted_credential(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_decrypted_credential(uuid) TO   service_role;

-- store_credential: inserts a new vault secret and atomically writes the UUID
-- into connections.credential_ref. Called once per OAuth authorisation.
CREATE OR REPLACE FUNCTION store_credential(p_connection_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_vault_id uuid;
BEGIN
  INSERT INTO vault.secrets (secret, name)
  VALUES (p_token, 'connection:' || p_connection_id::text)
  RETURNING id INTO v_vault_id;

  UPDATE connections SET credential_ref = v_vault_id::text WHERE id = p_connection_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION store_credential(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION store_credential(uuid, text) TO   service_role;

-- refresh_credential: overwrites the vault secret value in-place.
-- The credential_ref UUID in connections is never modified.
CREATE OR REPLACE FUNCTION refresh_credential(p_connection_id uuid, p_new_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_ref text;
BEGIN
  SELECT credential_ref INTO v_ref FROM connections WHERE id = p_connection_id;
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'connection not found: %', p_connection_id;
  END IF;
  UPDATE vault.secrets SET secret = p_new_token WHERE id = v_ref::uuid;
END;
$$;

REVOKE EXECUTE ON FUNCTION refresh_credential(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION refresh_credential(uuid, text) TO   service_role;
