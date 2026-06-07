-- Fix store_credential and refresh_credential to use Supabase Vault's public API
-- (vault.create_secret / vault.update_secret) instead of raw INSERT INTO vault.secrets.
-- The raw INSERT bypasses pgsodium encryption and fails with 'permission denied for
-- function _crypto_aead_det_noncegen'.

CREATE OR REPLACE FUNCTION store_credential(p_connection_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_vault_id uuid;
BEGIN
  SELECT vault.create_secret(
    p_token,
    'connection:' || p_connection_id::text
  ) INTO v_vault_id;

  UPDATE connections SET credential_ref = v_vault_id::text WHERE id = p_connection_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION store_credential(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION store_credential(uuid, text) TO service_role;

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
  PERFORM vault.update_secret(v_ref::uuid, p_new_token);
END;
$$;

REVOKE EXECUTE ON FUNCTION refresh_credential(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION refresh_credential(uuid, text) TO service_role;
