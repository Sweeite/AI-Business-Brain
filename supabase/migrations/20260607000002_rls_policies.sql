-- ── RLS helper functions ──────────────────────────────────────────────────────
-- SECURITY DEFINER + search_path lock prevents privilege escalation.
-- STABLE: Postgres caches the result per statement — safe for per-row RLS calls.

CREATE OR REPLACE FUNCTION user_role_name() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.name
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION user_clearance_level() RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE r.name
    WHEN 'Owner'    THEN 4
    WHEN 'Operator' THEN 3
    WHEN 'Manager'  THEN 3
    WHEN 'Member'   THEN 2
    ELSE 0
  END
  FROM public.users u
  JOIN public.roles r ON r.id = u.role_id
  WHERE u.id = auth.uid()
$$;

-- IMMUTABLE: pure mapping, no DB access.
CREATE OR REPLACE FUNCTION sensitivity_to_level(s text) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s
    WHEN 'public'     THEN 1
    WHEN 'internal'   THEN 2
    WHEN 'management' THEN 3
    WHEN 'leadership' THEN 4
    ELSE 5  -- fail-closed: unknown level is above everything
  END
$$;

REVOKE EXECUTE ON FUNCTION user_role_name()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION user_clearance_level()     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION user_role_name()           TO authenticated;
GRANT  EXECUTE ON FUNCTION user_clearance_level()     TO authenticated;
GRANT  EXECUTE ON FUNCTION sensitivity_to_level(text) TO authenticated;

-- ── Enable RLS on all tables ──────────────────────────────────────────────────
-- Enabling on an already-enabled table is a no-op — safe to re-run.

ALTER TABLE roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_configs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_config_versions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE memories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_proposals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE routines                ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_runs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE miss_log                ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE improvement_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log               ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_schemas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_config           ENABLE ROW LEVEL SECURITY;

-- ── Policies ──────────────────────────────────────────────────────────────────
-- Service role bypasses RLS — policies only constrain authenticated/anon keys.
-- All policies implicitly require auth.uid() IS NOT NULL (no anon access).
-- DROP IF EXISTS before each CREATE makes this idempotent.

-- ── roles ─────────────────────────────────────────────────────────────────────
-- Lookup table: read-only for everyone, no client writes.

DROP POLICY IF EXISTS "roles_select" ON roles;
CREATE POLICY "roles_select" ON roles
  FOR SELECT TO authenticated USING (true);

-- ── users ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "users_select" ON users;
CREATE POLICY "users_select" ON users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR user_role_name() IN ('Owner', 'Operator'));

DROP POLICY IF EXISTS "users_update" ON users;
CREATE POLICY "users_update" ON users
  FOR UPDATE TO authenticated
  USING    (id = auth.uid() OR user_role_name() = 'Owner')
  WITH CHECK (id = auth.uid() OR user_role_name() = 'Owner');

-- ── agent_configs ─────────────────────────────────────────────────────────────
-- App reads agent configs when building executeAgent calls.

DROP POLICY IF EXISTS "agent_configs_select" ON agent_configs;
CREATE POLICY "agent_configs_select" ON agent_configs
  FOR SELECT TO authenticated USING (true);

-- ── agent_config_versions ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "agent_config_versions_select" ON agent_config_versions;
CREATE POLICY "agent_config_versions_select" ON agent_config_versions
  FOR SELECT TO authenticated USING (true);

-- ── tools ─────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tools_select" ON tools;
CREATE POLICY "tools_select" ON tools
  FOR SELECT TO authenticated USING (true);

-- ── memories ──────────────────────────────────────────────────────────────────
-- Clearance ladder: user must have at least the memory's sensitivity level.
-- All writes go through the worker (service_role) — no authenticated writes.

DROP POLICY IF EXISTS "memories_select" ON memories;
CREATE POLICY "memories_select" ON memories
  FOR SELECT TO authenticated
  USING (sensitivity_to_level(sensitivity_level) <= user_clearance_level());

