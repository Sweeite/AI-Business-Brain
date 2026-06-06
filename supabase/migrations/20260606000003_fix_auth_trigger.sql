-- Fix handle_new_user(): audit_log.target_id is uuid in the live DB,
-- not text as the initial migration comment suggested. Pass NEW.id directly.
-- Also backfills any auth.users rows that already exist without a public.users row.

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
  SELECT id INTO v_member_role_id FROM roles WHERE name = 'Member' LIMIT 1;

  IF v_member_role_id IS NULL THEN
    RAISE EXCEPTION 'handle_new_user: Member role not found — check seed data';
  END IF;

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO users (id, email, full_name, role_id)
  VALUES (NEW.id, NEW.email, v_full_name, v_member_role_id)
  ON CONFLICT (id) DO NOTHING;

  -- target_id is uuid in the live schema — pass NEW.id directly, no ::text cast
  INSERT INTO audit_log (action_type, actor_id, actor_type, target_type, target_id, metadata)
  VALUES (
    'consent_given',
    v_system_user_id,
    'system',
    'user',
    NEW.id,
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

-- Backfill: provision public.users rows for any auth.users that slipped through
-- before this fix (e.g. the first OAuth login).
DO $$
DECLARE
  v_member_role_id uuid;
  v_system_user_id uuid := '00000000-0000-0000-0000-000000000001';
  r record;
BEGIN
  SELECT id INTO v_member_role_id FROM roles WHERE name = 'Member' LIMIT 1;

  FOR r IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN public.users pu ON pu.id = au.id
    WHERE pu.id IS NULL
  LOOP
    INSERT INTO public.users (id, email, full_name, role_id)
    VALUES (
      r.id,
      r.email,
      COALESCE(
        r.raw_user_meta_data->>'full_name',
        r.raw_user_meta_data->>'name',
        split_part(r.email, '@', 1)
      ),
      v_member_role_id
    )
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO audit_log (action_type, actor_id, actor_type, target_type, target_id, metadata)
    VALUES (
      'consent_given',
      v_system_user_id,
      'system',
      'user',
      r.id,
      jsonb_build_object(
        'consent_version', '1.0',
        'user_email', r.email,
        'note', 'backfilled by migration 20260606000003'
      )
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;
