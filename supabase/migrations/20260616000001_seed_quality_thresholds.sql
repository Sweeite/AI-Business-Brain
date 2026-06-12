-- Seed system_config keys for Quality Monitor alert thresholds (issue #20)
INSERT INTO system_config (id, key, value, updated_by, updated_at)
VALUES
  (gen_random_uuid(), 'quality_abstention_drop_threshold_pct', '20', '00000000-0000-0000-0000-000000000001', now()),
  (gen_random_uuid(), 'quality_low_rating_alert_pct',          '30', '00000000-0000-0000-0000-000000000001', now()),
  (gen_random_uuid(), 'quality_miss_daily_alert_count',        '10', '00000000-0000-0000-0000-000000000001', now()),
  (gen_random_uuid(), 'quality_unused_memory_alert_pct',       '70', '00000000-0000-0000-0000-000000000001', now())
ON CONFLICT (key) DO NOTHING;