-- ── memory_proposals ──────────────────────────────────────────────────────────
-- Users submit proposals; Operators review/approve them.

DROP POLICY IF EXISTS "memory_proposals_select" ON memory_proposals;
CREATE POLICY "memory_proposals_select" ON memory_proposals
  FOR SELECT TO authenticated
  USING (acting_user_id = auth.uid() OR user_role_name() IN ('Owner', 'Operator'));

DROP POLICY IF EXISTS "memory_proposals_insert" ON memory_proposals;
CREATE POLICY "memory_proposals_insert" ON memory_proposals
  FOR INSERT TO authenticated
  WITH CHECK (acting_user_id = auth.uid());

DROP POLICY IF EXISTS "memory_proposals_update" ON memory_proposals;
CREATE POLICY "memory_proposals_update" ON memory_proposals
  FOR UPDATE TO authenticated
  USING    (user_role_name() IN ('Owner', 'Operator'))
  WITH CHECK (user_role_name() IN ('Owner', 'Operator'));

-- ── connections ───────────────────────────────────────────────────────────────
-- per-user connections: visible to the owner and Operator+.
-- org-wide connections: visible to everyone (but only Operator+ can create them).

DROP POLICY IF EXISTS "connections_select" ON connections;
CREATE POLICY "connections_select" ON connections
  FOR SELECT TO authenticated
  USING (
    scope = 'org'
    OR owner_user_id = auth.uid()
    OR user_role_name() IN ('Owner', 'Operator')
  );

DROP POLICY IF EXISTS "connections_insert" ON connections;
CREATE POLICY "connections_insert" ON connections
  FOR INSERT TO authenticated
  WITH CHECK (
    (scope = 'per-user' AND owner_user_id = auth.uid())
    OR (scope = 'org'      AND user_role_name() IN ('Owner', 'Operator'))
  );

DROP POLICY IF EXISTS "connections_update" ON connections;
CREATE POLICY "connections_update" ON connections
  FOR UPDATE TO authenticated
  USING    (owner_user_id = auth.uid() OR user_role_name() IN ('Owner', 'Operator'))
  WITH CHECK (owner_user_id = auth.uid() OR user_role_name() IN ('Owner', 'Operator'));

DROP POLICY IF EXISTS "connections_delete" ON connections;
CREATE POLICY "connections_delete" ON connections
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR user_role_name() IN ('Owner', 'Operator'));

-- ── routines ──────────────────────────────────────────────────────────────────
-- Users manage their own routines; Manager+ can see all user routines.
-- System-scope routines are created by service_role only (enforced by WITH CHECK).

DROP POLICY IF EXISTS "routines_select" ON routines;
CREATE POLICY "routines_select" ON routines
  FOR SELECT TO authenticated
  USING (created_by = auth.uid() OR user_role_name() IN ('Owner', 'Operator', 'Manager'));

DROP POLICY IF EXISTS "routines_insert" ON routines;
CREATE POLICY "routines_insert" ON routines
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND scope = 'user');

DROP POLICY IF EXISTS "routines_update" ON routines;
CREATE POLICY "routines_update" ON routines
  FOR UPDATE TO authenticated
  USING    (created_by = auth.uid() OR user_role_name() IN ('Owner', 'Operator', 'Manager'))
  WITH CHECK (created_by = auth.uid() OR user_role_name() IN ('Owner', 'Operator', 'Manager'));

DROP POLICY IF EXISTS "routines_delete" ON routines;
CREATE POLICY "routines_delete" ON routines
  FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR user_role_name() IN ('Owner', 'Operator'));

-- ── job_runs ──────────────────────────────────────────────────────────────────
-- Written by the worker. Members see their own; Manager+ see all.

DROP POLICY IF EXISTS "job_runs_select" ON job_runs;
CREATE POLICY "job_runs_select" ON job_runs
  FOR SELECT TO authenticated
  USING (acting_user_id = auth.uid() OR user_role_name() IN ('Owner', 'Operator', 'Manager'));

