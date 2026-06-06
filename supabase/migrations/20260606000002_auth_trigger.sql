-- ── Auth trigger: auto-provision public.users on first login ──────────────────
--
-- Fires on every INSERT into auth.users (Supabase Auth).
-- Creates the matching public.users row with the default Member role and logs
-- consent to audit_log using the system user as actor.
--
-- Idempotent: INSERT … ON CONFLICT (id) DO NOTHING means re-running the
-- migration (or a user signing in twice) is safe.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_role_id  uuid;
  v_system_user_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_consent_version text := '1.0';
  v_full_name       text;
BEGIN
  -- Resolve Member role (seeded in the initial migration)
  SELECT id INTO v_member_role_id FROM roles WHERE name = 'Member' LIMIT 1;

  IF v_member_role_id IS NULL THEN
    RAISE EXCEPTION 'handle_new_user: Member role not found — check seed data';
  END IF;

  -- Derive display name from OAuth metadata or fall back to email prefix
  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Provision the public user row
  INSERT INTO users (id, email, full_name, role_id)
  VALUES (NEW.id, NEW.email, v_full_name, v_member_role_id)
  ON CONFLICT (id) DO NOTHING;

  -- Log consent: what the brain extracts, what's excluded, who can see what
  INSERT INTO audit_log (action_type, actor_id, actor_type, target_type, target_id, metadata)
  VALUES (
    'consent_given',
    v_system_user_id,
    'system',
    'user',
    NEW.id::text,
    jsonb_build_object(
      'consent_version', v_consent_version,
      'user_email',      NEW.email,
      'extracts',        'emails, drive files, manual memory captures',
      'excludes',        'calendar invites, personal photos, external-domain emails',
      'visibility',      'role-based clearance ladder controls who can query each memory'
    )
  );

  RETURN NEW;
END;
$$;

-- Wire the trigger (drop first so re-running the migration is idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
