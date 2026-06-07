-- ── Configurable initial sync lookback window ────────────────────────────────
-- Controls how far back the initial Gmail and Drive sync reaches.
-- Default: 365 days. Adjust per client during provisioning.
-- Set to 0 to disable the lookback limit (sync all history — expensive).
INSERT INTO system_config (key, value, updated_by, updated_at)
VALUES (
  'initial_sync_lookback_days',
  '365',
  '00000000-0000-0000-0000-000000000001',
  now()
)
ON CONFLICT (key) DO NOTHING;
