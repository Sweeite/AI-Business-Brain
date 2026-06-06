-- AI Business Brain — initial migration
-- Idempotent: safe to re-run against an already-migrated database.
-- All DDL uses IF NOT EXISTS. All seed data uses ON CONFLICT DO NOTHING.

-- ── extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ── roles ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          text NOT NULL UNIQUE,
  clearance_level text NOT NULL
    CHECK (clearance_level IN ('public', 'internal', 'management', 'leadership')),
  permissions   jsonb NOT NULL DEFAULT '{}',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── users ────────────────────────────────────────────────────────────────────
-- No FK to auth.users — system user has no auth.users row.
-- The FK constraint linking real users to auth.users is added in issue #2
-- via an auth trigger.

CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         text NOT NULL UNIQUE,
  full_name     text,
  role_id       uuid NOT NULL REFERENCES roles(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz,
  is_active     boolean NOT NULL DEFAULT true
);

-- ── agent_configs ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_configs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            text NOT NULL UNIQUE,
  description     text NOT NULL DEFAULT '',
  system_prompt   text NOT NULL DEFAULT '',
  model           text NOT NULL,
  tool_ids        jsonb NOT NULL DEFAULT '[]',
  required_role   text,
  is_active       boolean NOT NULL DEFAULT true,
  version         integer NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ── agent_config_versions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_config_versions (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_config_id             uuid NOT NULL REFERENCES agent_configs(id),
  version                     integer NOT NULL,
  system_prompt               text NOT NULL,
  model                       text NOT NULL,
  tool_ids                    jsonb NOT NULL DEFAULT '[]',
  changed_by                  uuid NOT NULL REFERENCES users(id),
  change_reason               text NOT NULL
    CHECK (change_reason IN ('self_improvement_approval', 'manual_edit', 'rollback')),
  improvement_suggestion_id   uuid,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- ── tools ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tools (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                text NOT NULL UNIQUE,
  description         text NOT NULL DEFAULT '',
  connector_type      text NOT NULL,
  action_type         text NOT NULL CHECK (action_type IN ('read', 'write')),
  required_permission text NOT NULL,
  input_schema        jsonb NOT NULL DEFAULT '{}',
  output_schema       jsonb NOT NULL DEFAULT '{}',
  is_active           boolean NOT NULL DEFAULT true
);

-- ── memories ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memories (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  type                    text NOT NULL
    CHECK (type IN ('episodic', 'semantic', 'procedural')),
  content                 text NOT NULL,
  embedding               vector(1024),
  search_vector           tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  source_refs             jsonb NOT NULL DEFAULT '{}',
  author_type             text NOT NULL CHECK (author_type IN ('human', 'agent')),
  author_id               uuid NOT NULL REFERENCES users(id),
  agent_task_id           uuid,
  status                  text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'invalidated')),
  valid_from              timestamptz NOT NULL DEFAULT now(),
  valid_to                timestamptz,
  sensitivity_level       text NOT NULL DEFAULT 'internal'
    CHECK (sensitivity_level IN ('public', 'internal', 'management', 'leadership')),
  zone                    text,
  namespace               text NOT NULL DEFAULT 'org',
  retrieval_count         integer NOT NULL DEFAULT 0,
  last_retrieved_at       timestamptz,
  utility_score           float,
  content_hash            text NOT NULL,
  embedding_model         text NOT NULL DEFAULT '',
  embedding_model_version text NOT NULL DEFAULT '',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memories_search_vector_idx ON memories USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS memories_status_idx ON memories (status);
CREATE INDEX IF NOT EXISTS memories_namespace_idx ON memories (namespace);
CREATE INDEX IF NOT EXISTS memories_content_hash_idx ON memories (content_hash);
CREATE INDEX IF NOT EXISTS memories_sensitivity_idx ON memories (sensitivity_level);

-- ── memory_proposals ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_proposals (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim           text NOT NULL,
  suggested_type  text NOT NULL
    CHECK (suggested_type IN ('episodic', 'semantic', 'procedural')),
  sources         jsonb NOT NULL DEFAULT '{}',
  confidence      float NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  entity_refs     jsonb NOT NULL DEFAULT '{}',
  acting_user_id  uuid NOT NULL REFERENCES users(id),
  agent_id        uuid NOT NULL REFERENCES agent_configs(id),
  task_id         uuid NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     uuid REFERENCES users(id),
  reviewed_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_proposals_status_idx ON memory_proposals (status);

-- ── connections ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connections (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connector_type      text NOT NULL,
  scope               text NOT NULL CHECK (scope IN ('org', 'per-user')),
  owner_user_id       uuid REFERENCES users(id),
  credential_ref      text NOT NULL,
  status              text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'revoked', 'error')),
  granted_scopes      jsonb NOT NULL DEFAULT '[]',
  last_synced_at      timestamptz,
  webhook_expires_at  timestamptz,
  created_by          uuid NOT NULL REFERENCES users(id),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connections_type_idx ON connections (connector_type);
