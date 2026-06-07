-- ── Google Drive connector: system_config seed ──────────────────────────────
-- drive_webhook_channel_token: shared secret sent in every Drive watch
-- registration and verified on each incoming webhook notification.
-- Set this to a strong random value in Mission Control before enabling Drive.
INSERT INTO system_config (key, value, updated_by, updated_at)
VALUES (
  'drive_webhook_channel_token',
  '"REPLACE_WITH_SECRET"',
  '00000000-0000-0000-0000-000000000001',
  now()
)
ON CONFLICT (key) DO NOTHING;