-- ── agent_runs ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "agent_runs_select" ON agent_runs;
CREATE POLICY "agent_runs_select" ON agent_runs
  FOR SELECT TO authenticated
  USING (acting_user_id = auth.uid() OR user_role_name() IN ('Owner', 'Operator', 'Manager'));

-- ── miss_log ──────────────────────────────────────────────────────────────────
-- Internal quality signal. Operator+ only; Members only see "I don't know" in UI.

DROP POLICY IF EXISTS "miss_log_select" ON miss_log;
CREATE POLICY "miss_log_select" ON miss_log
  FOR SELECT TO authenticated
  USING (user_role_name() IN ('Owner', 'Operator'));

-- ── memory_feedback ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "memory_feedback_select" ON memory_feedback;
CREATE POLICY "memory_feedback_select" ON memory_feedback
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_role_name() IN ('Owner', 'Operator'));

DROP POLICY IF EXISTS "memory_feedback_insert" ON memory_feedback;
CREATE POLICY "memory_feedback_insert" ON memory_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ── improvement_suggestions ───────────────────────────────────────────────────
-- Written by the self-improvement agent (service_role).
-- Operator+ reads; Owner approves or rejects.

DROP POLICY IF EXISTS "improvement_suggestions_select" ON improvement_suggestions;
CREATE POLICY "improvement_suggestions_select" ON improvement_suggestions
  FOR SELECT TO authenticated
  USING (user_role_name() IN ('Owner', 'Operator'));

DROP POLICY IF EXISTS "improvement_suggestions_update" ON improvement_suggestions;
CREATE POLICY "improvement_suggestions_update" ON improvement_suggestions
  FOR UPDATE TO authenticated
  USING    (user_role_name() = 'Owner')
  WITH CHECK (user_role_name() = 'Owner');

-- ── audit_log ─────────────────────────────────────────────────────────────────
-- Written exclusively by service_role (trigger + worker). Read-only for Operator+.

DROP POLICY IF EXISTS "audit_log_select" ON audit_log;
CREATE POLICY "audit_log_select" ON audit_log
  FOR SELECT TO authenticated
  USING (user_role_name() IN ('Owner', 'Operator'));

-- ── cost_events ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "cost_events_select" ON cost_events;
CREATE POLICY "cost_events_select" ON cost_events
  FOR SELECT TO authenticated
  USING (user_role_name() IN ('Owner', 'Operator'));

-- ── chunks ────────────────────────────────────────────────────────────────────
-- owner_user_id = NULL means org-wide (from org-scoped connector), visible to all.
-- Per-user chunks visible to the owner and Manager+.

DROP POLICY IF EXISTS "chunks_select" ON chunks;
CREATE POLICY "chunks_select" ON chunks
  FOR SELECT TO authenticated
  USING (
    owner_user_id IS NULL
    OR owner_user_id = auth.uid()
    OR user_role_name() IN ('Owner', 'Operator', 'Manager')
  );

-- ── connector_schemas ─────────────────────────────────────────────────────────
-- Schema discovery metadata: read-only, visible to all.

DROP POLICY IF EXISTS "connector_schemas_select" ON connector_schemas;
CREATE POLICY "connector_schemas_select" ON connector_schemas
  FOR SELECT TO authenticated USING (true);

-- ── system_config ─────────────────────────────────────────────────────────────
-- All authenticated can read (agents need config at query time via app layer).
-- Only Owner can update via Mission Control UI.

DROP POLICY IF EXISTS "system_config_select" ON system_config;
CREATE POLICY "system_config_select" ON system_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "system_config_update" ON system_config;
CREATE POLICY "system_config_update" ON system_config
  FOR UPDATE TO authenticated
  USING    (user_role_name() = 'Owner')
  WITH CHECK (user_role_name() = 'Owner');