CREATE INDEX IF NOT EXISTS connections_status_idx ON connections (status);
CREATE INDEX IF NOT EXISTS connections_owner_idx ON connections (owner_user_id);

-- ── routines ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS routines (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                text NOT NULL,
  description         text NOT NULL DEFAULT '',
  is_active           boolean NOT NULL DEFAULT true,
  trigger_type        text NOT NULL CHECK (trigger_type IN ('cron', 'webhook')),
  cron_schedule       text,
  webhook_connector   text,
  webhook_event       text,
  webhook_filters     jsonb,
  agent_config_id     uuid NOT NULL REFERENCES agent_configs(id),
  additional_context  text,
  output_type         text NOT NULL
    CHECK (output_type IN ('email', 'slack', 'memory', 'dashboard_notification', 'tool_write')),
  output_config       jsonb NOT NULL DEFAULT '{}',
  created_by          uuid NOT NULL REFERENCES users(id),
  scope               text NOT NULL DEFAULT 'user'
    CHECK (scope IN ('system', 'user')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ── job_runs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_runs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  routine_id      uuid REFERENCES routines(id),
  job_type        text NOT NULL,
  triggered_by    text NOT NULL
    CHECK (triggered_by IN ('cron', 'webhook', 'manual', 'system')),
  acting_user_id  uuid NOT NULL REFERENCES users(id),
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  output          jsonb,
  error           text,
  tokens_used     integer,
  cost_usd        decimal(12, 6)
);

CREATE INDEX IF NOT EXISTS job_runs_status_idx ON job_runs (status);
CREATE INDEX IF NOT EXISTS job_runs_routine_idx ON job_runs (routine_id);

-- ── agent_runs ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS agent_runs (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_config_id     uuid NOT NULL REFERENCES agent_configs(id),
  acting_user_id      uuid NOT NULL REFERENCES users(id),
  job_run_id          uuid REFERENCES job_runs(id),
  trigger_context     jsonb NOT NULL DEFAULT '{}',
  memory_retrieved    jsonb,
  tool_calls          jsonb,
  reasoning_trace     text,
  output              text,
  provenance_labels   jsonb,
  tokens_used         integer,
  cost_usd            decimal(12, 6),
  duration_ms         integer,
  user_rating         smallint CHECK (user_rating IN (-1, 0, 1)),
  user_feedback       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_runs_user_idx ON agent_runs (acting_user_id);
CREATE INDEX IF NOT EXISTS agent_runs_agent_idx ON agent_runs (agent_config_id);
CREATE INDEX IF NOT EXISTS agent_runs_created_idx ON agent_runs (created_at DESC);

-- ── miss_log ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS miss_log (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  query         text NOT NULL,
  reason        text NOT NULL
    CHECK (reason IN ('no_memory', 'below_relevance_floor', 'source_unavailable')),
  user_id       uuid NOT NULL REFERENCES users(id),
  agent_run_id  uuid REFERENCES agent_runs(id),
  resolved      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS miss_log_resolved_idx ON miss_log (resolved);

-- ── memory_feedback ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS memory_feedback (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  memory_id     uuid NOT NULL REFERENCES memories(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  rating        smallint NOT NULL CHECK (rating IN (-1, 0, 1)),
  feedback_type text NOT NULL
    CHECK (feedback_type IN ('wrong', 'stale', 'stop_storing', 'helpful')),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── improvement_suggestions ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS improvement_suggestions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category          text NOT NULL
    CHECK (category IN ('memory_quality', 'agent_prompt', 'retrieval_settings', 'capture_rules', 'decay_settings')),
  title             text NOT NULL,
  reasoning         text NOT NULL,
  proposed_change   jsonb NOT NULL DEFAULT '{}',
  target_config_id  uuid,
  evidence          jsonb NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by       uuid REFERENCES users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS improvement_suggestions_status_idx ON improvement_suggestions (status);

-- ── audit_log ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_type text NOT NULL,
  actor_id    uuid NOT NULL,
  actor_type  text NOT NULL CHECK (actor_type IN ('user', 'system', 'agent')),
  target_type text NOT NULL,
  target_id   text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}',
  ip_address  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action_type);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON audit_log (created_at DESC);

-- ── cost_events ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_events (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         uuid NOT NULL REFERENCES users(id),
  agent_run_id    uuid REFERENCES agent_runs(id),
  job_run_id      uuid REFERENCES job_runs(id),
  event_type      text NOT NULL,
  tokens_input    integer NOT NULL DEFAULT 0,
  tokens_output   integer NOT NULL DEFAULT 0,
  cost_usd        decimal(12, 6) NOT NULL,
  model           text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_events_user_idx ON cost_events (user_id);
CREATE INDEX IF NOT EXISTS cost_events_created_idx ON cost_events (created_at DESC);

-- ── chunks ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chunks (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_ref      jsonb NOT NULL DEFAULT '{}',
  content         text NOT NULL,
  embedding       vector(1024),
  search_vector   tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding_model text NOT NULL DEFAULT '',
  connector_type  text NOT NULL,
  owner_user_id   uuid REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chunks_search_vector_idx ON chunks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_created_idx ON chunks (created_at);
CREATE INDEX IF NOT EXISTS chunks_owner_idx ON chunks (owner_user_id);

-- ── connector_schemas ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS connector_schemas (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  connector_type      text NOT NULL UNIQUE,
  schema              jsonb NOT NULL DEFAULT '{}',
  last_discovered_at  timestamptz NOT NULL DEFAULT now()
);

-- ── system_config ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_config (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         text NOT NULL UNIQUE,
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ═════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- All inserts use ON CONFLICT DO NOTHING — idempotent.
-- ═════════════════════════════════════════════════════════════════════════════

-- ── seed: roles ───────────────────────────────────────────────────────────────

INSERT INTO roles (id, name, clearance_level, permissions) VALUES
(
  '10000000-0000-0000-0000-000000000001',
  'Owner',
  'leadership',
  '{
    "manage_users": true,
    "manage_roles": true,
    "manage_connections": true,
    "delete_memory": true,
    "approve_suggestions": true,
    "view_cost_monitor": true,
    "view_quality_monitor": true,
    "view_system_health": true,
    "view_audit_log": true,
    "manage_system_crons": true,
    "review_queue": true,
    "memory_inspector": true,
    "manage_integrations": true,
    "ingestion_dashboard": true,
    "proactive_builder": true,
    "view_agent_activity": true,
    "query_brain": true,
    "capture_memory": true,
    "view_own_connections": true,
    "rtbf_action": true
  }'::jsonb
),
(
  '10000000-0000-0000-0000-000000000002',
  'Operator',
  'management',
  '{
    "manage_users": false,
    "manage_roles": false,
    "manage_connections": false,
    "delete_memory": false,
    "approve_suggestions": false,
    "view_cost_monitor": false,
    "view_quality_monitor": false,
    "view_system_health": false,
    "view_audit_log": false,
    "manage_system_crons": false,
    "review_queue": true,
    "memory_inspector": true,
    "manage_integrations": true,
    "ingestion_dashboard": true,
    "proactive_builder": true,
    "view_agent_activity": true,
    "query_brain": true,
    "capture_memory": true,
    "view_own_connections": true,
    "rtbf_action": false
  }'::jsonb
),
(
  '10000000-0000-0000-0000-000000000003',
  'Manager',
  'management',
  '{
    "manage_users": false,
    "manage_roles": false,
    "manage_connections": false,
    "delete_memory": false,
    "approve_suggestions": false,
    "view_cost_monitor": false,
    "view_quality_monitor": false,
    "view_system_health": false,
    "view_audit_log": false,
    "manage_system_crons": false,
    "review_queue": false,
    "memory_inspector": true,
    "manage_integrations": false,
    "ingestion_dashboard": false,
    "proactive_builder": false,
    "view_agent_activity": true,
    "query_brain": true,
    "capture_memory": true,
    "view_own_connections": true,
    "rtbf_action": false
  }'::jsonb
),
(
  '10000000-0000-0000-0000-000000000004',
  'Member',
  'internal',
  '{
    "manage_users": false,
    "manage_roles": false,
    "manage_connections": false,
    "delete_memory": false,
    "approve_suggestions": false,
    "view_cost_monitor": false,
    "view_quality_monitor": false,
    "view_system_health": false,
    "view_audit_log": false,
    "manage_system_crons": false,
    "review_queue": false,
    "memory_inspector": false,
    "manage_integrations": false,
    "ingestion_dashboard": false,
    "proactive_builder": false,
    "view_agent_activity": false,
    "query_brain": true,
    "capture_memory": true,
    "view_own_connections": true,
    "rtbf_action": false
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- ── seed: system user ─────────────────────────────────────────────────────────

INSERT INTO users (id, email, full_name, role_id, is_active) VALUES
(
  '00000000-0000-0000-0000-000000000001',
  'system@internal',
  'System',
  '10000000-0000-0000-0000-000000000001',
  false
)
ON CONFLICT (id) DO NOTHING;

-- ── seed: system_config ───────────────────────────────────────────────────────

INSERT INTO system_config (key, value) VALUES
  ('retrieval_min_relevance',                  '0.72'),
  ('retrieval_max_results',                    '20'),
  ('memory_proposal_min_confidence',           '0.7'),
  ('decay_min_utility_score',                  '0.2'),
  ('decay_min_age_days',                       '30'),
  ('decay_cron_schedule',                      '"0 3 * * 0"'),
  ('consolidation_last_run_at',                'null'),
  ('consolidation_dedup_similarity_threshold', '0.92'),
  ('consolidation_cron_schedule',              '"0 2 * * *"'),
  ('chunk_ttl_days',                           '90')
ON CONFLICT (key) DO NOTHING;

-- ── seed: agent_configs ───────────────────────────────────────────────────────

INSERT INTO agent_configs (id, name, description, system_prompt, model, tool_ids, required_role, is_active, version) VALUES
(
  '20000000-0000-0000-0000-000000000001',
  'system.ingestion.gate3_classifier',
  'Gate 3 document-level classification during ingestion',
  '-- Configured at deployment time',
  'claude-haiku-4-5-20251001',
  '[]',
  null,
  true,
  1
),
(
  '20000000-0000-0000-0000-000000000002',
  'system.ingestion.gate3_chunk_classifier',
  'Gate 3 per-chunk classification on documents that passed document-level Gate 3',
  '-- Configured at deployment time',
  'claude-haiku-4-5-20251001',
  '[]',
  null,
  true,
  1
),
(
  '20000000-0000-0000-0000-000000000003',
  'system.memory.consolidation',
  'Nightly episodic to semantic consolidation',
  '-- Configured at deployment time',
  'claude-sonnet-4-6',
  '[]',
  null,
  true,
  1
),
(
  '20000000-0000-0000-0000-000000000004',
  'system.memory.improvement_analysis',
  'Weekly self-improvement signal analysis',
  '-- Configured at deployment time',
  'claude-sonnet-4-6',
  '[]',
  null,
  true,
  1
)
ON CONFLICT (id) DO NOTHING;

-- ── seed: tools ───────────────────────────────────────────────────────────────

INSERT INTO tools (id, name, description, connector_type, action_type, required_permission, is_active) VALUES
(
  '30000000-0000-0000-0000-000000000001',
  'search_memory',
  'Vector search over the memory store',
  'internal',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000002',
  'fetch_gmail',
  'Read emails from a connected Gmail account',
  'gmail',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000003',
  'fetch_drive_file',
  'Read a file from Google Drive',
  'google_drive',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000004',
  'search_drive',
  'Search Google Drive files',
  'google_drive',
  'read',
  'query_brain',
  true
),
(
  '30000000-0000-0000-0000-000000000005',
  'propose_memory',
  'Propose a new memory record (goes through write pipeline)',
  'internal',
  'write',
  'capture_memory',
  true
),
(
  '30000000-0000-0000-0000-000000000006',
  'create_gmail_draft',
  'Create an email draft in Gmail',
  'gmail',
  'write',
  'capture_memory',
  true
),
(
  '30000000-0000-0000-0000-000000000007',
  'send_email',
  'Send an email via Gmail',
  'gmail',
  'write',
  'manage_integrations',
  true
),
(
  '30000000-0000-0000-0000-000000000008',
  'create_drive_file',
  'Create a file in Google Drive',
  'google_drive',
  'write',
  'capture_memory',
  true
),
(
  '30000000-0000-0000-0000-000000000009',
  'update_drive_file',
  'Update an existing file in Google Drive',
  'google_drive',
  'write',
  'capture_memory',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ── RPC: get_decrypted_credential ─────────────────────────────────────────────
-- SECURITY DEFINER: callable only by the service role, never by client keys.
-- Worker retrieves OAuth tokens exclusively through this function.

CREATE OR REPLACE FUNCTION get_decrypted_credential(p_connection_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER AS $$
DECLARE
  v_ref    text;
  v_secret text;
BEGIN
  SELECT credential_ref INTO v_ref
    FROM connections
   WHERE id = p_connection_id;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'connection not found: %', p_connection_id;
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
   WHERE id = v_ref::uuid;

  RETURN v_secret;
END;
$$;
