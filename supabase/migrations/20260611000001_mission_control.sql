-- Issue #11 — RBAC + Mission Control: add RTBF columns to memories + seed cron config rows
-- Idempotent: safe to re-run.

-- ── 1. Add RTBF columns to memories ──────────────────────────────────────────

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS rtbf_flagged boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS rtbf_flagged_at timestamptz;

CREATE INDEX IF NOT EXISTS memories_rtbf_idx
  ON memories(author_id)
  WHERE rtbf_flagged = true;

-- ── 2. Seed system_config rows for cron schedules and active flags ────────────
-- Uses SYSTEM_USER_ID as updated_by for idempotent seed inserts.

INSERT INTO system_config (id, key, value, updated_by) VALUES
  (gen_random_uuid(), 'memory_proposal_drain_schedule', '"*/5 * * * *"'::jsonb,  '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'memory_proposal_drain_active',   'true'::jsonb,           '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'connector_sync_schedule',        '"*/15 * * * *"'::jsonb, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'connector_sync_active',          'true'::jsonb,           '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'token_refresh_schedule',         '"*/30 * * * *"'::jsonb, '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'token_refresh_active',           'true'::jsonb,           '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'drive_webhook_renew_schedule',   '"0 1 * * *"'::jsonb,    '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'drive_webhook_renew_active',     'true'::jsonb,           '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'decay_cron_active',              'true'::jsonb,           '00000000-0000-0000-0000-000000000001'),
  (gen_random_uuid(), 'consolidation_cron_active',      'true'::jsonb,           '00000000-0000-0000-0000-000000000001')
ON CONFLICT (key) DO NOTHING;
